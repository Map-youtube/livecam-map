// ─────────────────────────────────────────────────────────────
// getChannelById — 공개 방송 채널 "1개"를 id 로 직접 조회 (서버 전용, 단일 문서 조회)
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-16 사고 대응): channel/[channelId]/page.js 가
//    이전에는 채널 1개를 찾기 위해 getLiveChannels() 로 채널 전체를 통째로 읽고 find() 했다.
//    channel 상세 페이지가 generateMetadata+본문에서 각각 호출해 페이지당 여러 번 재조회 →
//    getPublicMarkerById.js 와 같은 이유로 Firestore 읽기 폭증에 일부 기여했다.
//    id 를 알고 있으므로 live_channels/{id} 문서 1개만 직접 읽는다.
//
// 필터 규칙은 getLiveChannels.js 와 완전히 동일: is_active !== false
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";

function toPlainValue(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

function serializeChannel(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    console.error("[getChannelById] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// 공개 채널 1개 조회 (없거나 비활성이면 null)
export async function getChannelById(id) {
  try {
    if (!id || typeof id !== "string") return null;
    const snap = await adminDb.collection("live_channels").doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.is_active === false) return null;
    return serializeChannel(snap.id, data);
  } catch (error) {
    console.error("[getChannelById] 조회 실패:", id, error); // TODO: 배포 전 제거
    return null;
  }
}
