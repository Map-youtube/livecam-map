// ─────────────────────────────────────────────────────────────
// POST /api/translate — 사용자 화면용 동적 문자열(도시/장소명/태그) 자동 번역
//
// 요청: { texts: string[], target: "<locale>" }
// 응답: { ok: true, map: { "<원문>": "<번역>", ... } }
//
// 동작:
//   1) target 이 한국어("ko")거나 키 없음 → 원문 그대로 반환(번역 불필요).
//   2) Firestore `translations` 캐시에서 (target, 원문) 조회 → 있으면 재사용(0비용).
//   3) 캐시에 없는 것만 OpenAI(gpt-4.1-mini)로 한 번에 번역 → 캐시에 저장.
//
// ⚠️ 비용 방어: 같은 (문자열, 언어) 조합은 최초 1회만 번역되고 이후 영구 캐시.
//    한 요청당 최대 MAX_TEXTS 개, 각 문자열 MAX_LEN 자로 제한.
// ⚠️ AI_API_KEY 는 서버 전용. 키 없거나 실패 시 원문을 그대로 반환(화면은 안 깨짐).
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { SUPPORTED_CODES } from "@/lib/i18n/languages";

const AI_MODEL = "gpt-4.1-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MAX_TEXTS = 120; // 한 요청 최대 문자열 수
const MAX_LEN = 200; // 문자열당 최대 길이(자)
const CHUNK_SIZE = 20; // OpenAI 1회 호출당 번역 문자열 수 (작게 나눠 신뢰도↑)
const COLLECTION = "translations";

// locale 코드 → OpenAI 프롬프트에 넣을 영어 언어명
const LANGUAGE_NAME = {
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  hi: "Hindi",
  bn: "Bengali",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ar: "Arabic",
  fa: "Persian",
};

// (target, 원문) → Firestore 문서 id (해시로 안전한 id 생성)
function cacheDocId(target, text) {
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return `${target}_${hash}`;
}

// ─── OpenAI 1회 호출 (원문 배열 → { 원문: 번역 } 맵) ───────────
// ⚠️ 배열 인덱스 정렬에 의존하지 않고 "원문을 키로 한 객체"로 응답받아,
//    모델이 순서를 바꾸거나 개수가 어긋나도 정확히 매칭되게 한다(정렬 오차 방지).
//    (배열 형식으로 오면 인덱스 매칭으로 보조 처리)
async function callOpenAiTranslate(apiKey, texts, target) {
  const langName = LANGUAGE_NAME[target] || target;
  const systemPrompt =
    `You are a translator for a travel/livecam map website. Translate each string in the ` +
    `input array (place names, city names, or short tags, mostly Korean) into ${langName}. ` +
    `ALWAYS translate — never leave a value in the original language; use the conventional ` +
    `local exonym/transliteration when one exists. Return ONLY a JSON object of the form ` +
    `{"result": {"<original>": "<translation>"}} that contains EVERY input string as a key ` +
    `with its ${langName} translation as the value. No extra text.`;
  const userPrompt = JSON.stringify({ input: texts });

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `OpenAI 번역 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
  if (!content) throw new Error("OpenAI 응답에 content 없음");

  const parsed = JSON.parse(content);
  const out = {};
  const result = parsed && parsed.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    // 객체 형식({원문: 번역}) — 원문 키로 정확히 매칭
    for (const src of texts) {
      const v = result[src];
      if (typeof v === "string" && v.trim()) out[src] = v.trim();
    }
  } else if (Array.isArray(result)) {
    // 배열 형식 — 인덱스 매칭으로 보조 처리
    result.forEach((v, i) => {
      if (typeof v === "string" && v.trim() && texts[i] != null) {
        out[texts[i]] = v.trim();
      }
    });
  } else {
    throw new Error("번역 결과(result) 형식 오류");
  }
  return out;
}

// ─── 청크 1개 번역 (실패/누락 시 1회 재시도) ──────────────────
// 반환: { 원문: 번역 } (번역된 것만 포함). 두 번 시도해도 전부 실패하면 빈 객체.
async function translateChunk(apiKey, texts, target) {
  let best = {};
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await callOpenAiTranslate(apiKey, texts, target);
      // 더 많이 번역된 결과를 채택
      if (Object.keys(out).length > Object.keys(best).length) best = out;
      // 전부 번역됐으면 재시도 불필요
      if (Object.keys(best).length >= texts.length) return best;
    } catch (error) {
      console.error(
        `[translate] 청크 번역 시도 ${attempt} 실패:`,
        error && error.message
      ); // TODO: 배포 전 제거
    }
  }
  return best;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const target = typeof body.target === "string" ? body.target.trim() : "";
    let texts = Array.isArray(body.texts) ? body.texts : [];

    // 입력 정리: 문자열만, 공백 제거, 길이 제한, 중복 제거, 개수 제한
    const uniqueSet = new Set();
    for (const raw of texts) {
      if (typeof raw !== "string") continue;
      const s = raw.trim().slice(0, MAX_LEN);
      if (s) uniqueSet.add(s);
      if (uniqueSet.size >= MAX_TEXTS) break;
    }
    const uniqueTexts = [...uniqueSet];

    // 번역 불필요: 한국어거나 지원하지 않는 언어거나 입력 없음 → 원문 그대로
    if (
      !target ||
      target === "ko" ||
      !SUPPORTED_CODES.includes(target) ||
      uniqueTexts.length === 0
    ) {
      const map = {};
      for (const s of uniqueTexts) map[s] = s;
      return Response.json({ ok: true, map });
    }

    const map = {};

    // ── 1) Firestore 캐시 배치 조회 ──────────────────────────────
    const refs = uniqueTexts.map((s) =>
      adminDb.collection(COLLECTION).doc(cacheDocId(target, s))
    );
    let missing = [];
    try {
      const snaps = await adminDb.getAll(...refs);
      snaps.forEach((snap, i) => {
        const src = uniqueTexts[i];
        if (snap.exists && snap.data() && typeof snap.data().value === "string") {
          map[src] = snap.data().value;
        } else {
          missing.push(src);
        }
      });
    } catch (cacheError) {
      console.error("[translate] 캐시 조회 실패:", cacheError); // TODO: 배포 전 제거
      // 캐시 조회 실패 시 전체를 미번역으로 간주해 아래에서 처리
      missing = uniqueTexts.slice();
    }

    // ── 2) 캐시에 없는 것만 OpenAI 번역 + 캐시 저장 ──────────────
    // ⚠️ 한 번에 다 보내면 한 번의 실패/누락으로 그 언어 전체가 미번역이 되므로,
    //    작은 청크로 나눠(각 청크 실패는 그 청크에만 영향) 번역한다.
    if (missing.length > 0) {
      const apiKey = process.env.AI_API_KEY;
      if (!apiKey) {
        // 키 없으면 원문 그대로(화면 유지). 캐시 저장 안 함.
        console.error("[translate] AI_API_KEY 미설정 — 원문 반환"); // TODO: 배포 전 제거
        for (const s of missing) map[s] = s;
      } else {
        // 청크로 분할 (한 청크가 실패해도 나머지 청크는 정상 번역되도록)
        const chunks = [];
        for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
          chunks.push(missing.slice(i, i + CHUNK_SIZE));
        }

        const batch = adminDb.batch();
        let writeCount = 0;

        // 청크들을 병렬 번역 (각 청크는 내부적으로 1회 재시도)
        const results = await Promise.all(
          chunks.map((chunk) => translateChunk(apiKey, chunk, target))
        );

        chunks.forEach((chunk, ci) => {
          const out = results[ci] || {};
          for (const src of chunk) {
            // out 에 키가 있으면 "번역 성공"(원문과 같아도 정식 결과) → 응답+캐시.
            // out 에 없으면 "번역 실패" → 응답 map 에 넣지 않는다(클라이언트가 원문 표시 +
            // 캐시하지 않아 다음 요청에서 재시도). ← 실패를 한글로 굳혀버리지 않기 위함.
            if (Object.prototype.hasOwnProperty.call(out, src)) {
              const value = out[src];
              map[src] = value;
              const ref = adminDb
                .collection(COLLECTION)
                .doc(cacheDocId(target, src));
              batch.set(ref, {
                target,
                source: src,
                value,
                updated_at: new Date(),
              });
              writeCount += 1;
            }
          }
        });

        // 캐시 저장 실패해도 이번 응답(map)은 그대로 반환 → 사용자 화면엔 번역 표시됨
        if (writeCount > 0) {
          try {
            await batch.commit();
          } catch (commitError) {
            console.error("[translate] 캐시 저장 실패(응답은 정상):", commitError); // TODO: 배포 전 제거
          }
        }
      }
    }

    return Response.json({ ok: true, map });
  } catch (error) {
    console.error("[translate] 처리 실패:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "번역 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
