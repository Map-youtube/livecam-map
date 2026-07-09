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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import MainCategoryTree from "@/components/MainCategoryTree";
import VideoListPanel from "@/components/VideoListPanel";
import IssVideoPanel from "@/components/IssVideoPanel";
import LiveDot from "@/components/LiveDot";

// ISS 추적 레이어는 Leaflet(브라우저 전용)을 직접 사용하므로 ssr:false 로 로드한다.
const IssTracker = dynamic(() => import("@/components/IssTracker"), {
  ssr: false,
});

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

  // ─── ISS 추적 상태 ───────────────────────────────────────────
  // issMap: LeafletMap 이 준비되면 전달하는 실제 지도 인스턴스
  // issEnabled: ISS 추적 표시 여부 (기본 켜짐)
  const [issMap, setIssMap] = useState(null);
  const [issEnabled, setIssEnabled] = useState(true);

  // ─── ISS(Space) 선택 상태 ────────────────────────────────────
  // issSelected: 트리 Space>ISS 또는 지도 ISS 마커를 선택해 NASA 라이브 패널이 열린 상태
  // issInfo    : 패널 상단에 표시할 현재 ISS 위치 정보 (열려 있을 때만 갱신)
  const [issSelected, setIssSelected] = useState(false);
  const [issInfo, setIssInfo] = useState(null);
  // NASA 라이브 영상 목록 (트리 개수 배지 + ISS 패널이 공유). null=아직 로딩 전
  const [issVideos, setIssVideos] = useState(null);
  // 최신 ISS 위치(2초마다 갱신)를 리렌더 없이 보관 → 선택 시점에 지도 이동 기준값으로 사용
  const issPositionRef = useRef(null);
  // 현재 ISS 선택 여부를 콜백(2초 주기)에서 즉시 참조하기 위한 ref
  const issSelectedRef = useRef(false);

  // 패널 열림 여부 = 도시/태그/ISS 중 하나라도 선택됨
  const isPanelOpen =
    selectedCity !== null || selectedTag !== null || issSelected;

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
        // ISS 선택도 해제 (배타적)
        setIssSelected(false);
        issSelectedRef.current = false;
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
        // ISS 선택도 해제 (배타적)
        setIssSelected(false);
        issSelectedRef.current = false;
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
      // ISS 선택도 해제
      setIssSelected(false);
      issSelectedRef.current = false;
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

  // ─── 지도 인스턴스 준비 → ISS 레이어에 전달 ──────────────────
  const handleMapReady = useCallback((mapInstance) => {
    try {
      setIssMap(mapInstance);
    } catch (error) {
      console.error("[MainMapView] 지도 준비 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── ISS 위치 갱신 수신 (IssTracker 가 2초마다 호출) ─────────
  // 리렌더 폭주를 막기 위해 항상 ref 에만 저장하고,
  // ISS 패널이 열려 있을 때만 상단 정보(issInfo) state 를 갱신한다.
  const handleIssPosition = useCallback((d) => {
    try {
      issPositionRef.current = d;
      if (issSelectedRef.current) setIssInfo(d);
    } catch (error) {
      console.error("[MainMapView] ISS 위치 갱신 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── ISS(Space) 선택 → NASA 라이브 패널 열기 + 지도 이동 ─────
  // 트리 Space>ISS 클릭과 지도 ISS 마커 클릭이 모두 이 핸들러를 호출한다(동일 동작).
  const handleSelectIss = useCallback(() => {
    try {
      // 다른 선택은 해제 (배타적)
      setSelectedCity(null);
      setSelectedTag(null);
      setExpandedMarkerId(null);
      setIssSelected(true);
      issSelectedRef.current = true;

      // 현재 ISS 위치가 있으면 그 위치로 지도 이동 + 패널 상단 정보 세팅
      const pos = issPositionRef.current;
      if (pos && typeof pos.lat === "number" && typeof pos.lng === "number") {
        setMapCenter({ lat: pos.lat, lng: pos.lng });
        setMapZoom(4);
        setIssInfo(pos);
      }
    } catch (error) {
      console.error("[MainMapView] ISS 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── NASA 라이브 목록 로드 + 5분마다 자동 갱신 ───────────────
  // 트리의 Space/ISS 개수 배지와 ISS 패널이 이 목록을 공유한다(호출 1곳으로 통합).
  // 서버 라우트가 5분 캐시라, 방문자가 5분마다 호출해도 videos.list 는 5분 1회.
  // ⚠️ interval 은 언마운트 시 반드시 clearInterval (누수/중복 방지).
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function loadIssVideos() {
      try {
        const res = await fetch("/api/iss/videos", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setIssVideos(Array.isArray(data.videos) ? data.videos : []);
      } catch (error) {
        console.error("[MainMapView] NASA 라이브 목록 조회 실패:", error); // TODO: 배포 전 제거
        if (!cancelled) setIssVideos([]);
      }
    }

    loadIssVideos(); // 즉시 1회
    timer = setInterval(loadIssVideos, 5 * 60 * 1000); // 5분마다 갱신

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

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
      // ISS 선택도 해제 (배타적)
      setIssSelected(false);
      issSelectedRef.current = false;
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
    // 세로 flex: 상단 헤더 + 나머지(flex-1) 콘텐츠 → 헤더 높이만큼 자동으로 빠진다.
    // ⚠️ 모바일 기초 안전장치: 각 패널에 min-width 를 둬서 좁은 화면에서도 요소가 찌그러지지 않게 한다.
    //    (본격적인 모바일 전용 UI — 하단 드로어 방식 등 — 는 추후 디자인 작업에서 진행 예정)
    <div className="flex h-screen flex-col bg-bg">
      {/* 상단 헤더 바 (얇게, 로고 텍스트) */}
      <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <LiveDot size="sm" />
        <span className="font-display text-base font-bold tracking-tight text-ink">
          LiveCam Map
        </span>
        <span className="hidden text-xs text-ink-muted sm:inline">
          세계 라이브 지도
        </span>
      </header>

      {/* 콘텐츠 영역 (남은 높이 전부) */}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {/* 왼쪽: 카테고리 트리 (10%, 최소 200px) */}
        <aside className="h-full w-[10%] min-w-[200px] overflow-auto border-r border-border bg-surface">
          <MainCategoryTree
            markers={markerList}
            tags={tagList}
            onSelectLocation={handleSelectLocation}
            onSelectTag={handleSelectTag}
            onSelectSpace={handleSelectIss}
            selectedCity={selectedCity}
            selectedTag={selectedTag}
            selectedSpace={issSelected}
            spaceVideoCount={issVideos ? issVideos.length : null}
          />
        </aside>

        {/* 중간: 패널 (열렸을 때만, 30%) — ISS 선택 시 NASA 라이브, 그 외 라이브캠 목록 */}
        {isPanelOpen && (
          <section className="h-full w-[30%] min-w-[260px] overflow-hidden border-r border-border bg-bg">
            {issSelected ? (
              <IssVideoPanel
                videos={issVideos}
                issInfo={issInfo}
                onClose={closePanel}
              />
            ) : (
              <VideoListPanel
                markers={filteredMarkers}
                title={panelTitle}
                onClose={closePanel}
                onSelectMarker={handleSelectMarker}
                expandedMarkerId={expandedMarkerId}
              />
            )}
          </section>
        )}

        {/* 오른쪽: 지도 (패널 열림 시 60%, 닫힘 시 90%) */}
        <main className="relative h-full flex-1">
          {/* 카드로 이동 지정이 있으면 그 좌표/줌을, 없으면 기본 세계 뷰를 사용 */}
          <LeafletMapWrapper
            markers={markerList}
            center={mapCenter || DEFAULT_CENTER}
            zoom={mapZoom || DEFAULT_ZOOM}
            onMapClick={handleMapClick}
            onMarkerClick={handleMarkerClick}
            selectedMarkerId={expandedMarkerId}
            onMapReady={handleMapReady}
          />

          {/* ISS 추적 토글 (우측 상단 — 줌 버튼은 좌측 상단이라 겹치지 않음) */}
          <button
            type="button"
            onClick={() => setIssEnabled((v) => !v)}
            className={
              "absolute right-3 top-3 z-[1000] rounded-md border px-3 py-1.5 text-sm font-medium shadow-card transition " +
              (issEnabled
                ? "border-brand bg-brand text-white hover:bg-brand-hover"
                : "border-border bg-surface text-ink hover:bg-bg")
            }
            title="ISS(국제우주정거장) 실시간 위치 추적 켜기/끄기"
          >
            🛰️ ISS 추적 {issEnabled ? "켜짐" : "꺼짐"}
          </button>

          {/* ISS 실시간 위치·궤적 레이어 (enabled=false 면 타이머 정지+레이어 제거) */}
          {/* onIssClick: 마커 클릭 시 NASA 라이브 패널 오픈 / onPositionUpdate: 최신 좌표 수신 */}
          <IssTracker
            map={issMap}
            enabled={issEnabled}
            onIssClick={handleSelectIss}
            onPositionUpdate={handleIssPosition}
          />
        </main>
      </div>
    </div>
  );
}
