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
import { useI18n } from "@/components/i18n/LanguageProvider";
import { ts } from "@/lib/i18n/static";
import { panelOverlayWidth } from "@/lib/coordUtils";

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
    labelKey: "mapStandard",
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
    labelKey: "mapTerrain",
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

// ─── 마커 아이콘 생성 함수 (직접 그린 SVG — 무료, 외부 아이콘 불필요) ──
// divIcon(HTML) 안에 물방울 핀 SVG 를 그린다. 종류/상태별로 모양·색이 다르다.
//   - kind === "channel" (방송) : 핀 안에 TV(안테나+화면), 기본색 노랑.
//   - 그 외 (지역 라이브캠)      : 핀 안에 재생 삼각형(▶, 유튜브 느낌), 기본색 파랑.
//   - red  : 재생 중인 마커 → 핀 전체 빨강 + 크게(강조).
//   - glow : 현재 펼쳐진 소분류/도시 목록에 해당하는 마커 → 뒤에 녹색 형광 글로우.
// (클러스터링/클릭 등 기존 동작은 그대로 — 시각적 표시만 바뀜)
function makeIcon(kind, live, red, glow) {
  try {
    // 재생 중인 마커만 크게(강조), 그 외(글로우/기본)는 기본 크기.
    const w = red ? 34 : 26;
    const h = red ? 50 : 38;
    const anchor = [Math.round(w / 2), h]; // 핀 끝(아래 중앙)이 좌표를 가리킴

    // 기본색: 재생중=빨강, 방송=노랑, 지역=파랑
    const fill = red ? "#e1483c" : kind === "channel" ? "#f5b301" : "#2e7ec1";

    // 핀(물방울) 경로 — viewBox 26x38, 끝점 (13,37)
    const pinPath =
      "M13 1 C6.4 1 1 6.2 1 12.6 C1 21 13 37 13 37 C13 37 25 21 25 12.6 C25 6.2 19.6 1 13 1 Z";

    // 핀 머리 안쪽 아이콘 (흰색)
    const inner =
      kind === "channel"
        ? // TV: 안테나 두 줄 + 화면(둥근 사각형)
          '<path d="M9 6.5 L13 10.2 M17 6.5 L13 10.2" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
          '<rect x="7" y="10.2" width="12" height="8.4" rx="1.6" fill="#fff"/>'
        : // 재생 삼각형(▶)
          '<path d="M10.4 8.6 L18 13 L10.4 17.4 Z" fill="#fff"/>';

    const svg =
      `<svg width="${w}" height="${h}" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${pinPath}" fill="${fill}" stroke="#ffffff" stroke-width="1.6"/>` +
      inner +
      `</svg>`;

    // 라이브면 핀 우상단에 작은 신호점(.live-dot) 오버레이
    const pulse = live ? '<span class="live-dot"></span>' : "";
    const wrapClass = "lm-marker" + (glow ? " lm-glow" : "");
    const html =
      `<div class="${wrapClass}" style="width:${w}px;height:${h}px;">` +
      // 형광 글로우 배경(핀보다 먼저 그려져 뒤에 깔림). glow 아닐 땐 CSS 로 숨김.
      `<span class="lm-glow-bg"></span>` +
      svg +
      pulse +
      `</div>`;
    return L.divIcon({
      html,
      className: "lm-divicon",
      iconSize: [w, h],
      iconAnchor: anchor,
      popupAnchor: [0, -h + 8],
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

// ─── 초기 "전 세계" 뷰 (메인 지도 최초 1회) ───────────────────
// 전 대륙이 가로로 꽉 차고, 왼쪽 끝엔 알래스카·오른쪽 끝엔 러시아 동단이 오도록
// 경도 -180~180 + (남/북 대륙을 담는) 위도 범위를 지도 영역에 맞춰 최초 1회 fitBounds.
// 이후 사용자의 이동/줌은 건드리지 않는다(doneRef 로 1회만 실행 보장).
// enabled=false(관리자 폼 등)면 아무 동작도 하지 않는다.
function InitialWorldFit({ enabled }) {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (!enabled || doneRef.current || !map) return;
    doneRef.current = true;
    try {
      // 컨테이너 크기가 확정된 뒤 실행되도록 whenReady 사용
      map.whenReady(() => {
        try {
          map.fitBounds(
            [
              [-56, -180], // 남서: 남미 남단 부근 ~ 태평양 서쪽 끝(±180)
              [74, 180], // 북동: 알래스카/러시아 북단 위 ~ 태평양 동쪽 끝(±180)
            ],
            { animate: false }
          );
        } catch (innerError) {
          console.error("[LeafletMap] 초기 월드뷰 fitBounds 실패:", innerError); // TODO: 배포 전 제거
        }
      });
    } catch (error) {
      console.error("[LeafletMap] 초기 월드뷰 설정 실패:", error); // TODO: 배포 전 제거
    }
  }, [map, enabled]);

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
function MarkerClusterLayer({
  markers,
  onMarkerClick,
  selectedMarkerId,
  glowMarkerIds,
  panelOpenRef,
}) {
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

      // 새 클러스터 그룹 생성.
      // 기본 클러스터 클릭(즉시 fitBounds 확대 = 너무 빠름)과 자동 스파이더파이를 끄고,
      // 아래 clusterclick 에서 flyToBounds(지속시간 지정)로 "느리고 부드럽게" 확대한다.
      const group = L.markerClusterGroup({
        zoomToBoundsOnClick: false,
        spiderfyOnMaxZoom: false,
        // 최대 줌(19)과 그 직전 단계(18)에서는 클러스터링을 끈다 → 가까이 붙은 마커도
        // 뭉치지 않고 개별 마커로 모두 보인다. (이 줌 이상에서는 클러스터가 생성되지 않음)
        disableClusteringAtZoom: 18,
      });

      // 클러스터 클릭 → "부드럽게" 확대.
      // ⚠️ 핵심: markercluster 기본 zoomToBounds 는 모든 마커를 화면에 꽉 채우는 게 아니라,
      //   "클러스터를 한 단계 풀 만큼만" 클러스터 중심을 유지한 채 확대한다(마커가 화면 밖으로
      //   흩어지지 않게). 그 로직을 그대로 재현하되 애니메이션만 느린 flyTo/flyToBounds 로 바꾼다.
      group.on("clusterclick", (e) => {
        try {
          const cluster = e.layer;
          const bounds = cluster.getBounds();
          // 같은 지점에 뭉쳐 아무리 확대해도 안 나뉘는 클러스터는 펼쳐서(spiderfy) 보여준다.
          if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
            cluster.spiderfy();
            return;
          }

          const mapZoom = map.getZoom();
          const boundsZoom = map.getBoundsZoom(bounds); // 모든 마커가 다 보이는 최대 줌
          // 이 클러스터를 "한 단계" 풀 목표 줌 계산 (markercluster 원본 로직과 동일)
          let childClusters = Array.isArray(cluster._childClusters)
            ? cluster._childClusters.slice()
            : [];
          let zoom =
            (typeof cluster._zoom === "number" ? cluster._zoom : mapZoom) + 1;
          while (childClusters.length > 0 && boundsZoom > zoom) {
            zoom += 1;
            let next = [];
            for (const cc of childClusters) {
              if (cc && Array.isArray(cc._childClusters)) {
                next = next.concat(cc._childClusters);
              }
            }
            childClusters = next;
          }

          const flyOpts = { duration: 1.0 }; // 기본 즉시확대보다 느리고 부드럽게(초)
          const panelPx =
            panelOpenRef && panelOpenRef.current
              ? panelOverlayWidth(map.getSize().x)
              : 0;

          // 좌표+줌으로 이동하되, 패널이 열려 있으면 보이는 영역 중앙 보정(중심을 왼쪽으로).
          const flyToCenter = (latlng, targetZoom) => {
            let center = latlng;
            if (panelPx > 0) {
              const pt = map.project(latlng, targetZoom);
              pt.x -= panelPx / 2;
              center = map.unproject(pt, targetZoom);
            }
            map.flyTo(center, targetZoom, flyOpts);
          };

          if (boundsZoom > zoom) {
            // 마커가 다 보이려면 더 확대해야 하지만, 화면 밖으로 흩어지지 않게
            // "한 단계"까지만 확대(클러스터 중심 유지).
            flyToCenter(cluster.getLatLng(), zoom);
          } else if (boundsZoom <= mapZoom) {
            // 이미 충분히 확대됨 → 한 칸만 더(중심 유지).
            flyToCenter(cluster.getLatLng(), mapZoom + 1);
          } else {
            // 클러스터 전체가 화면에 딱 맞는 범위 → 바운즈로 부드럽게.
            map.flyToBounds(bounds, {
              ...flyOpts,
              paddingTopLeft: panelPx > 0 ? [panelPx, 0] : [0, 0],
            });
          }
        } catch (clusterError) {
          console.error("[LeafletMap] 클러스터 클릭 처리 실패:", clusterError); // TODO: 배포 전 제거
        }
      });

      const list = Array.isArray(markers) ? markers : [];
      for (const m of list) {
        if (!m) continue;
        const lat = Number(m.lat);
        const lng = Number(m.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        // 재생 중(빨강): 현재 선택된 마커. 글로우(녹색): 현재 목록에 속하되 재생 중은 아님.
        const isRed = selectedMarkerId != null && m.id === selectedMarkerId;
        const isGlow =
          !isRed && glowMarkerIds && glowMarkerIds.has(m.id);
        // 실제 라이브 상태(비활성/재생불가가 아니고 is_live 가 false 가 아님)
        const isLive =
          m.auto_disabled !== true &&
          m.is_active !== false &&
          m.is_live !== false;

        // 방송(자동 라이브 채널) 마커는 __channel 플래그로 구분 → 노란 TV 아이콘
        const kind = m.__channel ? "channel" : "region";

        const marker = L.marker([lat, lng], {
          icon: makeIcon(kind, isLive, isRed, isGlow),
          // 재생 중 > 글로우 > 기본 순으로 위에 오게
          zIndexOffset: isRed ? 1000 : isGlow ? 500 : 0,
        });

        // hover(마우스 오버) 툴팁: 장소명(크게) + 대륙/국가/도시 + 태그 (MainMapView 에서 미리 만든 HTML).
        //   클릭은 아래 on("click") 에서 패널 열기로 처리(팝업 대신 툴팁만).
        const tipHtml =
          typeof m.tooltip === "string" && m.tooltip
            ? m.tooltip
            : `<div class="mk-tip-title">${(m.location || ts("unnamedPlace"))
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</div>`;
        marker.bindTooltip(tipHtml, {
          direction: "top",
          offset: [0, isRed ? -60 : -42], // 핀 위쪽에 뜨도록(재생 중 마커는 더 큼)
          opacity: 1,
          className: "marker-tip",
        });

        // 클릭: 상위 콜백 호출 + 해당 마커 좌표로 이동
        // (각 marker 는 자신의 m/lat/lng 를 클로저로 갖는다 → 엉뚱한 마커로 이동하지 않음)
        marker.on("click", () => {
          try {
            if (typeof onMarkerClick === "function") {
              onMarkerClick(m);
            }
            const targetZoom = Math.max(map.getZoom(), 8);
            // 영상 패널이 지도 왼쪽을 덮고 있으면(방금 onMarkerClick 이 ref 를 true 로 세팅),
            // 그 폭의 절반만큼 중심을 왼쪽으로 옮겨 마커가 "보이는 영역" 중앙에 오게 한다.
            let center = L.latLng(lat, lng);
            const panelPx =
              panelOpenRef && panelOpenRef.current
                ? panelOverlayWidth(map.getSize().x)
                : 0;
            if (panelPx > 0) {
              const pt = map.project(center, targetZoom);
              pt.x -= panelPx / 2;
              center = map.unproject(pt, targetZoom);
            }
            map.flyTo(center, targetZoom);
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
  }, [map, markers, onMarkerClick, selectedMarkerId, glowMarkerIds]);

  return null;
}

// ─── 지도 스타일(타일) 전환 컨트롤 (지도 위 오버레이 버튼) ─────
// 겹친 사각형(레이어) 아이콘 버튼 → 클릭 시 "일반 지도"/"지형도" 드롭다운을 연다.
// 좌측 하단에 배치(줌=좌상단, 저작권=우하단, ISS 토글=우상단과 겹치지 않음).
// ⚠️ MapContainer 의 자식이 아니라 형제(오버레이)로 렌더 → Leaflet 드래그가 클릭을 가로채지 않는다.
function LayerSwitcher({ currentKey, onChange, offsetLeft = 0 }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    // 영상 패널이 지도 왼쪽을 덮으면 그 폭만큼 오른쪽으로 밀어 패널에 가리지 않게 한다.
    <div
      className="absolute bottom-3 z-[1000]"
      style={{ left: `${offsetLeft + 12}px` }}
    >
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
                <span>{t(s.labelKey)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 토글 버튼 (겹친 사각형 = 레이어 아이콘) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t("mapStyle")}
        aria-label={t("mapStyle")}
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
  // 현재 목록(소분류/도시)에 해당해 녹색 형광 글로우로 표시할 마커 id 집합(Set) — 선택적.
  glowMarkerIds,
  onMapReady,
  // true 면 최초 1회 "전 세계가 가로로 꽉 차는" 뷰로 맞춘다(메인 지도 전용).
  initialWorldFit = false,
  // 메인 화면에서 영상 목록 패널이 지도 왼쪽을 덮고 있는지(줌/타일전환 버튼 위치 이동용).
  panelOpen = false,
  // 패널 덮임 여부의 "최신값" ref (마커 직접 클릭 시 내부 flyTo 보정용).
  panelOpenRef,
}) {
  // ─── 지도 타일 스타일 (일반/지형도) — localStorage 로 유지 ───
  const [mapStyle, setMapStyle] = useState(readSavedMapStyle);

  // ─── 패널이 지도를 덮는 폭(px) 측정 → 지도 컨트롤(줌/타일전환) 위치 이동 ───
  // 컨테이너 폭을 재어 CSS 의 w-[36%] min-w-[420px] 와 동일하게 패널 폭을 계산한다.
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      try {
        setContainerWidth(el.clientWidth);
      } catch (error) {
        // 무시
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      try {
        ro.disconnect();
      } catch (error) {
        // 무시
      }
    };
  }, []);
  // 패널이 열려 있을 때만 컨트롤을 그 폭만큼 오른쪽으로 옮긴다(닫히면 0 → 원위치).
  const panelOffset = panelOpen ? panelOverlayWidth(containerWidth) : 0;
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
      // --panel-offset: 영상 패널이 덮는 폭 → globals.css 에서 줌 컨트롤(.leaflet-top.leaflet-left)을 그만큼 오른쪽으로 민다.
      <div
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          "--panel-offset": `${panelOffset}px`,
        }}
      >
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
          // 초기 월드뷰가 지도 폭에 "정확히" 맞도록 소수 줌 허용(zoomSnap=0).
          // (일반 모드는 정수 줌으로 스냅)
          zoomSnap={initialWorldFit ? 0 : 1}
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

          {/* 최초 1회 전 세계 뷰로 맞춤 (메인 지도 전용, initialWorldFit=true 일 때만) */}
          <InitialWorldFit enabled={initialWorldFit} />

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
            glowMarkerIds={glowMarkerIds}
            panelOpenRef={panelOpenRef}
          />
        </MapContainer>

        {/* 지도 스타일 전환 버튼 (지도 위 오버레이 — 베이스 타일만 바뀌고 마커는 유지).
            영상 패널이 열리면 그 폭만큼 오른쪽으로 이동해 패널에 가리지 않는다. */}
        <LayerSwitcher
          currentKey={mapStyle}
          onChange={handleStyleChange}
          offsetLeft={panelOffset}
        />
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
