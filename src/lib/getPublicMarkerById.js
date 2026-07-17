// ─────────────────────────────────────────────────────────────
// getPublicMarkerById — 공개 마커 "1개"를 id 로 직접 조회 (서버 전용, 단일 문서 조회)
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-16 사고 대응):
//    이전에는 마커 상세 페이지가 "마커 1개"를 찾기 위해 getNormalizedPublicMarkers()로
//    공개 마커 전체(수동+자동, 수백~수천 개)를 통째로 읽고 그중 하나를 find() 했다.
//    마커 상세 페이지가 수백 개(현재 약 465개)라, generateMetadata+본문에서 각각 호출되며
//    페이지 1개당 최대 전체 컬렉션 조회가 여러 번 반복 → 실제로 하루 Firestore 무료 읽기
//    한도(월 30만)를 하루 만에 넘기는 사고로 이어졌다.
//    이 함수는 id 를 알고 있으므로 markers/{id}, auto_markers/{id} 문서 2개만 직접 읽는다
//    (최악의 경우도 2회 읽기 — 컬렉션 크기와 무관).
//
// 필터 규칙은 getPublicMarkers.js / getAutoMarkers.js 와 완전히 동일하게 유지한다
// (공개 화면에 안 보이는 마커가 상세 페이지에서만 보이는 불일치를 막기 위함):
//   - 수동 마커(markers): is_active !== false && auto_disabled !== true
//   - 자동 마커(auto_markers): is_live === true && is_active !== false &&
//                              auto_disabled !== true && lat/lng 가 숫자
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeContinent } from "@/lib/seoData";

// Firestore Timestamp 등 직렬화 불가능한 값을 순수 값으로 변환 (getPublicMarkers.js 와 동일 로직)
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
    console.error("[getPublicMarkerById] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// 공개 마커 1개 조회 (없거나 비공개면 null)
export async function getPublicMarkerById(id) {
  try {
    if (!id || typeof id !== "string") return null;

    // 1) 수동 마커(markers) 먼저 확인
    const manualSnap = await adminDb.collection("markers").doc(id).get();
    if (manualSnap.exists) {
      const data = manualSnap.data() || {};
      if (data.is_active !== false && data.auto_disabled !== true) {
        return normalizeContinent(serializeMarker(manualSnap.id, data));
      }
      // 존재하지만 비공개(비활성/재생불가) → 공개 페이지에는 없는 것으로 처리
      return null;
    }

    // 2) 자동 마커(auto_markers) 확인
    const autoSnap = await adminDb.collection("auto_markers").doc(id).get();
    if (autoSnap.exists) {
      const data = autoSnap.data() || {};
      const visible =
        data.is_live === true &&
        data.is_active !== false &&
        data.auto_disabled !== true &&
        typeof data.lat === "number" &&
        typeof data.lng === "number";
      if (visible) {
        return normalizeContinent(serializeMarker(autoSnap.id, data));
      }
      return null;
    }

    return null;
  } catch (error) {
    console.error("[getPublicMarkerById] 조회 실패:", id, error); // TODO: 배포 전 제거
    return null;
  }
}
