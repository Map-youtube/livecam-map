"use client";

// ─────────────────────────────────────────────────────────────
// MainMapView — 메인 화면 오케스트레이터 (클라이언트)
//
// props: markers(배열), tags(배열)
//
// 레이아웃: 왼쪽 10%(최소 200px) = MainCategoryTree, 나머지 90% = 지도.
//
// 이번 단계에서는 지역/태그 클릭 시 실제 동작(영상 목록 열기 등)은 만들지 않는다.
// onSelectLocation / onSelectTag 콜백 자리만 준비하고 콘솔 로그만 남긴다. (다음 단계에서 구현)
// ─────────────────────────────────────────────────────────────

import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import MainCategoryTree from "@/components/MainCategoryTree";

export default function MainMapView({ markers, tags }) {
  const markerList = Array.isArray(markers) ? markers : [];
  const tagList = Array.isArray(tags) ? tags : [];

  // ─── 지역 선택 콜백 (다음 단계에서 구현) ─────────────────────
  function handleSelectLocation(selection) {
    try {
      // 예: { continent, country, city }
      console.log("[MainMapView] 지역 선택:", selection); // TODO: 다음 단계에서 실제 동작 구현
    } catch (error) {
      console.error("[MainMapView] 지역 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 태그 선택 콜백 (다음 단계에서 구현) ─────────────────────
  function handleSelectTag(tagName) {
    try {
      console.log("[MainMapView] 태그 선택:", tagName); // TODO: 다음 단계에서 실제 동작 구현
    } catch (error) {
      console.error("[MainMapView] 태그 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  return (
    <div className="flex h-screen w-full">
      {/* 왼쪽: 카테고리 트리 (10%, 최소 200px) */}
      <aside className="h-full w-[10%] min-w-[200px] overflow-auto border-r border-gray-200 bg-white">
        <MainCategoryTree
          markers={markerList}
          tags={tagList}
          onSelectLocation={handleSelectLocation}
          onSelectTag={handleSelectTag}
        />
      </aside>

      {/* 오른쪽: 지도 (나머지 전체) */}
      <main className="h-full flex-1">
        {/* 전 세계 마커를 보기 위해 낮은 줌으로 시작 */}
        <LeafletMapWrapper
          markers={markerList}
          center={{ lat: 20, lng: 0 }}
          zoom={2}
        />
      </main>
    </div>
  );
}
