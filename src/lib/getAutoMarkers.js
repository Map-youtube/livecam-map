// ─────────────────────────────────────────────────────────────
// getAutoMarkers — 공개(사용자용) 자동 마커 조회 (서버 전용, 5분 캐싱)
//
// - auto_markers 컬렉션에서 "지금 화면에 보여야 하는" 마커만 조회한다:
//     is_active !== false  &&  auto_disabled !== true  &&  is_live === true
//   (라이브가 끝난 영상은 is_live:false 로 숨김 처리되며 문서는 보존된다.)
// - getPublicMarkers 와 동일하게 unstable_cache(revalidate 300s, tag "auto-markers").
//   → 스캔이 revalidateTag("auto-markers") 로 무효화한다.
// - 실패 시 빈 배열 반환(사이트가 죽지 않도록).
//
// ⚠️ 좌표(lat/lng)가 없는(위치 특정 실패) 마커는 지도에 못 올리므로 제외한다.
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
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

function serializeMarker(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    console.error("[getAutoMarkers] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

async function fetchActiveAutoMarkers() {
  try {
    const snapshot = await adminDb
      .collection("auto_markers")
      .where("is_live", "==", true)
      .get();

    return snapshot.docs
      .map((doc) => serializeMarker(doc.id, doc.data()))
      .filter(
        (m) =>
          m.is_active !== false &&
          m.auto_disabled !== true &&
          typeof m.lat === "number" &&
          typeof m.lng === "number"
      );
  } catch (error) {
    console.error("[getAutoMarkers] Firestore 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 홈(지도)에서 getPublicMarkers 와 함께 전체를 읽으므로 캐시를 15분으로 맞춘다(콜드 스캔 빈도↓).
// 스캔이 revalidateTag("auto-markers")로 즉시 무효화하므로 새 자동 마커의 신선도는 유지된다.
export const getAutoMarkers = unstable_cache(
  fetchActiveAutoMarkers,
  ["auto-markers"],
  {
    revalidate: 900, // 15분
    tags: ["auto-markers"],
  }
);
