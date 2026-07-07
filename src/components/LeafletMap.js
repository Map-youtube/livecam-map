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

import { useEffect } from "react";
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
// center/zoom props 가 바뀌면 지도를 해당 위치로 부드럽게 이동(flyTo)시킨다.
// (예: 카테고리 트리에서 마커 선택 시 지도 이동 — 재사용성을 위해 포함)
function ChangeView({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    try {
      if (
        center &&
        typeof center.lat === "number" &&
        typeof center.lng === "number"
      ) {
        map.flyTo([center.lat, center.lng], zoom);
      }
    } catch (error) {
      console.error("[LeafletMap] 지도 이동(flyTo) 실패:", error); // TODO: 배포 전 제거
    }
    // center/zoom 값이 바뀔 때만 실행
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

  try {
    return (
      // 컨테이너 높이는 부모가 정한다 (부모에서 height 지정 필수).
      <div style={{ height: "100%", width: "100%" }}>
        <MapContainer
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
                    click: () => {
                      try {
                        if (typeof onMarkerClick === "function") {
                          onMarkerClick(m);
                        }
                      } catch (error) {
                        console.error(
                          "[LeafletMap] 마커 클릭 처리 실패:",
                          error
                        ); // TODO: 배포 전 제거
                      }
                    },
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
