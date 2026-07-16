// ─────────────────────────────────────────────────────────────
// usageRecorder — API 사용량을 api_usage/{YYYY-MM-DD} 에 누적 기록 (서버 전용)
//
// recordApiUsage({ youtubeUnits, aiCalls, aiTokens }):
//   - youtube.units_used / ai.calls / ai.tokens_used 를 FieldValue.increment 로 증가.
//   - 기존 대시보드/데이터 스키마(youtube.units_used, ai.tokens_used)와 호환.
//
// ⚠️ 비용/한도가 관건인 YouTube 유닛을 정확히 집계하는 게 목적. Gemini 는 무료·캐시라 참고용.
// ⚠️ 기록 실패가 본 기능(영상 조회/AI)을 막지 않도록 항상 조용히 처리(throw 하지 않음).
//    호출부는 대개 await 하지 않고 .catch(()=>{}) 로 fire-and-forget 한다(호출 지연 방지).
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function recordApiUsage({
  youtubeUnits = 0,
  aiCalls = 0,
  aiTokens = 0,
} = {}) {
  try {
    if (youtubeUnits <= 0 && aiCalls <= 0 && aiTokens <= 0) return;
    const date = todayStr();
    const ref = adminDb.collection("api_usage").doc(date);
    const payload = { date };
    if (youtubeUnits > 0) {
      payload.youtube = {
        units_used: FieldValue.increment(youtubeUnits),
        units_limit: 10000,
      };
    }
    if (aiCalls > 0 || aiTokens > 0) {
      payload.ai = {};
      if (aiCalls > 0) payload.ai.calls = FieldValue.increment(aiCalls);
      if (aiTokens > 0) payload.ai.tokens_used = FieldValue.increment(aiTokens);
    }
    await ref.set(payload, { merge: true });
  } catch (error) {
    console.error("[usageRecorder] 사용량 기록 실패:", error); // TODO: 배포 전 제거
  }
}
