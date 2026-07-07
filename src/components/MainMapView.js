"use client";

// ─────────────────────────────────────────────────────────────
// MainMapView — 메인 화면 오케스트레이터 (클라이언트)
//
// props: markers(배열), tags(배열)
//
// 레이아웃:
//   - 패널 닫힘: 왼쪽 10% 트리 + 나머지 90% 지도
//   - 패널 열림: 왼쪽 10% 트리 + 중간 30% 영상 목록 패널 + 나머지 60% 지도
//
// 패널 열기: 도시 클릭(selectedCity) 또는 태그 클릭(selectedTag).
//   - 도시/태그는 서로 배타적 — 하나를 고르면 다른 종류의 선택은 해제.
// 패널 닫기: 패널 X 버튼 또는 지도 빈 곳 클릭(onMapClick) → 선택 상태도 초기화.
//
// 필터링은 이미 받은 markers 배열을 클라이언트에서 걸러내기만 한다 (추가 API 호출 없음).
// ─────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import MainCategoryTree from "@/components/MainCategoryTree";
import VideoListPanel from "@/components/VideoListPanel";

// 대륙 코드 → 한국어 라벨 (패널 제목/지역 표시에 사용)
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  americas: "아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

export default function MainMapView({ markers, tags }) {
  const markerList = Array.isArray(markers) ? markers : [];
  const tagList = Array.isArray(tags) ? tags : [];

  // 선택 상태 (도시/태그는 배타적으로 하나만 활성)
  //   selectedCity: { continent, country, city } | null
  //   selectedTag : "야경" | null
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);

  // 패널 열림 여부 = 둘 중 하나라도 선택됨
  const isPanelOpen = selectedCity !== null || selectedTag !== null;

  // ─── 지역(도시) 선택 → 도시 필터, 태그 선택 해제 ─────────────
  const handleSelectLocation = useCallback((selection) => {
    try {
      // 도시까지 선택된 경우에만 패널을 연다 (대륙/국가만 클릭한 경우는 펼치기용)
      if (selection && selection.city) {
        setSelectedCity({
          continent: selection.continent || "",
          country: selection.country || "",
          city: selection.city,
        });
        setSelectedTag(null);
      }
    } catch (error) {
      console.error("[MainMapView] 지역 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 태그 선택 → 태그 필터, 도시 선택 해제 ───────────────────
  const handleSelectTag = useCallback((tagName) => {
    try {
      if (tagName) {
        setSelectedTag(tagName);
        setSelectedCity(null);
      }
    } catch (error) {
      console.error("[MainMapView] 태그 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 패널 닫기 (선택 상태 초기화) ────────────────────────────
  const closePanel = useCallback(() => {
    try {
      setSelectedCity(null);
      setSelectedTag(null);
    } catch (error) {
      console.error("[MainMapView] 패널 닫기 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 지도 빈 곳 클릭 → 패널 닫기 ─────────────────────────────
  // LeafletMap 은 마커가 아닌 빈 곳 클릭만 onMapClick 으로 전달한다.
  const handleMapClick = useCallback(() => {
    try {
      closePanel();
    } catch (error) {
      console.error("[MainMapView] 지도 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, [closePanel]);

  // ─── 카드 클릭 (다음 단계에서 실제 동작 구현) ────────────────
  const handleSelectMarker = useCallback((marker) => {
    try {
      console.log("[MainMapView] 카드(마커) 선택:", marker && marker.id); // TODO: 다음 단계에서 실제 동작 구현
    } catch (error) {
      console.error("[MainMapView] 카드 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 현재 선택 기준으로 필터링된 마커 ────────────────────────
  const filteredMarkers = useMemo(() => {
    try {
      if (selectedCity) {
        // 도시명 + 국가 + 대륙까지 함께 비교 (다른 나라의 동명 도시 혼입 방지)
        return markerList.filter(
          (m) =>
            m &&
            (m.city || "") === selectedCity.city &&
            (m.country || "") === selectedCity.country &&
            (m.continent || "") === selectedCity.continent
        );
      }
      if (selectedTag) {
        return markerList.filter(
          (m) => m && Array.isArray(m.tags) && m.tags.includes(selectedTag)
        );
      }
      return [];
    } catch (error) {
      console.error("[MainMapView] 필터링 실패:", error); // TODO: 배포 전 제거
      return [];
    }
  }, [markerList, selectedCity, selectedTag]);

  // ─── 패널 제목 ───────────────────────────────────────────────
  const panelTitle = useMemo(() => {
    if (selectedCity) {
      return `${selectedCity.city} (${filteredMarkers.length})`;
    }
    if (selectedTag) {
      return `#${selectedTag} (${filteredMarkers.length})`;
    }
    return "";
  }, [selectedCity, selectedTag, filteredMarkers]);

  return (
    <div className="flex h-screen w-full">
      {/* 왼쪽: 카테고리 트리 (10%, 최소 200px) */}
      <aside className="h-full w-[10%] min-w-[200px] overflow-auto border-r border-gray-200 bg-white">
        <MainCategoryTree
          markers={markerList}
          tags={tagList}
          onSelectLocation={handleSelectLocation}
          onSelectTag={handleSelectTag}
          selectedCity={selectedCity}
          selectedTag={selectedTag}
        />
      </aside>

      {/* 중간: 영상 목록 패널 (열렸을 때만, 30%) */}
      {isPanelOpen && (
        <section className="h-full w-[30%] min-w-[260px] overflow-hidden border-r border-gray-200 bg-gray-50">
          <VideoListPanel
            markers={filteredMarkers}
            title={panelTitle}
            onClose={closePanel}
            onSelectMarker={handleSelectMarker}
          />
        </section>
      )}

      {/* 오른쪽: 지도 (패널 열림 시 60%, 닫힘 시 90%) */}
      <main className="h-full flex-1">
        {/* 전 세계 마커를 보기 위해 낮은 줌으로 시작 */}
        <LeafletMapWrapper
          markers={markerList}
          center={{ lat: 20, lng: 0 }}
          zoom={2}
          onMapClick={handleMapClick}
        />
      </main>
    </div>
  );
}
