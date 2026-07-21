// ─────────────────────────────────────────────────────────────
// getPublicMarkers — 공개(사용자용) 마커 조회 (서버 전용, 5분 캐싱)
//
// - firebaseAdmin 의 adminDb 로 markers 컬렉션에서 is_active !== false 인 마커만 조회하고,
//   추가로 auto_disabled === true (재생불가/방송종료) 인 마커도 방어적으로 제외한다.
//   (관리자 페이지와 달리 비활성/재생불가/방송종료 마커는 절대 노출하지 않음)
// - Next.js 의 unstable_cache 로 감싸 revalidate: 300(5분) 캐싱.
//   → 5분 안에 여러 명이 접속해도 실제 Firestore 읽기는 한 번만 발생한다.
// - 실패 시 빈 배열 반환 (사이트가 죽지 않도록).
//
// ⚠️ 로그인/인증과 무관한 공개 데이터다. 인증 토큰 로직을 넣지 않는다.
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";

// Firestore Timestamp 등 직렬화 불가능한 값을 클라이언트로 넘길 수 있게 변환한다.
// (Timestamp → epoch millis 숫자, 그 외는 그대로)
function toPlainValue(value) {
  try {
    if (value && typeof value.toMillis === "function") {
      return value.toMillis();
    }
    if (value && typeof value._seconds === "number") {
      return value._seconds * 1000;
    }
    return value;
  } catch (error) {
    return null;
  }
}

// 문서 데이터를 클라이언트로 전달 가능한 순수 객체로 변환
function serializeMarker(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    // 변환 실패 시 최소 정보만 유지
    console.error("[getPublicMarkers] 마커 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// 실제 Firestore 조회 (캐시 대상 함수)
async function fetchActiveMarkers() {
  try {
    const snapshot = await adminDb
      .collection("markers")
      .where("is_active", "!=", false)
      .get();

    // is_active!=false 로 이미 걸렀지만, 방어적으로 auto_disabled(재생불가/방송종료)도 제외한다.
    return snapshot.docs
      .map((doc) => serializeMarker(doc.id, doc.data()))
      .filter((m) => m.auto_disabled !== true);
  } catch (error) {
    console.error("[getPublicMarkers] Firestore 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// unstable_cache 로 감싼 캐싱 버전 (15분)
// ⚠️ 홈(지도)은 모든 마커가 필요해 전체를 읽는다(스냅샷 1문서로 못 만듦 — 마커 대량 시 1MB 초과).
//    URL 1개라 통제되지만, 재렌더당 전체 스캔이므로 캐시를 5→15분으로 늘려 콜드 스캔 빈도를 낮춘다.
//    관리자 마커 변경 시 revalidateTag("public-markers")로 즉시 무효화되므로 신선도는 유지된다.
export const getPublicMarkers = unstable_cache(
  fetchActiveMarkers,
  ["public-markers"], // 캐시 키
  {
    revalidate: 900, // 15분
    tags: ["public-markers"], // 태그 기반 무효화용
  }
);
