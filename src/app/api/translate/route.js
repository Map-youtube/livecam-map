// ─────────────────────────────────────────────────────────────
// POST /api/translate — 사용자 화면용 동적 문자열(도시/장소명/태그) 자동 번역
//
// 요청: { texts: string[], target: "<locale>" }
// 응답: { ok: true, map: { "<원문>": "<번역>", ... } }
//
// 동작:
//   1) target 이 한국어("ko")거나 키 없음 → 원문 그대로 반환(번역 불필요).
//   2) Firestore `translations` 캐시에서 (target, 원문) 조회 → 있으면 재사용(0비용).
//   3) 캐시에 없는 것만 Google Cloud Translation API v2 로 번역 → 캐시에 저장.
//
// ★ 번역 엔진: Google Cloud Translation API v2 (무료 한도 월 50만 자).
//   - 기존 gpt-4.1-mini(유료)에서 교체. 단순 번역(도시/장소명/태그)만 해당.
//   - AI 장소 설명(aiUtils.generatePlaceDescription, 창작 문장)은 gpt-4.1-mini 유지.
//   - 기존에 이미 캐시된 번역은 (엔진과 무관하게 원문 해시 기반) 그대로 재사용된다.
//
// ⚠️ 비용 방어: 같은 (문자열, 언어) 조합은 최초 1회만 번역되고 이후 영구 캐시.
//    한 요청당 최대 MAX_TEXTS 개, 각 문자열 MAX_LEN 자로 제한.
// ⚠️ GOOGLE_CLOUD_TRANSLATION_KEY 는 서버 전용. 키 없거나 실패 시 원문을 그대로 반환(화면은 안 깨짐).
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { SUPPORTED_CODES } from "@/lib/i18n/languages";

// Google Cloud Translation API v2 REST 엔드포인트
const GOOGLE_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";
const MAX_TEXTS = 120; // 한 요청 최대 문자열 수
const MAX_LEN = 200; // 문자열당 최대 길이(자)
// Google 번역 1회 호출당 문자열 수. Google v2 는 q 배열을 최대 128개까지 허용하지만,
// 작게 나눠(각 청크 실패는 그 청크에만 영향) 신뢰도를 높인다. (기존 구조 유지)
const CHUNK_SIZE = 20;
const COLLECTION = "translations";

// 프로젝트 17개 언어 코드 → Google Translate 언어 코드 매핑
// (대부분 ISO 코드와 동일. 중국어는 간체 zh-CN 으로 명시. ko 는 소스이므로 여기 불필요.)
const GOOGLE_LANG = {
  en: "en",
  ja: "ja",
  zh: "zh-CN", // 중국어 간체
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  ru: "ru",
  hi: "hi",
  bn: "bn",
  th: "th",
  vi: "vi",
  id: "id",
  ar: "ar",
  fa: "fa", // 페르시아어
};

// (target, 원문) → Firestore 문서 id (해시로 안전한 id 생성)
// ⚠️ 원문 해시 기반이라 엔진(OpenAI→Google)이 바뀌어도 기존 캐시가 그대로 재사용된다.
function cacheDocId(target, text) {
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return `${target}_${hash}`;
}

// (원문) → 감지된 소스 언어 저장용 문서 id.
// ⚠️ #1 최적화: 한 번 번역하며 감지한 원문 언어를 저장해두고,
//    이후 "그 언어로 보기" 요청이 오면 번역 호출 없이 원문을 그대로 반환한다.
//    (예: NASA 영상 영어 제목 → 영어 사용자에겐 번역 호출 생략 → 영상당 실질 16개 언어만 번역)
function sourceDocId(text) {
  const hash = crypto.createHash("sha1").update(text).digest("hex");
  return `src_${hash}`;
}

// ─── HTML 엔티티 디코드 ────────────────────────────────────────
// Google v2 는 format:"text" 라도 일부 문자(작은따옴표 등)를 &#39; 형태로 돌려줄 때가 있어
// 화면에 이상하게 보이지 않도록 흔한 엔티티를 원래 문자로 되돌린다.
function decodeHtmlEntities(str) {
  try {
    return String(str)
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  } catch (error) {
    return String(str || "");
  }
}

// ─── Google 번역 1회 호출 (원문 배열 → { 원문: 번역 } 맵) ──────
// Google v2 는 translations 배열을 q 와 "같은 순서"로 돌려주므로 인덱스로 매칭한다.
// source 는 지정하지 않아 자동 감지한다(도시명이 영문 "Tokyo" 처럼 한글이 아닌 경우도 정확히 처리).
async function callGoogleTranslate(apiKey, texts, target) {
  const googleTarget = GOOGLE_LANG[target] || target;

  const res = await fetch(
    `${GOOGLE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: texts, // 여러 문자열을 한 번에 (기존 청크 구조 그대로 배열로 전달)
        target: googleTarget,
        format: "text",
        // source 미지정 → 자동 감지 (한글/영문 혼재 입력 대응)
      }),
    }
  );

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `Google 번역 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const translations =
    data && data.data && Array.isArray(data.data.translations)
      ? data.data.translations
      : null;
  if (!translations) throw new Error("Google 응답에 translations 배열 없음");

  const out = {};
  const sources = {}; // 원문(감지된 소스 언어) 저장 → 이후 그 언어 요청은 번역 생략
  translations.forEach((tr, i) => {
    const src = texts[i];
    const val =
      tr && typeof tr.translatedText === "string"
        ? decodeHtmlEntities(tr.translatedText).trim()
        : "";
    if (src != null && val) out[src] = val;
    if (src != null && tr && typeof tr.detectedSourceLanguage === "string") {
      sources[src] = tr.detectedSourceLanguage;
    }
  });
  return { out, sources };
}

// ─── 청크 1개 번역 (실패/누락 시 1회 재시도) ──────────────────
// 반환: { out: {원문:번역}, sources: {원문:감지된소스언어} }. 두 번 시도해도 전부 실패하면 빈 객체.
// usage: { calls, characters } 누적 객체 — 성공한 호출의 글자 수/호출 수를 집계한다.
async function translateChunk(apiKey, texts, target, usage) {
  let best = {};
  let bestSources = {};
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { out, sources } = await callGoogleTranslate(apiKey, texts, target);
      // 성공한 호출만 사용량 집계 (실패 호출은 대개 과금되지 않음)
      // 글자 수는 소스 문자열 기준(Google 과금 기준). 코드포인트로 세어 한글도 1자로 계산.
      usage.calls += 1;
      usage.characters += texts.reduce((n, s) => n + [...String(s)].length, 0);
      // 더 많이 번역된 결과를 채택
      if (Object.keys(out).length > Object.keys(best).length) {
        best = out;
        bestSources = sources;
      }
      // 전부 번역됐으면 재시도 불필요
      if (Object.keys(best).length >= texts.length) {
        return { out: best, sources: bestSources };
      }
    } catch (error) {
      console.error(
        `[translate] 청크 번역 시도 ${attempt} 실패:`,
        error && error.message
      ); // TODO: 배포 전 제거
    }
  }
  return { out: best, sources: bestSources };
}

// ─── 사용량 집계 저장 (api_usage/월별 문서에 누적) ─────────────
// CLAUDE.md 4장 api_usage 컬렉션에 translate 필드를 추가한다.
// 문서 id 는 "YYYY-MM"(월별)로, 이번 달 누적 번역 글자 수/호출 수를 원자적으로 증가시킨다.
// (관리자 대시보드에 추후 표시할 수 있도록 데이터만 우선 축적)
async function recordTranslateUsage(usage) {
  try {
    if (!usage || usage.calls <= 0) return;
    const now = new Date();
    const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    const ref = adminDb.collection("api_usage").doc(monthId);
    // merge:true + FieldValue.increment 로 기존 값에 누적 (문서 없으면 생성)
    await ref.set(
      {
        month: monthId,
        translate: {
          characters_used: FieldValue.increment(usage.characters),
          calls: FieldValue.increment(usage.calls),
        },
        updated_at: new Date(),
      },
      { merge: true }
    );
  } catch (error) {
    // 사용량 기록 실패는 번역 응답에 영향을 주지 않는다(부가 기능).
    console.error("[translate] 사용량 기록 실패:", error); // TODO: 배포 전 제거
  }
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

    // 이 요청 대상 언어의 Google 코드 (원문 언어 비교용)
    const googleTarget = GOOGLE_LANG[target] || target;

    // ── 1.5) 원문 언어 스킵 ─────────────────────────────────────
    // 이전에 번역하며 감지해 저장해둔 "원문 언어" 가 이번 target 과 같은 문자열은
    // 번역이 불필요(원문 자체가 그 언어)하므로 Google 호출 없이 원문 그대로 반환한다.
    // → 영상당 원문 언어 1개는 번역 비용에서 제외된다.
    if (missing.length > 0) {
      try {
        const srcRefs = missing.map((s) =>
          adminDb.collection(COLLECTION).doc(sourceDocId(s))
        );
        const srcSnaps = await adminDb.getAll(...srcRefs);
        const skipBatch = adminDb.batch();
        let skipWrites = 0;
        const stillMissing = [];
        missing.forEach((src, i) => {
          const snap = srcSnaps[i];
          const detected =
            snap && snap.exists && snap.data()
              ? snap.data().detected
              : null;
          if (typeof detected === "string" && detected === googleTarget) {
            // 원문이 이미 target 언어 → 원문 그대로 + (target,원문) 캐시에 원문 저장
            map[src] = src;
            const ref = adminDb
              .collection(COLLECTION)
              .doc(cacheDocId(target, src));
            skipBatch.set(ref, {
              target,
              source: src,
              value: src,
              updated_at: new Date(),
            });
            skipWrites += 1;
          } else {
            stillMissing.push(src);
          }
        });
        if (skipWrites > 0) {
          try {
            await skipBatch.commit();
          } catch (e) {
            console.error("[translate] 원문언어 스킵 캐시 저장 실패:", e); // TODO: 배포 전 제거
          }
        }
        missing = stillMissing;
      } catch (e) {
        console.error("[translate] 원문 언어 조회 실패(계속 진행):", e); // TODO: 배포 전 제거
      }
    }

    // ── 2) 캐시에 없는 것만 Google 번역 + 캐시 저장 ──────────────
    // ⚠️ 한 번에 다 보내면 한 번의 실패/누락으로 그 언어 전체가 미번역이 되므로,
    //    작은 청크로 나눠(각 청크 실패는 그 청크에만 영향) 번역한다.
    if (missing.length > 0) {
      const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_KEY;
      if (!apiKey) {
        // 키 없으면 원문 그대로(화면 유지). 캐시 저장 안 함.
        console.error(
          "[translate] GOOGLE_CLOUD_TRANSLATION_KEY 미설정 — 원문 반환"
        ); // TODO: 배포 전 제거
        for (const s of missing) map[s] = s;
      } else {
        // 청크로 분할 (한 청크가 실패해도 나머지 청크는 정상 번역되도록)
        const chunks = [];
        for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
          chunks.push(missing.slice(i, i + CHUNK_SIZE));
        }

        const batch = adminDb.batch();
        let writeCount = 0;
        // 이번 요청에서 실제 Google 에 보낸 사용량 집계
        const usage = { calls: 0, characters: 0 };

        // 청크들을 병렬 번역 (각 청크는 내부적으로 1회 재시도)
        const results = await Promise.all(
          chunks.map((chunk) => translateChunk(apiKey, chunk, target, usage))
        );

        chunks.forEach((chunk, ci) => {
          const res = results[ci] || {};
          const out = res.out || {};
          const sources = res.sources || {};
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

              // 감지된 원문 언어 저장 → 이후 그 언어 요청은 번역 스킵(#1 최적화).
              // 최초 저장만 하면 되므로 이미 있으면 덮어써도 무방(merge).
              const detected = sources[src];
              if (typeof detected === "string" && detected) {
                const srcRef = adminDb
                  .collection(COLLECTION)
                  .doc(sourceDocId(src));
                batch.set(
                  srcRef,
                  { source: src, detected, updated_at: new Date() },
                  { merge: true }
                );
                writeCount += 1;
              }
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

        // 이번 요청의 번역 사용량(글자 수/호출 수)을 api_usage 에 누적
        await recordTranslateUsage(usage);
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
