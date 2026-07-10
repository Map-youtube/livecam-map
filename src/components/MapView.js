"use client";

// ─────────────────────────────────────────────────────────────
// MapView — 2D(Leaflet) / 3D(Cesium) 통합 지도 렌더러
//
// MainMapView 는 이제 LeafletMap 을 직접 그리지 않고 이 컴포넌트를 쓴다.
// mode('2d'|'3d')에 따라 둘 중 하나만 렌더링하며, 위/아래 어떤 모드든
// 부모가 동일한 ref 인터페이스(flyToLocation/focusMarker/highlightSelection)로 제어한다.
//
// ★ Cesium(약 6MB)은 next/dynamic(ssr:false)으로 "3D로 전환할 때만" 로드한다.
//   3D를 한 번도 안 누른 방문자는 Cesium 다운로드가 아예 발생하지 않음(대역폭 절약).
//
// props:
//   - markers, selectedMarkerId
//   - mode: '2d' | '3d'
//   - issEnabled/eqEnabled/auroraEnabled/disasterEnabled : 레이어 토글(상위에서 관리)
//   - onMarkerClick / onMapClick / onIssClick / onIssPosition : 2D/3D 공통 콜백
//   - defaultCenter/defaultZoom : 최초 표시 위치
//
// ref: flyToLocation({lat,lng,zoom}) / focusMarker(marker) / highlightSelection(type,value)
// ─────────────────────────────────────────────────────────────

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import { toLeafletCoordRaw, getCityCenter } from "@/lib/coordUtils";
import { CONTINENT_GEO } from "@/lib/continentGeo";
import { COUNTRY_GEO } from "@/lib/countryList";

// Leaflet 오버레이 레이어들 (브라우저 전용 → ssr:false)
const IssTracker = dynamic(() => import("@/components/IssTracker"), {
  ssr: false,
});
const EarthquakeLayer = dynamic(() => import("@/components/EarthquakeLayer"), {
  ssr: false,
});
const AuroraLayer = dynamic(() => import("@/components/AuroraLayer"), {
  ssr: false,
});
const NaturalEventsLayer = dynamic(
  () => import("@/components/NaturalEventsLayer"),
  { ssr: false }
);

// Cesium 3D 렌더러 — 3D 전환 시에만 로드(대역폭 절약) + 로딩 스피너
const CesiumMapView = dynamic(() => import("@/components/CesiumMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white">
      3D 지구본을 불러오는 중...
    </div>
  ),
});

function MapView(
  {
    markers,
    selectedMarkerId,
    mode,
    issEnabled,
    eqEnabled,
    auroraEnabled,
    disasterEnabled,
    onMarkerClick,
    onMapClick,
    onIssClick,
    onIssPosition,
    defaultCenter,
    defaultZoom,
  },
  ref
) {
  const markerList = Array.isArray(markers) ? markers : [];

  // 2D: Leaflet 실제 지도 인스턴스 (onMapReady 로 받음, 오버레이 레이어 + flyTo 에 사용)
  const [leafletMap, setLeafletMap] = useState(null);
  // 3D: CesiumMapView 의 공통 인터페이스(ref 대신 apiRef 프롭으로 받음)
  const cesiumApiRef = useRef(null);

  const handleLeafletReady = useCallback((mapInstance) => {
    try {
      setLeafletMap(mapInstance);
    } catch (error) {
      console.error("[MapView] Leaflet 준비 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // ─── 공통 인터페이스: 좌표/줌으로 이동 ───────────────────────
  const flyToLocation = useCallback(
    (target) => {
      try {
        if (!target) return;
        // 경계 사각형이 있으면(대륙/국가) 영역 전체가 화면에 맞게 이동한다.
        const hasBounds =
          typeof target.west === "number" &&
          typeof target.south === "number" &&
          typeof target.east === "number" &&
          typeof target.north === "number";

        if (mode === "3d") {
          // 3D: Cesium — 경계 사각형/좌표+줌 모두 그대로 전달(내부에서 분기 처리)
          if (cesiumApiRef.current && cesiumApiRef.current.flyToLocation) {
            cesiumApiRef.current.flyToLocation(target);
          }
          return;
        }

        // 2D: Leaflet — 대륙/국가/도시 모두 동일한 부드러운 애니메이션(duration 통일)
        if (!leafletMap) return;
        const FLY_DURATION = 1.8; // 초 (약간 더 느리게 — 도시/국가/대륙 이동 느낌 일관화)
        if (hasBounds) {
          // 대륙/국가: 경계 사각형이 화면에 꽉 차도록 부드럽게 이동(flyToBounds)
          leafletMap.flyToBounds(
            [
              [target.south, target.west],
              [target.north, target.east],
            ],
            { duration: FLY_DURATION }
          );
        } else {
          // 도시/마커: 좌표 + 줌 (동일 duration 으로 부드럽게)
          const lat = Number(target.lat);
          const lng = Number(target.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) return;
          const zoom = typeof target.zoom === "number" ? target.zoom : 6;
          leafletMap.flyTo(toLeafletCoordRaw(lat, lng), zoom, {
            duration: FLY_DURATION,
          });
        }
      } catch (error) {
        console.error("[MapView] flyToLocation 실패:", error); // TODO: 배포 전 제거
      }
    },
    [mode, leafletMap]
  );

  // ─── 공통 인터페이스: 특정 마커로 이동 ───────────────────────
  const focusMarker = useCallback(
    (marker) => {
      try {
        if (!marker) return;
        // ⚠️ 클릭된 marker "자신"의 좌표를 사용 (반복문 클로저 고정값 아님)
        flyToLocation({
          lat: Number(marker.lat),
          lng: Number(marker.lng),
          zoom: 14,
        });
      } catch (error) {
        console.error("[MapView] focusMarker 실패:", error); // TODO: 배포 전 제거
      }
    },
    [flyToLocation]
  );

  // ─── 공통 인터페이스: 대륙/국가/도시 선택 시 포커싱 ──────────
  const highlightSelection = useCallback(
    (type, value) => {
      try {
        if (type === "continent") {
          const geo = CONTINENT_GEO[value];
          if (geo) flyToLocation(geo);
        } else if (type === "country") {
          const geo = COUNTRY_GEO[value];
          if (geo) flyToLocation(geo);
        } else if (type === "city") {
          // value = { continent, country, city } → 해당 도시 마커들의 평균 좌표로
          const inCity = markerList.filter(
            (m) =>
              m &&
              (m.city || "") === value.city &&
              (m.country || "") === value.country &&
              (m.continent || "") === value.continent
          );
          const center = getCityCenter(inCity);
          if (center) flyToLocation({ lat: center.lat, lng: center.lng, zoom: 10 });
        }
      } catch (error) {
        console.error("[MapView] highlightSelection 실패:", error); // TODO: 배포 전 제거
      }
    },
    [flyToLocation, markerList]
  );

  useImperativeHandle(
    ref,
    () => ({ flyToLocation, focusMarker, highlightSelection }),
    [flyToLocation, focusMarker, highlightSelection]
  );

  // ─── 렌더 ────────────────────────────────────────────────────
  if (mode === "3d") {
    // 3D: Cesium 렌더러(레이어 로직 내장). apiRef 로 공통 인터페이스 연결.
    return (
      <div className="h-full w-full">
        <CesiumMapView
          apiRef={cesiumApiRef}
          markers={markerList}
          onMarkerClick={onMarkerClick}
          onIssClick={onIssClick}
          onIssPosition={onIssPosition}
          onMapClick={onMapClick}
          issEnabled={issEnabled}
          eqEnabled={eqEnabled}
          auroraEnabled={auroraEnabled}
          disasterEnabled={disasterEnabled}
        />
      </div>
    );
  }

  // 2D: Leaflet + 오버레이 레이어들 (기존 컴포넌트 그대로 재사용)
  return (
    <div className="h-full w-full">
      <LeafletMapWrapper
        markers={markerList}
        center={defaultCenter}
        zoom={defaultZoom}
        onMapClick={onMapClick}
        onMarkerClick={onMarkerClick}
        selectedMarkerId={selectedMarkerId}
        onMapReady={handleLeafletReady}
      />

      {/* 오버레이 레이어 (leaflet 인스턴스 준비 후 동작, enabled=false 면 정지) */}
      <IssTracker
        map={leafletMap}
        enabled={issEnabled}
        onIssClick={onIssClick}
        onPositionUpdate={onIssPosition}
      />
      <EarthquakeLayer map={leafletMap} enabled={eqEnabled} />
      <AuroraLayer map={leafletMap} enabled={auroraEnabled} />
      <NaturalEventsLayer map={leafletMap} enabled={disasterEnabled} />
    </div>
  );
}

export default forwardRef(MapView);
