"use client";

// ─────────────────────────────────────────────────────────────
// MainMapView — 메인 화면 오케스트레이터 (클라이언트)
//
// props: markers(배열), tags(배열)
//
// 지도 영역은 MapView(2D Leaflet / 3D Cesium 통합)를 사용한다. 2D/3D 전환은
// 우측 상단 토글 버튼 하나로 하며, 상태는 localStorage(livecam_map_mode)에 저장된다.
// 카테고리 트리/마커/영상 카드 클릭은 "지금 2D인지 3D인지 신경 쓰지 않고"
// mapRef 의 공통 인터페이스(flyToLocation/focusMarker/highlightSelection)만 호출한다.
//
// 레이어 토글(ISS/지진/오로라/자연재해) 상태는 이 컴포넌트에서 관리하고 MapView 에 전달한다.
// (2D↔3D 를 오가도 켜둔 토글 상태가 유지됨)
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "@/components/MapView";
import { getContinentByCountry } from "@/lib/continentUtils";
import MainCategoryTree from "@/components/MainCategoryTree";
import VideoListPanel from "@/components/VideoListPanel";
import IssVideoPanel from "@/components/IssVideoPanel";
import LiveDot from "@/components/LiveDot";
import AdSlot from "@/components/AdSlot";
import KlookWidget from "@/components/KlookWidget";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { useAutoTranslate } from "@/components/i18n/useAutoTranslate";

// 지도 기본 중심/줌 (최초 표시)
const DEFAULT_CENTER = { lat: 20, lng: 0 };
const DEFAULT_ZOOM = 2;
// 2D/3D 모드 저장 키
const MODE_STORAGE_KEY = "livecam_map_mode";

// 레이어 토글 버튼 공통 스타일 (켜짐=파랑 강조 / 꺼짐=흰색)
function toggleBtnClass(on) {
  return (
    "rounded-md border px-3 py-1.5 text-sm font-medium shadow-card transition " +
    (on
      ? "border-brand bg-brand text-white hover:bg-brand-hover"
      : "border-border bg-surface text-ink hover:bg-bg")
  );
}

export default function MainMapView({ markers, tags }) {
  // 다국어: 정적 문자열(t) + 현재 언어(locale)
  const { t, locale } = useI18n();

  // ─── 레거시 'americas' 대륙값 정규화 ─────────────────────────
  // 아메리카를 북/남으로 분리했지만 Firestore 에 아직 continent:"americas" 로 남은
  // 마커가 있으면(마이그레이션 전) 트리에 "Americas"로 뜨고 클릭이 안 된다.
  // 그래서 표시 직전에 국가코드로 north_america/south_america 를 재계산해 정규화한다.
  // (마이그레이션이 끝나면 'americas'가 없어 이 로직은 자연히 no-op 가 된다)
  const markerList = useMemo(() => {
    const arr = Array.isArray(markers) ? markers : [];
    return arr.map((m) => {
      try {
        if (m && m.continent === "americas") {
          const c = getContinentByCountry(m.country);
          if (c) return { ...m, continent: c };
        }
      } catch (error) {
        console.error("[MainMapView] 대륙값 정규화 실패:", error); // TODO: 배포 전 제거
      }
      return m;
    });
  }, [markers]);
  const tagList = Array.isArray(tags) ? tags : [];

  // ─── 동적 문자열(도시/장소명/태그) 자동 번역 ─────────────────
  // 관리자가 한글로 입력한 도시/장소명/태그를 현재 언어로 자동 번역한다(요구사항 5).
  // 여기서 한 번에 모아 요청하면(캐시 공유) 트리·패널이 같은 번역 결과를 함께 쓴다.
  const dynamicTexts = useMemo(() => {
    const set = new Set();
    for (const m of markerList) {
      if (!m) continue;
      if (m.city) set.add(String(m.city));
      if (m.location) set.add(String(m.location));
      if (Array.isArray(m.tags)) {
        for (const tg of m.tags) if (tg) set.add(String(tg));
      }
    }
    for (const tg of tagList) {
      if (tg && tg.name) set.add(String(tg.name));
    }
    return [...set];
  }, [markerList, tagList]);
  const { tr } = useAutoTranslate(dynamicTexts, locale);

  // 선택 상태 (도시/태그는 배타적으로 하나만 활성)
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);
  // 카드에서 펼쳐진(재생 중인) 마커 id
  const [expandedMarkerId, setExpandedMarkerId] = useState(null);

  // 2D/3D 모드 ('2d' | '3d') — 초기값은 effect 에서 localStorage 로부터 로드
  const [mode, setMode] = useState("2d");
  // 지도 공통 인터페이스 ref (MapView 가 flyToLocation/focusMarker/highlightSelection 제공)
  const mapRef = useRef(null);

  // ─── 레이어 토글 (기본 전부 꺼짐, 2D↔3D 전환해도 상태 유지) ──
  const [issEnabled, setIssEnabled] = useState(false); // ISS
  const [eqEnabled, setEqEnabled] = useState(false); // 지진
  const [auroraEnabled, setAuroraEnabled] = useState(false); // 오로라
  const [disasterEnabled, setDisasterEnabled] = useState(false); // 자연재해

  // ─── ISS(Space) 선택 상태 (NASA 라이브 패널) ─────────────────
  const [issSelected, setIssSelected] = useState(false);
  const [issInfo, setIssInfo] = useState(null);
  const [issVideos, setIssVideos] = useState(null);
  const issPositionRef = useRef(null); // 최신 ISS 위치(리렌더 없이 보관)
  const issSelectedRef = useRef(false); // 콜백에서 즉시 참조

  // 패널 열림 여부
  const isPanelOpen =
    selectedCity !== null || selectedTag !== null || issSelected;

  // ─── 저장된 지도 모드 로드 (마운트 1회, 클라이언트 전용) ─────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "2d" || saved === "3d") setMode(saved);
    } catch (error) {
      console.error("[MainMapView] 지도 모드 로드 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 2D/3D 토글 (+ localStorage 저장) ────────────────────────
  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "2d" ? "3d" : "2d";
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch (error) {
        console.error("[MainMapView] 지도 모드 저장 실패:", error); // TODO: 배포 전 제거
      }
      return next;
    });
  }, []);

  // ─── 지역(대륙/국가/도시) 선택 → 포커싱(2D/3D 공통) ──────────
  const handleSelectLocation = useCallback((selection) => {
    try {
      if (!selection) return;

      if (selection.city) {
        // 도시 선택 → 패널 열기 + 그 도시로 포커싱
        setSelectedCity({
          continent: selection.continent || "",
          country: selection.country || "",
          city: selection.city,
        });
        setSelectedTag(null);
        setIssSelected(false);
        issSelectedRef.current = false;
        setExpandedMarkerId(null);
        if (mapRef.current) {
          mapRef.current.highlightSelection("city", {
            continent: selection.continent || "",
            country: selection.country || "",
            city: selection.city,
          });
        }
      } else if (selection.country) {
        // 국가만 클릭 → 그 국가로 포커싱 (패널은 열지 않음)
        if (mapRef.current) {
          mapRef.current.highlightSelection("country", selection.country);
        }
      } else if (selection.continent) {
        // 대륙만 클릭 → 그 대륙으로 포커싱
        if (mapRef.current) {
          mapRef.current.highlightSelection("continent", selection.continent);
        }
      }
    } catch (error) {
      console.error("[MainMapView] 지역 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 태그 선택 → 태그 필터 ───────────────────────────────────
  const handleSelectTag = useCallback((tagName) => {
    try {
      if (tagName) {
        setSelectedTag(tagName);
        setSelectedCity(null);
        setIssSelected(false);
        issSelectedRef.current = false;
        setExpandedMarkerId(null);
      }
    } catch (error) {
      console.error("[MainMapView] 태그 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 패널 닫기 ───────────────────────────────────────────────
  const closePanel = useCallback(() => {
    try {
      setSelectedCity(null);
      setSelectedTag(null);
      setIssSelected(false);
      issSelectedRef.current = false;
      setExpandedMarkerId(null);
    } catch (error) {
      console.error("[MainMapView] 패널 닫기 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 지도 빈 곳 클릭 → 패널 닫기 (2D/3D 공통) ────────────────
  const handleMapClick = useCallback(() => {
    try {
      closePanel();
    } catch (error) {
      console.error("[MainMapView] 지도 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, [closePanel]);

  // ─── 영상 카드 클릭 (영상 펼치기 + 그 마커로 이동, 2D/3D 공통) ──
  const handleSelectMarker = useCallback(
    (marker) => {
      try {
        if (!marker) {
          setExpandedMarkerId(null); // 접기
          return;
        }
        if (marker.id === expandedMarkerId) {
          setExpandedMarkerId(null); // 같은 카드 재클릭 → 접기
          return;
        }
        setExpandedMarkerId(marker.id);
        // ⚠️ 클릭된 marker "자신"의 좌표로 이동 (반복문 클로저 고정값 아님)
        if (mapRef.current) mapRef.current.focusMarker(marker);
      } catch (error) {
        console.error("[MainMapView] 카드 선택 처리 실패:", error); // TODO: 배포 전 제거
      }
    },
    [expandedMarkerId]
  );

  // ─── ISS 위치 갱신 수신 (MapView → 2초마다) ──────────────────
  const handleIssPosition = useCallback((d) => {
    try {
      issPositionRef.current = d;
      if (issSelectedRef.current) setIssInfo(d);
    } catch (error) {
      console.error("[MainMapView] ISS 위치 갱신 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── ISS(Space) 선택 → NASA 라이브 패널 + 지도 이동 (2D/3D 공통) ─
  const handleSelectIss = useCallback(() => {
    try {
      setSelectedCity(null);
      setSelectedTag(null);
      setExpandedMarkerId(null);
      setIssSelected(true);
      issSelectedRef.current = true;

      const pos = issPositionRef.current;
      if (pos && typeof pos.lat === "number" && typeof pos.lng === "number") {
        setIssInfo(pos);
        if (mapRef.current) {
          mapRef.current.flyToLocation({ lat: pos.lat, lng: pos.lng, zoom: 4 });
        }
      }
    } catch (error) {
      console.error("[MainMapView] ISS 선택 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 지도 마커 직접 클릭 (2D/3D 공통) ────────────────────────
  // 트리 도시 클릭과 동일 결과: 그 도시로 패널 열기 + 클릭 마커 펼침.
  // (이미 마커를 클릭했으므로 지도 추가 이동은 하지 않는다)
  const handleMarkerClick = useCallback((marker) => {
    try {
      if (!marker) return;
      setSelectedCity({
        continent: marker.continent || "",
        country: marker.country || "",
        city: marker.city || "",
      });
      setSelectedTag(null);
      setIssSelected(false);
      issSelectedRef.current = false;
      setExpandedMarkerId(marker.id);
      // 마커 클릭 시 그 위치로 카메라 이동 (2D는 LeafletMap 내부에서도 이동하지만,
      // 3D는 이 호출이 있어야 이동한다 → 영상 카드 클릭과 동일한 focusMarker 흐름 재사용)
      if (mapRef.current) mapRef.current.focusMarker(marker);
    } catch (error) {
      console.error("[MainMapView] 지도 마커 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── NASA 라이브 목록 로드 + 5분마다 자동 갱신 ───────────────
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

    loadIssVideos();
    timer = setInterval(loadIssVideos, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // ─── 현재 선택 기준 필터링된 마커 ────────────────────────────
  const filteredMarkers = useMemo(() => {
    try {
      if (selectedCity) {
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
    if (selectedCity)
      return `${tr(selectedCity.city)} (${filteredMarkers.length})`;
    if (selectedTag) return `#${tr(selectedTag)} (${filteredMarkers.length})`;
    return "";
  }, [selectedCity, selectedTag, filteredMarkers, tr]);

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* 상단 헤더 바 (좌: 로고/태그라인, 우: 언어 선택) */}
      <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <LiveDot size="sm" />
        <span className="font-display text-base font-bold tracking-tight text-ink">
          LiveCam Map
        </span>
        <span className="hidden text-xs text-ink-muted sm:inline">
          {t("tagline")}
        </span>
        {/* 우측: 언어 변경 드롭다운 (요구사항 2) */}
        <div className="ml-auto">
          <LanguageSelector />
        </div>
      </header>

      {/* 콘텐츠 영역 */}
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {/* 왼쪽: 카테고리 트리 */}
        <aside className="h-full w-[12%] min-w-[240px] overflow-auto border-r border-border bg-surface">
          <MainCategoryTree
            markers={markerList}
            tags={tagList}
            tr={tr}
            onSelectLocation={handleSelectLocation}
            onSelectTag={handleSelectTag}
            onSelectSpace={handleSelectIss}
            selectedCity={selectedCity}
            selectedTag={selectedTag}
            selectedSpace={issSelected}
            spaceVideoCount={issVideos ? issVideos.length : null}
          />
        </aside>

        {/* 중간: 패널 (ISS 선택 시 NASA 라이브, 그 외 라이브캠 목록) */}
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
                tr={tr}
                onClose={closePanel}
                onSelectMarker={handleSelectMarker}
                expandedMarkerId={expandedMarkerId}
              />
            )}
          </section>
        )}

        {/* 오른쪽: 지도 (2D/3D 통합) */}
        <main className="relative h-full flex-1">
          <MapView
            ref={mapRef}
            mode={mode}
            markers={markerList}
            selectedMarkerId={expandedMarkerId}
            issEnabled={issEnabled}
            eqEnabled={eqEnabled}
            auroraEnabled={auroraEnabled}
            disasterEnabled={disasterEnabled}
            onMarkerClick={handleMarkerClick}
            onMapClick={handleMapClick}
            onIssClick={handleSelectIss}
            onIssPosition={handleIssPosition}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
          />

          {/* 우측 상단: 2D/3D 토글 + 레이어 토글 4종 (위치·스타일 유지) */}
          <div className="absolute right-3 top-3 z-[1000] flex flex-wrap justify-end gap-2">
            {/* 2D/3D 전환 (버튼 하나) */}
            <button
              type="button"
              onClick={toggleMode}
              className={toggleBtnClass(mode === "3d")}
              title={t("view2d") + " ↔ " + t("view3d")}
            >
              {mode === "3d" ? `🗺️ ${t("view2d")}` : `🌐 ${t("view3d")}`}
            </button>
            <button
              type="button"
              onClick={() => setIssEnabled((v) => !v)}
              className={toggleBtnClass(issEnabled)}
              title={t("issTrack")}
            >
              🛰️ {t("issTrack")}
            </button>
            <button
              type="button"
              onClick={() => setEqEnabled((v) => !v)}
              className={toggleBtnClass(eqEnabled)}
              title={t("earthquake")}
            >
              🌍 {t("earthquake")}
            </button>
            <button
              type="button"
              onClick={() => setAuroraEnabled((v) => !v)}
              className={toggleBtnClass(auroraEnabled)}
              title={t("aurora")}
            >
              🌌 {t("aurora")}
            </button>
            <button
              type="button"
              onClick={() => setDisasterEnabled((v) => !v)}
              className={toggleBtnClass(disasterEnabled)}
              title={t("disaster")}
            >
              🔥 {t("disaster")}
            </button>
          </div>
        </main>

        {/* 오른쪽 끝: 세로 배너형 광고 (Klook 120×600, 넓은 화면에서만 표시) */}
        <aside className="hidden w-[132px] flex-shrink-0 border-l border-border bg-surface lg:block">
          <AdSlot orientation="vertical">
            <KlookWidget />
          </AdSlot>
        </aside>
      </div>

      {/* 하단: 가로 배너형 광고 (728×90, 전체 폭) */}
      <div className="flex h-[98px] flex-shrink-0 items-stretch border-t border-border bg-surface">
        <AdSlot orientation="horizontal">
          <a
            href="https://www.kqzyfj.com/click-101809732-17272968"
            target="_blank"
            rel="sponsored noopener"
          >
            {/* 제휴 배너 이미지 (728×90) — 외부 광고 이미지라 next/image 대신 img 사용 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.awltovhc.com/image-101809732-17272968"
              width={728}
              height={90}
              alt=""
              style={{ border: 0 }}
            />
          </a>
        </AdSlot>
      </div>
    </div>
  );
}
