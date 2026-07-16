// ─────────────────────────────────────────────────────────────
// regionDescriptionAi — 대륙/국가/도시 "지역 소개글"을 Gemini 로 생성 (서버 전용)
//
// generateRegionDescriptions(regions):
//   regions = [{ key, type: "continent"|"country"|"city", name, context }]
//   반환: Map<key, { ko, en, model }>  (성공 매칭된 것만)
//
// - 그 지역의 성격·역사·지리·대표 특징을 담은 서술형 소개(2~3문장, ko/en)를 만든다.
//   ("라이브캠 N곳" 같은 사이트/영상 표현은 넣지 않는다 — 장소 자체 소개만.)
// - 여러 지역을 한 번에 처리(RPM 제한 우회). 결과에 입력 key 를 그대로 넣어 매칭.
//
// ⚠️ 비용(핵심): 각 지역은 "설명이 아직 없을 때 1회"만 생성해 Firestore 에 영구 저장(캐시).
//    같은 지역을 두 번 생성하지 않는다 → 사실상 1회성 비용(~$0, 무료 티어 내).
// ⚠️ GEMINI_API_KEY 는 서버 전용. 절대 NEXT_PUBLIC/하드코딩 금지.
// ─────────────────────────────────────────────────────────────

const REGION_DESC_MODEL = "gemini-3.1-flash-lite";

function endpointFor(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getGeminiKey() {
  return (process.env.GEMINI_API_KEY || process.env.Gemini_API_Key || "").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryDelayMs(bodyText) {
  try {
    const m = String(bodyText || "").match(/retry in ([0-9.]+)s/i);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 600;
  } catch (error) {
    /* 무시 */
  }
  return 0;
}

// Gemini 배치 호출(JSON, 429 시 지연 후 최대 4회 재시도). 성공 시 파싱 객체 반환.
async function callGeminiBatchJson(apiKey, systemPrompt, userPrompt, maxTokens) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(`${endpointFor(REGION_DESC_MODEL)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.5, // 서술형이라 약간의 다양성 허용
          maxOutputTokens: maxTokens || 8192,
        },
      }),
    });

    if (res.status === 429) {
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
        `Gemini 지역설명 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
      );
    }

    const data = await res.json();
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) throw new Error("Gemini 지역설명 응답에 content 가 없습니다.");

    let clean = String(text).trim();
    clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) clean = clean.slice(start, end + 1);
    return JSON.parse(clean);
  }
  throw lastErr || new Error("Gemini 지역설명 배치 실패");
}

const TYPE_LABEL = { continent: "대륙", country: "국가", city: "도시" };

// ─── 배치 생성 ────────────────────────────────────────────────
export async function generateRegionDescriptions(regions = []) {
  const out = new Map();
  try {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      console.error("[regionDescriptionAi] GEMINI_API_KEY 가 없습니다."); // TODO: 배포 전 제거
      return out;
    }
    const list = (Array.isArray(regions) ? regions : []).filter(
      (r) => r && r.key && r.name
    );
    if (list.length === 0) return out;

    const systemPrompt = [
      "당신은 여행·지리 전문 작가다. 주어진 장소(대륙/국가/도시) 각각에 대해,",
      "그 장소의 성격·역사·지리·대표적 특징을 담은 매력적이고 담백한 소개글을 쓴다.",
      "",
      "규칙(각 장소마다 적용):",
      "1) ko(한국어)와 en(영어) 소개를 각각 2~3문장으로 작성한다.",
      "2) 사실에 근거해 쓰되, 확실하지 않은 구체적 수치·연도·고유명사는 지어내지 말고 일반적으로 서술한다. 모르면 무리하게 특정하지 마라.",
      "3) '라이브캠', '실시간', '영상', '스트림', '방송' 같은 사이트/영상 관련 표현은 절대 쓰지 않는다. 오직 그 장소 자체를 소개한다.",
      "4) 첫 문장에 장소명을 자연스럽게 포함하고, 괄호로 영문 표기를 곁들여도 좋다. 예: '대한민국의 수도, 서울(Seoul)입니다.'",
      "5) 과장·홍보성 문구 대신 정보성 있게. 여행자가 그 지역의 분위기를 그려볼 수 있게 쓴다.",
      "6) 각 결과에는 입력으로 준 key 를 그대로 넣어 매칭한다.",
      "",
      '반드시 아래 JSON 형식으로만 답하라(다른 텍스트 금지). results 배열의 각 원소는 입력 장소 1개에 대응:',
      '{"results":[{"key":"","ko":"","en":""}]}',
    ].join("\n");

    // 설명은 마커 필드보다 길어 출력 토큰이 크다 → 한 요청에 6개.
    const BATCH = 6;
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const userPrompt = [
        "다음 장소들 각각의 소개글을 ko/en 으로 써줘. 각 결과에 key 를 그대로 넣어줘.",
        ...chunk.map(
          (r, idx) =>
            `[${idx + 1}] key=${r.key} | 유형: ${TYPE_LABEL[r.type] || r.type} | 이름: ${r.name}` +
            (r.context ? ` | 맥락: ${r.context}` : ""),
        ),
      ].join("\n");

      try {
        const parsed = await callGeminiBatchJson(apiKey, systemPrompt, userPrompt, 8192);
        const results = Array.isArray(parsed && parsed.results) ? parsed.results : [];
        const byKey = new Map();
        for (const r of results) {
          if (r && r.key) byKey.set(String(r.key).trim(), r);
        }
        for (const r of chunk) {
          const got = byKey.get(r.key);
          if (got && (got.ko || got.en)) {
            out.set(r.key, {
              ko: String(got.ko || "").trim(),
              en: String(got.en || "").trim(),
              model: REGION_DESC_MODEL,
            });
          }
          // 매칭 안 되면 out 에 안 넣음 → 다음 실행에서 재시도.
        }
      } catch (batchError) {
        console.error(
          "[regionDescriptionAi] 배치 실패(이 묶음 건너뜀):",
          batchError && batchError.message
        ); // TODO: 배포 전 제거
      }
    }
  } catch (error) {
    console.error("[regionDescriptionAi] generateRegionDescriptions 예외:", error); // TODO: 배포 전 제거
  }
  return out;
}

export const REGION_DESC_META = { model: REGION_DESC_MODEL };
