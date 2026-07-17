// ─────────────────────────────────────────────────────────────
// getLiveChannels — 공개(사용자용) 자동 라이브 채널 조회 (서버 전용, 5분 캐싱)
//
// - Firestore "live_channels" 컬렉션에서 is_active !== false 인 채널만 조회.
// - getPublicMarkers 와 동일하게 unstable_cache(revalidate 300s, tag "live-channels")로 캐싱.
//   → 관리자가 채널을 추가/수정/삭제하면 라우트가 revalidateTag("live-channels") 로 무효화.
// - 실패 시 빈 배열 반환.
//
// 컬렉션 문서 필드:
//   channel_id(UC…), handle(@…, 선택), channel_name,
//   major_category(대분류), minor_category(소분류),
//   lat, lng, location(선택 표시명),
//   channel_type: "fixed"(고정 마커) | "iss"(움직이는 추적 마커),
//   fallback_video_ids: string[](선택, iss 등 상시 라이브 폴백),
//   is_active, created_at, updated_at
// ─────────────────────────────────────────────────────────────

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";

// Firestore Timestamp 등 직렬화 불가 값을 순수 값으로 변환
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
    console.error("[getLiveChannels] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

async function fetchActiveChannels() {
  try {
    const snapshot = await adminDb
      .collection("live_channels")
      .where("is_active", "!=", false)
      .get();
    return snapshot.docs.map((doc) => serializeChannel(doc.id, doc.data()));
  } catch (error) {
    console.error("[getLiveChannels] Firestore 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ⚠️ Firestore 읽기 폭증 방지(2026-07-16 사고 대응): unstable_cache(시간 기준 캐시)만으로는
//    같은 채널 페이지의 generateMetadata+본문+관련채널조회에서 각각 재조회되는 걸 못 막는다
//    (Vercel 서버리스 인스턴스별 캐시 분리 — YouTube 유닛 사고와 동일 원인). React cache() 로
//    한 번 더 감싸 "요청(렌더) 1회당 실제 조회는 1번만" 되도록 강제한다.
export const getLiveChannels = cache(
  unstable_cache(
    fetchActiveChannels,
    ["live-channels"],
    {
      revalidate: 300, // 5분
      tags: ["live-channels"],
    }
  )
);
