// ─────────────────────────────────────────────────────────────
// getMapMarkers — 공개 화면에 뿌릴 "전체 마커" = 수동 마커 ∪ 자동(AI) 마커 (서버 전용)
//
// - 기존 수동 마커(markers, getPublicMarkers)와 새 자동 마커(auto_markers, getAutoMarkers)를 합친다.
//   두 소스 모두 필드 형태가 같으므로, 합친 배열을 기존 트리/목록/지도/정적페이지가 그대로 소비한다.
//   → 사용자 화면 구조/컴포넌트는 하나도 바뀌지 않는다(영상 출처만 늘어남).
//
// - 중복 방지: 같은 youtube_video_id 가 수동·자동 양쪽에 있으면 수동(사람이 큐레이션한 것)을 우선.
//   (item 13 임포트 등으로 겹칠 때 지도에 중복 마커가 뜨지 않게.)
//
// - 롤백 스위치: 환경변수 AUTO_MARKERS_ENABLED="false" 이면 자동 마커를 병합하지 않는다.
//   → 데이터 손실 없이 즉시 옛 방식(수동 마커만)으로 복귀. (기본값: 켬)
//
// ⚠️ 두 소스 모두 각자 unstable_cache(5분)로 캐싱되므로 여기서 추가 캐싱은 하지 않는다.
// ─────────────────────────────────────────────────────────────

import { getPublicMarkers } from "@/lib/getPublicMarkers";
import { getAutoMarkers } from "@/lib/getAutoMarkers";
import { getIndexedPublicMarkers } from "@/lib/markerIndex";

// 자동 마커 병합 여부 (기본 켬. "false" 로 두면 롤백)
function autoMarkersEnabled() {
  return String(process.env.AUTO_MARKERS_ENABLED || "").trim() !== "false";
}

export async function getMapMarkers() {
  // ⚠️ Firestore 읽기 절감(2026-07-26): 우선 "청크 인덱스"(marker_index)에서 읽는다.
  //    인덱스는 공개 여부 필터와 전역 중복제거를 이미 적용해 저장하므로 결과가 아래 기존
  //    경로와 동일하다. 마커가 3만 개여도 읽기는 청크 수(수십 개)로 고정된다.
  //    ⚠️ 인덱스가 없거나 조회에 실패하면 null 이 오고, 그때는 아래 기존 방식(컬렉션 스캔)으로
  //       그대로 폴백한다 → 인덱스에 문제가 생겨도 사이트는 평소처럼 동작한다.
  //    ⚠️ 자동 마커 롤백 스위치가 꺼져 있으면 인덱스를 쓰지 않는다(인덱스는 자동 마커 포함).
  if (autoMarkersEnabled()) {
    try {
      const indexed = await getIndexedPublicMarkers();
      if (Array.isArray(indexed) && indexed.length > 0) return indexed;
    } catch (error) {
      console.error("[getMapMarkers] 인덱스 조회 실패 → 기존 방식 폴백:", error); // TODO: 배포 전 제거
    }
  }

  try {
    const [manual, auto] = await Promise.all([
      getPublicMarkers().catch(() => []),
      autoMarkersEnabled() ? getAutoMarkers().catch(() => []) : Promise.resolve([]),
    ]);

    const manualList = Array.isArray(manual) ? manual : [];
    const autoList = Array.isArray(auto) ? auto : [];

    // 수동 마커에 이미 있는 영상 ID 는 자동 쪽에서 제외(중복 방지)
    const manualVideoIds = new Set(
      manualList.map((m) => m && m.youtube_video_id).filter(Boolean)
    );
    const autoDeduped = autoList.filter(
      (m) => !(m && m.youtube_video_id && manualVideoIds.has(m.youtube_video_id))
    );

    return [...manualList, ...autoDeduped];
  } catch (error) {
    console.error("[getMapMarkers] 병합 실패:", error); // TODO: 배포 전 제거
    // 실패 시에도 최소한 수동 마커는 보이도록
    try {
      const manual = await getPublicMarkers();
      return Array.isArray(manual) ? manual : [];
    } catch (e) {
      return [];
    }
  }
}
