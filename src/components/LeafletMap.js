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

import { useEffect, useRef, useState } from "react";
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

// ─── 지도 타일 스타일 정의 (일반 / 지형도) ────────────────────
// URL 을 환경변수로 분리해 두어(없으면 기본값 사용) 나중에 타일 서비스가 불안정해지면
// URL 만 교체하면 되도록 설계한다. (예: OpenTopoMap → Thunderforest)
const MAP_STYLES = [
  {
    key: "standard",
    label: "일반 지도",
    url:
      process.env.NEXT_PUBLIC_MAP_TILE_URL_STANDARD ||
      process.env.NEXT_PUBLIC_MAP_TILE_URL || // 기존 환경변수도 호환
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
      "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  {
    key: "terrain",
    label: "지형도",
    url:
      process.env.NEXT_PUBLIC_MAP_TILE_URL_TERRAIN ||
      "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    // OpenTopoMap 저작권 표기 필수 (CC-BY-SA)
    attribution:
      "© OpenStreetMap contributors, © OpenTopoMap (CC-BY-SA)",
    // ⚠️ OpenTopoMap 은 확대레벨 13 이상 타일이 없을 수 있어 maxZoom 을 17 로 제한한다.
    //    그래도 13 이상으로 확대하면 빈(회색) 타일이 보일 수 있는데, 이는 정상 현상이다.
    maxZoom: 17,
  },
];

// localStorage 저장 키 (새로고침해도 선택한 지도 스타일 유지)
const MAP_STYLE_STORAGE_KEY = "livecam_map_style";

// 저장된 스타일 키를 읽어온다 (없거나 잘못된 값이면 "standard").
// LeafletMap 은 ssr:false 로 클라이언트에서만 로드되므로 window 접근이 안전하다.
function readSavedMapStyle() {
  try {
    const saved = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (saved && MAP_STYLES.some((s) => s.key === saved)) return saved;
  } catch (error) {
    // localStorage 사용 불가 시 기본값으로
  }
  return "standard";
}

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
// divIcon(HTML) 으로 기존 핀 이미지를 그리고, live 인 마커에는 그 위에 라이브 신호점(.live-dot)을
// CSS 오버레이로 얹는다. selected(강조) 여부에 따라 크기를 다르게 한다.
// (클러스터링/클릭 등 기존 동작은 그대로 — 시각적 오버레이만 추가)
function makeIcon(live, selected) {
  try {
    const size = selected ? [37, 61] : [25, 41];
    const anchor = selected ? [18, 61] : [12, 41];
    const w = size[0];
    const h = size[1];
    // 라이브면 핀 머리 부분 위에 신호점을 얹는다 (globals.css 의 .live-dot 애니메이션 사용)
    const pulse = live ? '<span class="live-dot"></span>' : "";
    const html =
      `<div class="lm-marker" style="width:${w}px;height:${h}px;">` +
      `<img src="${ICON_BASE}marker-icon.png" width="${w}" height="${h}" alt="" style="display:block;width:${w}px;height:${h}px;" />` +
      pulse +
      `</div>`;
    return L.divIcon({
      html,
      className: "lm-divicon",
      iconSize: size,
      iconAnchor: anchor,
      popupAnchor: [1, -34],
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

// ─── 지도 인스턴스 준비 알림 (내부 헬퍼 컴포넌트) ─────────────
// react-leaflet 의 useMap() 으로 실제 L.Map 인스턴스를 얻어 상위로 전달한다.
// (ISS 추적 등 지도에 직접 레이어를 얹는 기능이 map 인스턴스를 imperative 하게 쓰도록)
function MapReadyHandler({ onMapReady }) {
  const map = useMap();
  useEffect(() => {
    try {
      if (typeof onMapReady === "function" && map) {
        onMapReady(map);
      }
    } catch (error) {
      console.error("[LeafletMap] onMapReady 처리 실패:", error); // TODO: 배포 전 제거
    }
  }, [map, onMapReady]);
  return null;
}

// ─── 컨테이너 크기 변경 감지 → invalidateSize (내부 헬퍼) ─────
// 지도 컨테이너의 너비/높이가 바뀌면(예: 메인 화면에서 영상 패널이 열리고 닫혀
// 지도 영역 너비가 90% ↔ 60% 로 변할 때) Leaflet 은 타일이 어긋나는 렌더링 버그가 있다.
// ResizeObserver 로 컨테이너 크기 변경을 감지해 map.invalidateSize() 를 호출한다.
// (관리자 폼 등 다른 화면에서도 안전하게 동작하는 일반 로직)
function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof ResizeObserver === "undefined") return undefined;

    let observer = null;
    try {
      const container = map.getContainer();
      observer = new ResizeObserver(() => {
        try {
          map.invalidateSize();
        } catch (innerError) {
          console.error("[LeafletMap] invalidateSize 실패:", innerError); // TODO: 배포 전 제거
        }
      });
      observer.observe(container);
    } catch (error) {
      console.error("[LeafletMap] ResizeObserver 설정 실패:", error); // TODO: 배포 전 제거
    }

    return () => {
      try {
        if (observer) observer.disconnect();
      } catch (cleanupError) {
        console.error("[LeafletMap] ResizeObserver 정리 실패:", cleanupError); // TODO: 배포 전 제거
      }
    };
  }, [map]);

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
        // 실제 라이브 상태(비활성/재생불가가 아니고 is_live 가 false 가 아님)
        const isLive =
          m.auto_disabled !== true &&
          m.is_active !== false &&
          m.is_live !== false;

        const marker = L.marker([lat, lng], {
          icon: makeIcon(isLive, isSelected),
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

// ─── 지도 스타일(타일) 전환 컨트롤 (지도 위 오버레이 버튼) ─────
// 겹친 사각형(레이어) 아이콘 버튼 → 클릭 시 "일반 지도"/"지형도" 드롭다운을 연다.
// 좌측 하단에 배치(줌=좌상단, 저작권=우하단, ISS 토글=우상단과 겹치지 않음).
// ⚠️ MapContainer 의 자식이 아니라 형제(오버레이)로 렌더 → Leaflet 드래그가 클릭을 가로채지 않는다.
function LayerSwitcher({ currentKey, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 z-[1000]">
      {/* 열렸을 때: 옵션 목록 (버튼 위쪽으로 펼침) */}
      {open ? (
        <div className="mb-2 overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {MAP_STYLES.map((s) => {
            const selected = s.key === currentKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  onChange(s.key);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs transition hover:bg-brand-light " +
                  // 현재 선택된 스타일은 체크 + 강조
                  (selected ? "font-bold text-brand" : "text-ink")
                }
              >
                <span className="w-3">{selected ? "✓" : ""}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 토글 버튼 (겹친 사각형 = 레이어 아이콘) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="지도 스타일 변경 (일반/지형도)"
        aria-label="지도 스타일 변경"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink shadow-card transition hover:bg-brand-light"
      >
        {/* 겹친 사각형(레이어) SVG — 외부 아이콘 라이브러리 없이 직접 그림 */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function LeafletMap({
  markers = [],
  center = { lat: 35.68, lng: 139.76 }, // 기본값: 도쿄 부근
  zoom = 5,
  onMarkerClick,
  onMapClick,
  selectedMarkerId,
  onMapReady,
}) {
  // ─── 지도 타일 스타일 (일반/지형도) — localStorage 로 유지 ───
  const [mapStyle, setMapStyle] = useState(readSavedMapStyle);
  // 현재 스타일 설정 (없으면 첫 번째=일반)
  const currentStyle =
    MAP_STYLES.find((s) => s.key === mapStyle) || MAP_STYLES[0];

  // 스타일 변경 → 상태 갱신 + localStorage 저장 (새로고침해도 유지)
  function handleStyleChange(key) {
    try {
      setMapStyle(key);
      window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, key);
    } catch (error) {
      console.error("[LeafletMap] 지도 스타일 저장 실패:", error); // TODO: 배포 전 제거
    }
  }

  try {
    return (
      // 컨테이너 높이는 부모가 정한다 (부모에서 height 지정 필수).
      // position:relative → 레이어 전환 버튼(absolute 오버레이)의 기준이 된다.
      <div style={{ height: "100%", width: "100%", position: "relative" }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          maxZoom={19}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
          // ─── 월드 랩(무한 가로 반복) 제거 ───
          // 좌우 표시 영역을 기존(±232)보다 30% 더 넓힘(±302) → 날짜변경선 부근이 잘리지 않고
          // 태평양/뉴질랜드 등 ±180 근처도 화면 중앙에 놓고 볼 수 있다.
          // (정확히 -180~180 으로 막으면 minZoom 이 과하게 제한되므로 넉넉히 여유를 둔다.
          //  타일은 wrap 되어 넓힌 좌우에도 지도가 이어져 보이고, 이 maxBounds 로 무한 스크롤은 막는다.)
          //  ※ 여전히 잘리면 이 값(302)만 더 키우면 된다.
          maxBounds={[
            [-90, -302],
            [90, 302],
          ]}
          // 여백을 넓혔으므로 완전 고정(1.0)해도 자연스럽게 가장자리에서 멈춘다
          maxBoundsViscosity={1.0}
          // 마커 클릭 시 반대편 사본으로 점프하지 않도록 명시적 false (기본값이지만 확인)
          worldCopyJump={false}
        >
          {/* 베이스 타일 레이어. key 를 스타일 키로 주어 스타일이 바뀌면
              이전 타일 레이어를 제거하고 새로 그린다(그 위의 마커/오버레이는 유지됨).
              ※ noWrap 을 켜면 ±180 바깥이 빈(회색) 영역이 되어 넓힌 좌우가 비어 보인다.
                그래서 타일은 옆으로 이어지게(wrap) 두고, "무한 스크롤"은 위의 maxBounds(±302)로 막는다
                → 넓힌 좌우에도 실제 지도가 이어져 보이고, 특정 지점 이상은 못 가게 제한된다. */}
          <TileLayer
            key={currentStyle.key}
            url={currentStyle.url}
            attribution={currentStyle.attribution}
            maxZoom={currentStyle.maxZoom}
          />

          {/* center/zoom 변경 시 지도 이동 */}
          <ChangeView center={center} zoom={zoom} />

          {/* 지도 인스턴스 준비되면 상위로 전달 (ISS 추적 레이어용) */}
          {onMapReady ? <MapReadyHandler onMapReady={onMapReady} /> : null}

          {/* 컨테이너 크기 변경 시 invalidateSize */}
          <MapResizeHandler />

          {/* onMapClick 이 있을 때만 클릭 이벤트 감지 */}
          {onMapClick ? <MapClickHandler onMapClick={onMapClick} /> : null}

          {/* 마커 클러스터 레이어 (마커가 없어도 안전) */}
          <MarkerClusterLayer
            markers={markers}
            onMarkerClick={onMarkerClick}
            selectedMarkerId={selectedMarkerId}
          />
        </MapContainer>

        {/* 지도 스타일 전환 버튼 (지도 위 오버레이 — 베이스 타일만 바뀌고 마커는 유지) */}
        <LayerSwitcher currentKey={mapStyle} onChange={handleStyleChange} />
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
