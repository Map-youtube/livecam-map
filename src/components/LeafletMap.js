"use client";

// ─────────────────────────────────────────────────────────────
// LeafletMap — Leaflet + OpenStreetMap 지도 본체 컴포넌트 (클라이언트 전용)
//
// ⚠️ 이 컴포넌트는 반드시 클라이언트에서만 로드되어야 한다.
//    Leaflet은 window/document 등 브라우저 API에 의존하므로 SSR 시 오류가 난다.
//    따라서 직접 import 하지 말고 LeafletMapWrapper(next/dynamic + ssr:false)를 통해 사용한다.
//
// props:
//   - markers          : 마커 배열 [{ id, lat, lng, location, ... }] (기본값 [])
//   - center           : 초기 중심 { lat, lng } (기본값 도쿄 부근)
//   - zoom             : 초기 줌 레벨 (기본값 5)
//   - onMarkerClick    : 마커 클릭 콜백 (마커 객체 전달) — 선택적
//   - onMapClick       : 지도 빈 곳 클릭 콜백 ({ lat, lng } 전달) — 선택적
//   - selectedMarkerId : 강조 표시할 마커 id — 선택적
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

// Leaflet 기본 스타일 (이걸 import 하지 않으면 타일이 어긋나고 지도가 깨진다)
import "leaflet/dist/leaflet.css";

// ─── Leaflet 마커 아이콘 CDN 경로 ─────────────────────────────
// Next.js/Turbopack 번들 환경에서는 Leaflet 기본 아이콘의 상대 경로가 깨져
// 마커가 보이지 않는 알려진 문제가 있다. 그래서 아이콘 이미지를 unpkg CDN 기준으로
// 수동 지정한다. (leaflet 1.9.x 이미지 경로)
const ICON_BASE = "https://unpkg.com/leaflet@1.9.4/dist/images/";

// ─── 기본 아이콘 전역 설정 (한 번만 적용) ─────────────────────
// L.Icon.Default 의 내부 경로 계산 로직을 제거하고, CDN 경로로 병합한다.
// 이 파일은 클라이언트에서만 로드되므로 모듈 최상단에서 실행해도 안전하지만,
// 만일의 오류에 대비해 try-catch로 감싼다.
try {
  // _getIconUrl 을 제거해야 mergeOptions 로 지정한 경로가 올바르게 사용된다.
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: ICON_BASE + "marker-icon-2x.png",
    iconUrl: ICON_BASE + "marker-icon.png",
    shadowUrl: ICON_BASE + "marker-shadow.png",
  });
} catch (error) {
  console.error("[LeafletMap] 기본 아이콘 설정 실패:", error); // TODO: 배포 전 제거
}

// ─── 마커 아이콘 생성 함수 ─────────────────────────────────────
// selected(강조) 여부에 따라 크기를 다르게 하여 선택된 마커를 시각적으로 강조한다.
// 아이콘 생성 실패 시 undefined 를 반환하여 Leaflet 기본 아이콘으로 폴백되게 한다.
function makeIcon(selected) {
  try {
    // 기본 아이콘 크기 25x41, 선택 시 약 1.5배 확대
    const size = selected ? [37, 61] : [25, 41];
    const anchor = selected ? [18, 61] : [12, 41];
    return L.icon({
      iconUrl: ICON_BASE + "marker-icon.png",
      iconRetinaUrl: ICON_BASE + "marker-icon-2x.png",
      shadowUrl: ICON_BASE + "marker-shadow.png",
      iconSize: size,
      iconAnchor: anchor,
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  } catch (error) {
    console.error("[LeafletMap] 아이콘 생성 실패:", error); // TODO: 배포 전 제거
    return undefined; // Leaflet 기본 아이콘 사용
  }
}

// ─── 지도 클릭 이벤트 핸들러 (내부 헬퍼 컴포넌트) ──────────────
// useMapEvents 는 MapContainer 자식으로 렌더링되어야 동작한다.
// onMapClick 이 전달된 경우에만 클릭 좌표를 콜백으로 넘긴다.
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      try {
        if (typeof onMapClick === "function" && e && e.latlng) {
          onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      } catch (error) {
        console.error("[LeafletMap] 지도 클릭 처리 실패:", error); // TODO: 배포 전 제거
      }
    },
  });
  return null;
}

// ─── 중심/줌 변경 반영 (내부 헬퍼 컴포넌트) ───────────────────
// center/zoom props 의 "실제 좌표 값"이 바뀔 때만 지도를 부드럽게 이동(flyTo)시킨다.
// (예: 카테고리 트리에서 특정 마커를 선택해 center 를 바꾸는 경우)
//
// ⚠️ 버그 방지 포인트:
//   부모가 center 를 객체 리터럴( {lat, lng} )로 넘기면 렌더링마다 "새 객체 참조"가 되어
//   useEffect 의존성 배열이 매 렌더마다 변경된 것으로 인식된다. 그러면 flyTo 가 매 렌더마다
//   실행되어, 마커 클릭으로 다른 곳으로 이동시켜도 곧바로 center 로 되돌아가 버린다.
//   → 참조가 아니라 "위도/경도/줌 값"을 이전 값과 비교하여, 값이 실제로 바뀐 경우에만 이동한다.
//   → 최초 마운트 시에는 MapContainer 가 이미 center/zoom 으로 초기화되므로 이동을 생략한다.
function ChangeView({ center, zoom }) {
  const map = useMap();
  // 직전에 적용한 center/zoom 값을 저장 (참조가 아닌 값 비교용)
  const prevViewRef = useRef(null);

  useEffect(() => {
    try {
      // center 값이 유효하지 않으면 아무것도 하지 않는다
      if (
        !center ||
        typeof center.lat !== "number" ||
        typeof center.lng !== "number"
      ) {
        return;
      }

      const prev = prevViewRef.current;
      // 현재 center/zoom 값을 기록
      prevViewRef.current = { lat: center.lat, lng: center.lng, zoom };

      // 최초 실행(마운트)에는 이미 초기 center 로 표시된 상태이므로 이동을 생략한다
      if (prev === null) {
        return;
      }

      // 위도/경도/줌 중 하나라도 "값"이 실제로 바뀐 경우에만 이동
      const changed =
        prev.lat !== center.lat ||
        prev.lng !== center.lng ||
        prev.zoom !== zoom;

      if (changed) {
        map.flyTo([center.lat, center.lng], zoom);
      }
    } catch (error) {
      console.error("[LeafletMap] 지도 이동(flyTo) 실패:", error); // TODO: 배포 전 제거
    }
    // center 객체 참조가 바뀌어도 내부에서 값 비교로 걸러내므로 안전하다
  }, [map, center, zoom]);

  return null;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function LeafletMap({
  markers = [],
  center = { lat: 35.68, lng: 139.76 }, // 기본값: 도쿄 부근
  zoom = 5,
  onMarkerClick,
  onMapClick,
  selectedMarkerId,
}) {
  // ─── 타일 URL / 저작권 표기 (환경변수 우선, 없으면 OSM 기본값) ───
  // 나중에 .env.local 에 유료 타일 URL만 넣으면 코드 수정 없이 교체 가능하다.
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution =
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";

  // ─── Leaflet map 인스턴스 참조 ───────────────────────────────
  // react-leaflet v5 에서 MapContainer 의 ref 는 Leaflet map 인스턴스를 가리킨다.
  // 마커 클릭 시 이 인스턴스로 "클릭된 마커의 좌표"로 직접 flyTo 하기 위해 사용한다.
  const mapRef = useRef(null);

  // ─── 마커 클릭 처리 ────────────────────────────────────────────
  // 반드시 "그 마커(clickedMarker) 자신의 좌표"로 이동시킨다.
  // (반복문 밖의 center 나 첫 번째 마커 좌표를 참조하지 않도록 개별 인자로 받는다.)
  const handleMarkerClick = (clickedMarker, markerLat, markerLng) => {
    try {
      // 1) 상위로 클릭된 마커 객체 전달 (기존 동작 유지)
      if (typeof onMarkerClick === "function") {
        onMarkerClick(clickedMarker);
      }

      // 2) 지도도 그 마커의 실제 좌표로 부드럽게 이동
      //    현재 줌이 너무 낮으면(예: 5) 도시 구분이 안 되므로 최소 8까지 확대한다.
      const map = mapRef.current;
      if (map) {
        const targetZoom = Math.max(map.getZoom(), 8);
        map.flyTo([markerLat, markerLng], targetZoom);
      }
    } catch (error) {
      console.error("[LeafletMap] 마커 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  };

  try {
    return (
      // 컨테이너 높이는 부모가 정한다 (부모에서 height 지정 필수).
      <div style={{ height: "100%", width: "100%" }}>
        <MapContainer
          ref={mapRef}
          center={[center.lat, center.lng]}
          zoom={zoom}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          {/* OSM(또는 유료) 타일 레이어 */}
          <TileLayer url={tileUrl} attribution={attribution} />

          {/* center/zoom 변경 시 지도 이동 */}
          <ChangeView center={center} zoom={zoom} />

          {/* onMapClick 이 있을 때만 클릭 이벤트 감지 */}
          {onMapClick ? <MapClickHandler onMapClick={onMapClick} /> : null}

          {/* 마커 렌더링 (마커가 없어도 지도는 정상 표시됨) */}
          {Array.isArray(markers) &&
            markers.map((m) => {
              // 유효하지 않은 마커는 건너뛴다
              if (!m) return null;
              const lat = Number(m.lat);
              const lng = Number(m.lng);
              if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

              // 선택된 마커 여부 (강조 표시)
              const isSelected =
                selectedMarkerId != null && m.id === selectedMarkerId;

              return (
                <Marker
                  key={m.id != null ? m.id : `${lat},${lng}`}
                  position={[lat, lng]}
                  icon={makeIcon(isSelected)}
                  zIndexOffset={isSelected ? 1000 : 0}
                  eventHandlers={{
                    // 이 마커(m)와 이 반복의 고유 좌표(lat, lng)를 그대로 전달한다.
                    // 각 Marker 는 자신만의 클로저를 가지므로 항상 자기 좌표로 이동한다.
                    click: () => handleMarkerClick(m, lat, lng),
                  }}
                >
                  {/* 마커 위 간단한 팝업 (장소명) */}
                  <Popup>{m.location || "이름 없는 위치"}</Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </div>
    );
  } catch (error) {
    // 렌더링 중 예기치 못한 오류 시 사용자에게 안내 표시
    console.error("[LeafletMap] 지도 렌더링 실패:", error); // TODO: 배포 전 제거
    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8d7da",
          color: "#842029",
        }}
      >
        지도를 표시할 수 없습니다.
      </div>
    );
  }
}
