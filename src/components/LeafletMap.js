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
//
// 마커는 leaflet.markercluster 로 클러스터링한다(가까운 마커는 숫자로 뭉쳐 표시).
// 마커 1~2개짜리 소규모 지도(관리자 등록/수정 폼)에서도 문제없이 동작한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Leaflet 기본 스타일 (이걸 import 하지 않으면 타일이 어긋나고 지도가 깨진다)
import "leaflet/dist/leaflet.css";
// 마커 클러스터링 플러그인 + 스타일 (L.markerClusterGroup 을 전역 L 에 추가)
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// ─── Leaflet 마커 아이콘 CDN 경로 ─────────────────────────────
// Next.js/Turbopack 번들 환경에서는 Leaflet 기본 아이콘의 상대 경로가 깨져
// 마커가 보이지 않는 알려진 문제가 있다. 그래서 아이콘 이미지를 unpkg CDN 기준으로
// 수동 지정한다. (leaflet 1.9.x 이미지 경로)
const ICON_BASE = "https://unpkg.com/leaflet@1.9.4/dist/images/";

// ─── 기본 아이콘 전역 설정 (한 번만 적용) ─────────────────────
try {
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
// onMapClick 이 전달된 경우에만 클릭 좌표를 콜백으로 넘긴다.
// (관리자 등록/수정 폼의 "지도 클릭으로 좌표 입력"에 사용됨 — 절대 깨지면 안 됨)
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
// (객체 참조가 매 렌더 새로 생겨도 값 비교로 걸러내므로 안전)
function ChangeView({ center, zoom }) {
  const map = useMap();
  const prevViewRef = useRef(null);

  useEffect(() => {
    try {
      if (
        !center ||
        typeof center.lat !== "number" ||
        typeof center.lng !== "number"
      ) {
        return;
      }

      const prev = prevViewRef.current;
      prevViewRef.current = { lat: center.lat, lng: center.lng, zoom };

      // 최초 실행(마운트)에는 이미 초기 center 로 표시된 상태이므로 이동을 생략
      if (prev === null) {
        return;
      }

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
  }, [map, center, zoom]);

  return null;
}

// ─── 마커 클러스터 레이어 (내부 헬퍼 컴포넌트, imperative) ─────
// react-leaflet 의 <Marker> 대신, L.markerClusterGroup 을 map 인스턴스에 직접 추가한다.
// markers 가 바뀔 때마다 기존 그룹을 제거(map.removeLayer)한 뒤 새로 그려 메모리 누수를 막는다.
function MarkerClusterLayer({ markers, onMarkerClick, selectedMarkerId }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    try {
      // 이전 클러스터 그룹 정리
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }

      // 새 클러스터 그룹 생성
      const group = L.markerClusterGroup();

      const list = Array.isArray(markers) ? markers : [];
      for (const m of list) {
        if (!m) continue;
        const lat = Number(m.lat);
        const lng = Number(m.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const isSelected =
          selectedMarkerId != null && m.id === selectedMarkerId;

        const marker = L.marker([lat, lng], {
          icon: makeIcon(isSelected),
          zIndexOffset: isSelected ? 1000 : 0,
        });

        // 간단한 팝업 (장소명)
        marker.bindPopup(m.location || "이름 없는 위치");

        // 클릭: 상위 콜백 호출 + 해당 마커 좌표로 이동
        // (각 marker 는 자신의 m/lat/lng 를 클로저로 갖는다 → 엉뚱한 마커로 이동하지 않음)
        marker.on("click", () => {
          try {
            if (typeof onMarkerClick === "function") {
              onMarkerClick(m);
            }
            const targetZoom = Math.max(map.getZoom(), 8);
            map.flyTo([lat, lng], targetZoom);
          } catch (clickError) {
            console.error("[LeafletMap] 마커 클릭 처리 실패:", clickError); // TODO: 배포 전 제거
          }
        });

        group.addLayer(marker);
      }

      map.addLayer(group);
      groupRef.current = group;
    } catch (error) {
      console.error("[LeafletMap] 클러스터 생성 실패:", error); // TODO: 배포 전 제거
    }

    // 정리(언마운트/의존성 변경 시): 그룹 제거로 메모리 누수 방지
    return () => {
      try {
        if (groupRef.current) {
          map.removeLayer(groupRef.current);
          groupRef.current = null;
        }
      } catch (cleanupError) {
        console.error("[LeafletMap] 클러스터 정리 실패:", cleanupError); // TODO: 배포 전 제거
      }
    };
  }, [map, markers, onMarkerClick, selectedMarkerId]);

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

          {/* 마커 클러스터 레이어 (마커가 없어도 안전) */}
          <MarkerClusterLayer
            markers={markers}
            onMarkerClick={onMarkerClick}
            selectedMarkerId={selectedMarkerId}
          />
        </MapContainer>
      </div>
    );
  } catch (error) {
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
