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

  // 카드에서 펼쳐진(재생 중인) 마커 id (없으면 null)
  const [expandedMarkerId, setExpandedMarkerId] = useState(null);
  // 카드 클릭으로 지도를 이동시킬 때 사용할 중심/줌 (null 이면 기본값 유지)
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);

  // 패널 열림 여부 = 둘 중 하나라도 선택됨
  const isPanelOpen = selectedCity !== null || selectedTag !== null;

  // 지도 기본 중심/줌 (카드로 이동 지정 전)
  const DEFAULT_CENTER = { lat: 20, lng: 0 };
  const DEFAULT_ZOOM = 2;

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
        // 필터가 바뀌면 이전에 펼쳐진 영상 상태는 초기화 (지도 위치는 유지)
        setExpandedMarkerId(null);
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
        // 필터가 바뀌면 이전에 펼쳐진 영상 상태는 초기화 (지도 위치는 유지)
        setExpandedMarkerId(null);
      }
    } catch (error) {
      console.error("[MainMapView] 태그 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 패널 닫기 (선택/영상 상태 초기화) ───────────────────────
  const closePanel = useCallback(() => {
    try {
      setSelectedCity(null);
      setSelectedTag(null);
      // 패널을 닫으면 펼쳐진 영상 상태도 함께 초기화
      setExpandedMarkerId(null);
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

  // ─── 카드 클릭 처리 (영상 펼치기 + 지도 이동) ────────────────
  // - marker 가 null(접기 버튼): 영상만 접고 지도 위치는 그대로 유지.
  // - 이미 펼쳐진 카드를 다시 클릭: 접기만 하고 지도 위치는 그대로 유지.
  // - 새 카드 선택: 그 카드로 펼치고 지도를 그 마커의 좌표로 이동/확대.
  const handleSelectMarker = useCallback(
    (marker) => {
      try {
        // 접기 버튼(null) → 영상만 접기, 지도 유지
        if (!marker) {
          setExpandedMarkerId(null);
          return;
        }

        // 같은 카드를 다시 클릭 → 접기, 지도 유지
        if (marker.id === expandedMarkerId) {
          setExpandedMarkerId(null);
          return;
        }

        // 새 카드 선택 → 펼치기 + 그 마커의 "자기 좌표"로 지도 이동/확대
        // (반복문 밖 고정 좌표가 아니라, 클릭된 marker 자신의 lat/lng 를 사용)
        const lat = Number(marker.lat);
        const lng = Number(marker.lng);

        setExpandedMarkerId(marker.id);

        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          setMapCenter({ lat, lng });
          setMapZoom(14); // 충분히 확대
        }
      } catch (error) {
        console.error("[MainMapView] 카드 선택 처리 실패:", error); // TODO: 배포 전 제거
      }
    },
    [expandedMarkerId]
  );

  // ─── 지도 마커 직접 클릭 처리 (경로 B) ───────────────────────
  // 트리에서 도시를 클릭한 것(경로 A)과 "동일한 결과 화면"이 되도록 통합한다:
  //   1) 그 마커의 도시로 selectedCity 설정 → 트리 강조/자동 펼침 + 패널 열림
  //   2) 그 마커를 expandedMarkerId 로 설정 → 카드 자동 펼침 + 영상 재생
  // ⚠️ 이미 지도에서 클릭했으므로 mapCenter/mapZoom 은 다시 설정하지 않는다(화면 튐 방지).
  //    selectedMarkerId 는 expandedMarkerId 를 통해 지도로 전달되어 강조가 갱신된다.
  const handleMarkerClick = useCallback((marker) => {
    try {
      if (!marker) return;
      setSelectedCity({
        continent: marker.continent || "",
        country: marker.country || "",
        city: marker.city || "",
      });
      setSelectedTag(null);
      setExpandedMarkerId(marker.id);
    } catch (error) {
      console.error("[MainMapView] 지도 마커 클릭 처리 실패:", error); // TODO: 배포 전 제거
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
    // ⚠️ 모바일 기초 안전장치: 각 패널에 min-width 를 두어 좁은 화면에서도 요소가
    //    0폭으로 찌그러져 텍스트가 겹치거나 버튼이 사라지지 않게 한다. 폰트는 text-xs 로 작게.
    //    좁으면 가로 스크롤이 생길 수 있으나 콘텐츠 자체는 깨지지 않는다.
    //    (본격적인 모바일 전용 UI — 하단 드로어 방식 등 — 는 추후 디자인 작업에서 진행 예정)
    <div className="flex h-screen w-full overflow-x-auto">
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
            expandedMarkerId={expandedMarkerId}
          />
        </section>
      )}

      {/* 오른쪽: 지도 (패널 열림 시 60%, 닫힘 시 90%) */}
      <main className="h-full flex-1">
        {/* 카드로 이동 지정이 있으면 그 좌표/줌을, 없으면 기본 세계 뷰를 사용 */}
        <LeafletMapWrapper
          markers={markerList}
          center={mapCenter || DEFAULT_CENTER}
          zoom={mapZoom || DEFAULT_ZOOM}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
          selectedMarkerId={expandedMarkerId}
        />
      </main>
    </div>
  );
}
