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

// ─── OpenAI 배치 번역 (원문 배열 → 번역 배열, 같은 순서) ───────
async function translateBatch(apiKey, texts, target) {
  const langName = LANGUAGE_NAME[target] || target;
  const systemPrompt =
    `You are a translator for a travel/livecam map website. Translate each given short ` +
    `text (place names, city names, or short tags, mostly in Korean) into ${langName}. ` +
    `Keep proper nouns natural and use the conventional local exonym when one exists. ` +
    `Return ONLY a JSON object of the form {"result": ["...", "..."]} whose "result" array ` +
    `has exactly the same number of items and the same order as the input. No extra text.`;
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
  const arr = Array.isArray(parsed.result) ? parsed.result : null;
  if (!arr) throw new Error("번역 결과 배열(result) 없음");
  return arr;
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
    if (missing.length > 0) {
      const apiKey = process.env.AI_API_KEY;
      if (!apiKey) {
        // 키 없으면 원문 그대로(화면 유지). 캐시 저장 안 함.
        console.error("[translate] AI_API_KEY 미설정 — 원문 반환"); // TODO: 배포 전 제거
        for (const s of missing) map[s] = s;
      } else {
        try {
          const translated = await translateBatch(apiKey, missing, target);
          const batch = adminDb.batch();
          missing.forEach((src, i) => {
            const value =
              typeof translated[i] === "string" && translated[i].trim()
                ? translated[i].trim()
                : src; // 개별 실패 시 원문 유지
            map[src] = value;
            // 캐시에 저장(번역 성공분만 — 원문 그대로면 다음에 재시도 여지 위해 저장 생략)
            if (value !== src) {
              const ref = adminDb
                .collection(COLLECTION)
                .doc(cacheDocId(target, src));
              batch.set(ref, {
                target,
                source: src,
                value,
                updated_at: new Date(),
              });
            }
          });
          await batch.commit();
        } catch (aiError) {
          console.error("[translate] OpenAI 번역 실패 — 원문 반환:", aiError); // TODO: 배포 전 제거
          for (const s of missing) if (map[s] == null) map[s] = s;
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
