// ─────────────────────────────────────────────────────────────
// AI 유틸리티 (서버 전용) — 장소 소개 설명 자동 생성
//
// generatePlaceDescription({ title, description, location, city, country, category })
//   - OpenAI gpt-4.1-mini 로 한국어(ko)/영어(en) 짧은 소개를 생성한다.
//   - 반환: { ko: "...", en: "..." }
//   - 파싱 실패 시 1회 재시도, 그래도 실패하면 { ko: "", en: "" } 반환(등록은 막지 않음).
//
// ⚠️ AI_API_KEY 는 서버 전용 환경변수다. 절대 NEXT_PUBLIC 접두사 금지, 하드코딩 금지.
// ⚠️ 비용: 마커 등록당 이 함수 1회 호출(정상 응답 시 API 호출 1회). 재시도는 파싱 실패 시에만.
// ─────────────────────────────────────────────────────────────

// 사용할 모델 (지침: gpt-4.1-mini). 비밀값이 아니므로 상수로 둔다.
const AI_MODEL = "gpt-4.1-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

// ─── OpenAI Chat Completions 1회 호출 (순수 단일 호출) ─────────
// 성공 시 응답 본문의 message.content(문자열)를 반환한다.
async function callOpenAiOnce(apiKey, systemPrompt, userPrompt) {
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      // JSON 형태 응답을 강하게 유도
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `OpenAI 호출 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!content) {
    throw new Error("OpenAI 응답에 content가 없습니다.");
  }
  return content;
}

// ─── 응답 문자열에서 { ko, en } 파싱 ──────────────────────────
// 모델이 코드블록(```json ... ```)으로 감싸는 경우도 방어적으로 처리한다.
function parseKoEn(content) {
  // 코드블록 마커 제거 후 첫 { ... } 구간을 추출
  let text = String(content).trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  // 가장 바깥 중괄호 구간만 취한다 (앞뒤 잡텍스트 방어)
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  const obj = JSON.parse(text);
  return {
    ko: typeof obj.ko === "string" ? obj.ko.trim() : "",
    en: typeof obj.en === "string" ? obj.en.trim() : "",
  };
}

export async function generatePlaceDescription({
  title,
  description,
  location,
  city,
  country,
  category,
} = {}) {
  try {
    // 서버 전용 키
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      console.error(
        "[aiUtils] 환경변수 AI_API_KEY 가 설정되지 않았습니다. 설명 생성을 건너뜁니다."
      ); // TODO: 배포 전 제거
      return { ko: "", en: "" };
    }

    // ─── 프롬프트 구성 ───────────────────────────────────────
    const systemPrompt =
      "여행/라이브캠 사이트에 들어갈 장소 소개를 한국어와 영어로 각각 2~3문장, " +
      "과장 없이 사실 기반으로 간결하게 작성하라. 결과는 JSON으로만 응답하라. " +
      '형식은 {"ko": "한국어 소개", "en": "English introduction"} 이며, 그 외 텍스트는 포함하지 마라.';

    // 유튜브 설명은 너무 길 수 있으므로 앞부분만 사용 (프롬프트 비용 절약)
    const shortDesc = (description || "").slice(0, 300);

    const userPrompt = [
      "다음 정보를 바탕으로 장소 소개를 작성해줘.",
      `- 장소명: ${location || "(없음)"}`,
      `- 도시: ${city || "(없음)"}`,
      `- 국가(코드): ${country || "(없음)"}`,
      `- 카테고리: ${category || "(없음)"}`,
      `- 유튜브 제목: ${title || "(없음)"}`,
      `- 유튜브 설명(일부): ${shortDesc || "(없음)"}`,
    ].join("\n");

    // ─── 호출 + (파싱 실패 시) 1회 재시도 ─────────────────────
    // 정상 흐름에서는 API 호출 1회. JSON 파싱이 실패한 경우에만 1회 더 시도한다.
    const MAX_ATTEMPTS = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const content = await callOpenAiOnce(apiKey, systemPrompt, userPrompt);
        const parsed = parseKoEn(content);
        // ko/en 둘 다 비어도 형식상 성공으로 보고 반환 (모델이 빈 값 준 경우)
        return parsed;
      } catch (attemptError) {
        lastError = attemptError;
        console.error(
          `[aiUtils] 설명 생성 시도 ${attempt} 실패:`,
          attemptError.message
        ); // TODO: 배포 전 제거
        // 마지막 시도가 아니면 재시도 (파싱/호출 실패 모두 1회 재시도)
      }
    }

    // 모든 시도 실패 → 빈 값 반환 (등록 자체는 막지 않는다)
    console.error("[aiUtils] 설명 생성 최종 실패:", lastError && lastError.message); // TODO: 배포 전 제거
    return { ko: "", en: "" };
  } catch (error) {
    // 예기치 못한 오류에도 등록을 막지 않도록 빈 값 반환
    console.error("[aiUtils] generatePlaceDescription 예외:", error); // TODO: 배포 전 제거
    return { ko: "", en: "" };
  }
}
