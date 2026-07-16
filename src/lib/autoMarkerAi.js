// ─────────────────────────────────────────────────────────────
// autoMarkerAi — 유튜브 라이브 영상 1개 → 지역 마커 정보 자동 생성 (서버 전용)
//
// enrichVideoToMarker({ title, description, tags, channelName, videoId }, existingTags)
//   - Google Gemini(기본 gemini-2.5-flash-lite)로 영상의 위치·장소명·좌표·태그·설명을
//     한 번에 추론해 마커 필드로 반환한다.
//   - 반환: { location, city, country(ISO2), continent, lat, lng, tags[], description:{ko,en} }
//           (확신이 없는 필드는 빈 값/ null. 실패해도 throw 하지 않고 부분값을 반환.)
//
// ⚠️ 비용(핵심): 이 함수는 "새 영상이 처음 감지될 때 단 1회"만 호출한다(호출부에서 캐시).
//    같은 영상은 두 번 다시 호출하지 않는다 → 영상이 살아있는 내내 추가 비용 0.
//    호출당 토큰 ≈ 입력 1,500 + 출력 600. 정상 볼륨(하루 수십 건)은 무료 티어 내.
//
// ⚠️ GEMINI_API_KEY 는 서버 전용 환경변수다. 절대 NEXT_PUBLIC 접두사/하드코딩 금지.
//    (기존에 넣어둔 이름이 Gemini_API_Key 인 경우도 함께 읽는다.)
// ─────────────────────────────────────────────────────────────

import { getContinentByCountry } from "@/lib/continentUtils";
import { recordApiUsage } from "@/lib/usageRecorder";

// ─── AI 자동 생성 스위치 ──────────────────────────────────────
// 이 기능(채널→자동 마커)의 핵심이 AI 이므로 기본 켬. 비용/장애 시 false 로 즉시 차단.
//   - false 이면 Gemini 를 호출하지 않고 빈 결과를 반환 → 스캔은 돌지만 마커가 안 채워짐(비용 0).
const AUTO_MARKER_AI_ENABLED = true;

// 사용 모델(교체 지점 1곳).
//   gemini-2.5-flash-lite 는 신규 API 키에는 더 이상 제공되지 않아(404) 사용 불가 →
//   현행 최신 Flash-Lite 인 gemini-3.1-flash-lite 사용(무료 티어 지원, 유료 전환 시 $0.25/$1.50 per 1M).
//   ("*-latest" 별칭은 모델이 예고 없이 바뀌어 비용/동작이 달라질 수 있어 고정 ID 로 둔다.)
const AUTO_MARKER_MODEL = "gemini-3.1-flash-lite";

// Gemini generateContent 엔드포인트 (키는 쿼리스트링으로 붙인다 — 서버 전용)
function endpointFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// 서버 전용 키 조회 (표준 이름 우선, 기존 이름도 허용)
function getGeminiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.Gemini_API_Key ||
    ""
  ).trim();
}

// ─── Gemini 1회 호출 (JSON 응답 강제) ─────────────────────────
// 성공 시 파싱된 객체를 반환. 실패 시 throw(호출부에서 재시도/무시).
async function callGeminiJson(apiKey, systemPrompt, userPrompt) {
  const res = await fetch(`${endpointFor(AUTO_MARKER_MODEL)}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // JSON 만 뱉도록 강제 (코드블록/잡텍스트 방지)
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `Gemini 호출 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  // Gemini 호출 1회 집계(대시보드). 실패해도 무시.
  recordApiUsage({
    aiCalls: 1,
    aiTokens: Number(data && data.usageMetadata && data.usageMetadata.totalTokenCount) || 0,
  }).catch(() => {});
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("Gemini 응답에 content 가 없습니다.");
  }

  // responseMimeType 을 json 으로 줬어도 방어적으로 코드블록/잡텍스트를 벗겨낸다.
  let clean = String(text).trim();
  clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.slice(start, end + 1);
  }
  return JSON.parse(clean);
}

// ─── 숫자 좌표 유효성 ─────────────────────────────────────────
function toValidLat(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= -90 && n <= 90 ? n : null;
}
function toValidLng(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= -180 && n <= 180 ? n : null;
}

// ─── AI 가 고른 태그를 "사이트 기존 태그"로만 제한 ────────────
// 사용자 요구: 등록된 태그 목록 중 가장 적합한 1~3개만. 없으면 억지로 넣지 말 것.
//   → AI 가 목록 밖 태그를 지어내면 버린다(대소문자·공백 무시하고 기존 태그명으로 매핑).
function normalizeTags(aiTags, existingTags) {
  try {
    const existing = Array.isArray(existingTags) ? existingTags : [];
    // 정규화 키 → 원본 태그명
    const byKey = new Map();
    for (const t of existing) {
      const name = typeof t === "string" ? t : t && t.name;
      if (!name) continue;
      byKey.set(String(name).trim().toLowerCase(), String(name).trim());
    }
    const out = [];
    for (const raw of Array.isArray(aiTags) ? aiTags : []) {
      const key = String(raw || "").trim().toLowerCase();
      if (!key) continue;
      const matched = byKey.get(key);
      if (matched && !out.includes(matched)) out.push(matched);
      if (out.length >= 3) break;
    }
    return out;
  } catch (error) {
    return [];
  }
}

// ─── 429(분당 제한) 대응 유틸 ────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Gemini 429 응답 본문에서 "Please retry in 11.99s" 같은 지연을 뽑아 ms 로.
function parseRetryDelayMs(bodyText) {
  try {
    const m = String(bodyText || "").match(/retry in ([0-9.]+)s/i);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 600;
  } catch (error) {
    /* 무시 */
  }
  return 0;
}

// ─── 파싱된 AI 결과 1건 → 마커 필드로 정규화 (단건·배치 공용) ──
function normalizeAiItem(parsed, existingTags) {
  const location = String(parsed.location || "").trim();
  const city = String(parsed.city || "").trim();
  const country = String(parsed.country || "").trim().toUpperCase().slice(0, 2);
  const lat = toValidLat(parsed.lat);
  const lng = toValidLng(parsed.lng);
  // 대륙은 AI 를 믿지 않고 country(ISO2)에서 시스템 규칙대로 파생(트리 분류 일관성).
  const validCountry = /^[A-Z]{2}$/.test(country) ? country : "";
  const continent = validCountry ? getContinentByCountry(validCountry) || "" : "";
  const descObj =
    parsed.description && typeof parsed.description === "object"
      ? parsed.description
      : {};
  return {
    ok: true,
    location,
    city,
    country: validCountry,
    continent,
    lat,
    lng,
    tags: normalizeTags(parsed.tags, existingTags),
    description: {
      ko: String(descObj.ko || "").trim(),
      en: String(descObj.en || "").trim(),
    },
    model: AUTO_MARKER_MODEL,
  };
}

// ─── Gemini 배치 호출 (JSON, 429 시 지연 후 재시도) ───────────
// 성공 시 파싱 객체 반환. 429 는 응답이 알려준 지연만큼 기다렸다 최대 4회까지 재시도.
async function callGeminiBatchJson(apiKey, systemPrompt, userPrompt, maxTokens) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(`${endpointFor(AUTO_MARKER_MODEL)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
          maxOutputTokens: maxTokens || 8192,
        },
      }),
    });

    if (res.status === 429) {
      // 분당 제한 → 응답이 알려준 시간만큼 대기 후 재시도
      const t = await res.text().catch(() => "");
      const wait = parseRetryDelayMs(t) || 13000;
      lastErr = new Error(`429 rate limit (attempt ${attempt})`);
      if (attempt < 4) {
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        `Gemini 배치 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
      );
    }

    const data = await res.json();
    // Gemini 배치 호출 1회 집계(대시보드). 실패해도 무시.
    recordApiUsage({
      aiCalls: 1,
      aiTokens: Number(data && data.usageMetadata && data.usageMetadata.totalTokenCount) || 0,
    }).catch(() => {});
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) throw new Error("Gemini 배치 응답에 content 가 없습니다.");

    let clean = String(text).trim();
    clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) clean = clean.slice(start, end + 1);
    return JSON.parse(clean);
  }
  throw lastErr || new Error("Gemini 배치 실패");
}

// ─── 배치: 영상 여러 개 → 마커 필드 (RPM 제한 우회의 핵심) ────
// 무료 Gemini 는 분당 15회(RPM) 제한. 영상 1개당 1회 호출하면 대량 처리 시 대부분 429.
//   → 한 번의 호출에 여러 영상을 넣어(videoId 로 매칭) 요청 수를 1/N 로 줄인다.
// 입력: videos = [{ videoId, title, channelName, tags?, description? }]
// 반환: Map<videoId, enrichedResult>  (성공 매칭된 것만. 없는 videoId 는 호출부에서 실패 처리)
export async function enrichVideosToMarkers(videos = [], existingTags = []) {
  const out = new Map();
  try {
    if (!AUTO_MARKER_AI_ENABLED) return out;
    const apiKey = getGeminiKey();
    if (!apiKey) {
      console.error(
        "[autoMarkerAi] GEMINI_API_KEY 가 없습니다. 배치 채우기를 건너뜁니다."
      ); // TODO: 배포 전 제거
      return out;
    }
    const list = (Array.isArray(videos) ? videos : []).filter(
      (v) => v && v.videoId
    );
    if (list.length === 0) return out;

    const tagListStr = (Array.isArray(existingTags) ? existingTags : [])
      .map((t) => (typeof t === "string" ? t : t && t.name))
      .filter(Boolean)
      .join(", ");

    const systemPrompt = [
      "당신은 지리·도시·여행 전문가다. 유튜브 라이브캠 영상들의 제목·채널명·태그를 근거로",
      "각 영상이 '실제로 촬영되고 있는 장소'를 특정하고, 여행 지도 사이트에 등록할 정보를 만든다.",
      "여러 영상을 한 번에 처리하며, 각 결과에는 입력으로 준 videoId 를 그대로 넣어 매칭한다.",
      "",
      "규칙(각 영상마다 적용):",
      "1) location(장소명=마커 제목)은 한국어로 '[도시] [대표 지점/명소]' 형식. 도시를 알면 반드시 도시명을 맨 앞에 붙인다.",
      "   예: '도쿄 신주쿠역', '파리 에펠탑', '부산 해운대 해수욕장'. 채널명·해상도(4K)·이모지·'LIVE/라이브'·'전경/앞' 같은 군더더기는 넣지 않는다.",
      "   (도시 없이 넓은 지역/공원이면 '[지역] [명소]' 형식.)",
      "2) city 는 영어 통용 표기·첫 글자 대문자(Tokyo, Seoul, New York — 한글로 쓰지 말 것). country 는 ISO 3166-1 alpha-2 대문자(KR, JP, US, GB).",
      "3) lat/lng 는 실제 좌표(소수점 4자리 이상). 확신 없으면 도시 중심 좌표라도.",
      "4) tags 는 아래 '사이트 태그 목록'에 있는 것 중에서만 1~3개. 적합한 게 없으면 빈 배열([]). 목록에 없는 태그를 지어내지 마라.",
      "5) description 은 ko·en 각각 2~3문장, 사실 위주.",
      "6) 위치를 전혀 특정할 수 없으면 location/city/country/lat/lng 를 비우고 description 만 채운다. 절대 지어내지 마라.",
      "",
      `사이트 태그 목록: ${tagListStr || "(없음)"}`,
      "",
      '반드시 아래 JSON 형식으로만 답하라(다른 텍스트 금지). results 배열의 각 원소는 입력 영상 1개에 대응:',
      '{"results":[{"videoId":"","location":"","city":"","country":"","lat":null,"lng":null,"tags":[],"description":{"ko":"","en":""}}]}',
    ].join("\n");

    // 한 요청에 담는 영상 수. 출력 토큰(각 ko/en 설명 포함)을 고려해 8개.
    const BATCH = 8;
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const userPrompt = [
        "다음 유튜브 라이브 영상들 각각의 장소 정보를 추론해줘. 각 결과에 videoId 를 그대로 넣어줘.",
        ...chunk.map(
          (v, idx) =>
            `[${idx + 1}] videoId=${v.videoId} | 제목: ${v.title || "(없음)"} | 채널: ${
              v.channelName || "(없음)"
            }` +
            (v.tags && v.tags.length
              ? ` | 태그: ${(Array.isArray(v.tags) ? v.tags.slice(0, 10) : []).join(", ")}`
              : ""),
        ),
      ].join("\n");

      try {
        const parsed = await callGeminiBatchJson(
          apiKey,
          systemPrompt,
          userPrompt,
          8192
        );
        const results = Array.isArray(parsed && parsed.results)
          ? parsed.results
          : [];
        const byId = new Map();
        for (const r of results) {
          if (r && r.videoId) byId.set(String(r.videoId).trim(), r);
        }
        for (const v of chunk) {
          const r = byId.get(v.videoId);
          if (r) out.set(v.videoId, normalizeAiItem(r, existingTags));
          // 매칭 안 된 영상은 out 에 안 넣음 → 호출부가 실패로 보고 다음 스캔에서 재시도.
        }
      } catch (batchError) {
        console.error(
          "[autoMarkerAi] 배치 호출 실패(이 묶음 건너뜀):",
          batchError && batchError.message
        ); // TODO: 배포 전 제거
        // 이 배치 전체 실패 → out 에 안 넣음(다음 스캔 재시도). 전체 중단하지 않음.
      }
    }
  } catch (error) {
    console.error("[autoMarkerAi] enrichVideosToMarkers 예외:", error); // TODO: 배포 전 제거
  }
  return out;
}

// ─── 메인: 영상 → 마커 필드 ───────────────────────────────────
export async function enrichVideoToMarker(video = {}, existingTags = []) {
  // 실패해도 등록/스캔을 막지 않도록, 항상 이 형태의 객체를 반환한다.
  const empty = {
    ok: false,
    location: "",
    city: "",
    country: "",
    continent: "",
    lat: null,
    lng: null,
    tags: [],
    description: { ko: "", en: "" },
    model: AUTO_MARKER_MODEL,
  };

  try {
    if (!AUTO_MARKER_AI_ENABLED) {
      return { ...empty, reason: "ai_disabled" };
    }
    const apiKey = getGeminiKey();
    if (!apiKey) {
      console.error(
        "[autoMarkerAi] GEMINI_API_KEY 가 없습니다. 자동 채우기를 건너뜁니다."
      ); // TODO: 배포 전 제거
      return { ...empty, reason: "no_key" };
    }

    const {
      title = "",
      description: videoDescription = "",
      tags = [],
      channelName = "",
    } = video;
    const shortDesc = String(videoDescription || "").slice(0, 600);
    const videoTags = Array.isArray(tags) ? tags.slice(0, 15).join(", ") : "";
    const tagListStr = (Array.isArray(existingTags) ? existingTags : [])
      .map((t) => (typeof t === "string" ? t : t && t.name))
      .filter(Boolean)
      .join(", ");

    // ─── 시스템 프롬프트: 지리/여행 전문가 지침 (사용자 요구 + 보강) ───
    const systemPrompt = [
      "당신은 지리·도시·여행 전문가다. 유튜브 라이브캠 영상의 제목·설명·태그·채널명을 근거로",
      "그 영상이 '실제로 촬영되고 있는 장소'를 특정하고, 여행 지도 사이트에 등록할 정보를 만든다.",
      "",
      "규칙:",
      "1) location(장소명=마커 제목)은 한국어로 '[도시] [대표 지점/명소]' 형식. 도시를 알면 반드시 도시명을 맨 앞에 붙인다.",
      "   예: '도쿄 신주쿠역', '파리 에펠탑', '부산 해운대 해수욕장', '뮌헨 마리엔 광장'.",
      "   채널명·해상도(4K/HD)·이모지·'LIVE/라이브/실시간' 같은 군더더기와 불필요한 수식('전경','앞' 등)은 넣지 않는다.",
      "   (도시 없이 넓은 지역/공원이면 '[지역] [명소]' 형식: 예 '알래스카 카트마이 국립공원'.)",
      "2) city 는 영어 통용 표기·첫 글자 대문자로 통일한다(예: Tokyo, Seoul, Busan, Paris, New York — 한글로 쓰지 말 것) — 도시별 트리 분류가 일관되도록.",
      "   country 는 ISO 3166-1 alpha-2 대문자 코드(예: KR, JP, US, GB).",
      "3) lat/lng 는 그 장소의 실제 좌표(소수점 4자리 이상). 확신 없으면 도시 중심 좌표라도 제시.",
      "4) tags 는 아래 '사이트 태그 목록'에 있는 것 중에서만 1~3개 고른다. 적합한 게 없으면 빈 배열([]). 목록에 없는 태그를 새로 만들지 마라.",
      "5) description 은 ko(한국어)·en(영어) 각각 2~3문장, 과장 없이 사실 위주로 장소 소개.",
      "6) 위치를 전혀 특정할 수 없으면 location/city/country/lat/lng 를 비우고(빈 문자열/null) description 만 채운다. 절대 지어내지 마라.",
      "",
      `사이트 태그 목록: ${tagListStr || "(없음)"}`,
      "",
      '반드시 아래 JSON 형식으로만 답하라(다른 텍스트 금지):',
      '{"location":"","city":"","country":"","lat":null,"lng":null,"tags":[],"description":{"ko":"","en":""}}',
    ].join("\n");

    const userPrompt = [
      "다음 유튜브 라이브 영상의 장소 정보를 추론해줘.",
      `- 제목: ${title || "(없음)"}`,
      `- 채널명: ${channelName || "(없음)"}`,
      `- 영상 태그: ${videoTags || "(없음)"}`,
      `- 설명(일부): ${shortDesc || "(없음)"}`,
    ].join("\n");

    // 정상 흐름 1회 호출. JSON 파싱 실패 시에만 1회 재시도.
    let parsed = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        parsed = await callGeminiJson(apiKey, systemPrompt, userPrompt);
        break;
      } catch (attemptError) {
        lastError = attemptError;
        console.error(
          `[autoMarkerAi] 시도 ${attempt} 실패:`,
          attemptError && attemptError.message
        ); // TODO: 배포 전 제거
      }
    }
    if (!parsed) {
      return { ...empty, reason: "ai_failed", error: lastError && lastError.message };
    }

    // ─── 결과 정규화 ────────────────────────────────────────
    const location = String(parsed.location || "").trim();
    const city = String(parsed.city || "").trim();
    const country = String(parsed.country || "").trim().toUpperCase().slice(0, 2);
    const lat = toValidLat(parsed.lat);
    const lng = toValidLng(parsed.lng);
    // 대륙은 AI 를 믿지 않고 country(ISO2)에서 우리 시스템 규칙대로 파생한다(트리 분류 일관성).
    const continent = country ? getContinentByCountry(country) || "" : "";
    const normalizedTags = normalizeTags(parsed.tags, existingTags);
    const descObj =
      parsed.description && typeof parsed.description === "object"
        ? parsed.description
        : {};
    const description = {
      ko: String(descObj.ko || "").trim(),
      en: String(descObj.en || "").trim(),
    };

    return {
      ok: true,
      location,
      city,
      country: /^[A-Z]{2}$/.test(country) ? country : "",
      continent,
      lat,
      lng,
      tags: normalizedTags,
      description,
      model: AUTO_MARKER_MODEL,
    };
  } catch (error) {
    console.error("[autoMarkerAi] enrichVideoToMarker 예외:", error); // TODO: 배포 전 제거
    return { ...empty, reason: "exception", error: error && error.message };
  }
}

// 다른 모듈이 모델명/스위치를 참조할 수 있게 노출(로그·상태 표시용)
export const AUTO_MARKER_AI_META = {
  enabled: AUTO_MARKER_AI_ENABLED,
  model: AUTO_MARKER_MODEL,
};
