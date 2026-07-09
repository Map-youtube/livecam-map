"use client";

// ─────────────────────────────────────────────────────────────
// CesiumMapView — CesiumJS 3D 지구본 렌더러 (MainMapView 지도 영역 안에서 사용)
//
// 기존 CesiumSpaceMapView(페이지 전용)를 "재사용 가능한 지도 컴포넌트"로 재구성한 것.
// 페이지 전용 UI(뒤로가기/모드 버튼/레이어 토글)는 전부 제거하고, 상위(MapView/MainMapView)가
// props 와 ref 로 제어한다. LeafletMap 과 동일한 콜백/인터페이스를 따른다.
//
// props:
//   - markers          : 라이브캠 마커 배열
//   - onMarkerClick    : 라이브캠 마커 클릭 콜백 (2D와 동일한 VideoListPanel 열기)
//   - onIssClick       : ISS 마커 클릭 콜백 (2D와 동일한 NASA 패널 열기)
//   - onIssPosition    : ISS 위치 갱신 콜백 (2초마다, 최신 좌표 전달)
//   - onMapClick       : 빈 곳 클릭 콜백 (패널 닫기)
//   - iss/eq/aurora/disaster Enabled : 레이어 토글 (상위에서 관리)
//
// ref (useImperativeHandle):
//   - flyToLocation({lat,lng,zoom}) : 카메라 이동
//   - focusMarker(marker)           : 마커로 이동
//
// ⚠️ Ion 미사용. 베이스맵은 CartoDB voyager 무료 타일. Cesium 은 프리빌드 스크립트로 로드(번들링 회피).
// ⚠️ 언마운트 시 viewer.destroy() + 모든 interval clearInterval.
// ⚠️ 지구 반대편 마커가 뚫려 보이지 않도록 disableDepthTestDistance(무한) 미사용 + 깊이테스트 정상 동작.
// ─────────────────────────────────────────────────────────────

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import * as satellite from "satellite.js";

import { getIssTrajectory } from "@/lib/issUtils";
import { getMagnitudeColor, getMagnitudeRadiusKm } from "@/lib/earthquakeUtils";
import { parseAuroraGrid } from "@/lib/auroraUtils";
import { getEventIcon } from "@/lib/naturalEventsUtils";
import { toCesiumCoordRaw } from "@/lib/coordUtils";

// ─── 갱신 주기 상수 (기존 레이어들과 동일) ────────────────────
const ISS_POLL_MS = 2000;
const ISS_TRAJ_MS = 60 * 1000;
const EQ_MS = 5 * 60 * 1000;
const AURORA_MS = 10 * 60 * 1000;
const DISASTER_MS = 15 * 60 * 1000;
const TRACK_COLOR = "#e53935";

// ─── 프리빌드 Cesium 스크립트 로더 ────────────────────────────
// import "cesium" 로 번들링하면 Turbopack 이 대용량 소스를 처리하다 멈추므로,
// public/cesium 의 프리빌드 Cesium.js 를 <script>로 로드해 window.Cesium 을 쓴다. (Ion 미사용)
let cesiumLoadPromise = null;
function loadCesium() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window 없음(SSR)"));
  }
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    try {
      window.CESIUM_BASE_URL = "/cesium";
      if (!document.getElementById("cesium-widgets-css")) {
        const link = document.createElement("link");
        link.id = "cesium-widgets-css";
        link.rel = "stylesheet";
        link.href = "/cesium/Widgets/widgets.css";
        document.head.appendChild(link);
      }
      const existing = document.getElementById("cesium-script");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.Cesium));
        existing.addEventListener("error", () =>
          reject(new Error("Cesium.js 로드 실패"))
        );
        if (window.Cesium) resolve(window.Cesium);
        return;
      }
      const script = document.createElement("script");
      script.id = "cesium-script";
      script.src = "/cesium/Cesium.js";
      script.async = true;
      script.onload = () => {
        if (window.Cesium) resolve(window.Cesium);
        else reject(new Error("Cesium 로드 후 window.Cesium 없음"));
      };
      script.onerror = () => reject(new Error("Cesium.js 로드 실패"));
      document.head.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });
  return cesiumLoadPromise;
}

// ─── 이모지 → 캔버스 텍스처 (billboard 이미지용) ──────────────
function makeEmojiCanvas(emoji, size = 44) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.font = `${Math.floor(size * 0.8)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2);
    return canvas;
  } catch (error) {
    console.error("[CesiumMapView] 이모지 캔버스 생성 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 오로라 확률(0~1) → 색상 (파랑→빨강) ──────────────────────
function auroraColor(Cesium, t) {
  try {
    if (t < 0.4) return Cesium.Color.BLUE.withAlpha(0.7);
    if (t < 0.6) return Cesium.Color.LIME.withAlpha(0.75);
    if (t < 0.8) return Cesium.Color.YELLOW.withAlpha(0.8);
    if (t < 0.9) return Cesium.Color.ORANGE.withAlpha(0.85);
    return Cesium.Color.RED.withAlpha(0.9);
  } catch (error) {
    return Cesium.Color.LIME.withAlpha(0.7);
  }
}

// Leaflet 줌 → Cesium 카메라 높이(m) 근사 (웹 메르카토르 기준)
function zoomToHeightM(zoom) {
  const z = typeof zoom === "number" && !Number.isNaN(zoom) ? zoom : 6;
  return 591657550.5 / Math.pow(2, z);
}

// ⚠️ next/dynamic 은 ref 를 자동 전달하지 않으므로, 공통 인터페이스는 forwardRef 대신
//    apiRef 프롭(콜백/ref 객체)으로 받아 useImperativeHandle 로 연결한다.
export default function CesiumMapView({
  apiRef,
  markers,
  onMarkerClick,
  onIssClick,
  onIssPosition,
  onMapClick,
  issEnabled = false,
  eqEnabled = false,
  auroraEnabled = false,
  disasterEnabled = false,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const cesiumRef = useRef(null);
  // 엔티티 → payload({kind,data}) (클릭 시 조회)
  const payloadRef = useRef(new WeakMap());

  const livecamEntsRef = useRef([]);
  const issEntsRef = useRef([]);
  const eqEntsRef = useRef([]);
  const auroraEntsRef = useRef([]);
  const disasterEntsRef = useRef([]);

  // 콜백을 ref 로 최신 유지 (뷰어 재생성 없이 최신 핸들러 참조)
  const cbRef = useRef({});
  cbRef.current = { onMarkerClick, onIssClick, onIssPosition, onMapClick };

  const [ready, setReady] = useState(false);
  // 지진/자연재해 클릭 시 뜨는 간단 정보 오버레이 (2D의 지도 팝업에 해당)
  const [info, setInfo] = useState(null); // { kind:'earthquake'|'event', data } | null

  // ─── 엔티티 배열 제거 헬퍼 ────────────────────────────────────
  function removeEntities(entRef) {
    try {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      for (const e of entRef.current) {
        try {
          viewer.entities.remove(e);
        } catch (inner) {}
      }
      entRef.current = [];
    } catch (error) {
      console.error("[CesiumMapView] 엔티티 제거 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 부모(MapView)가 호출하는 공통 인터페이스 ────────────────
  useImperativeHandle(apiRef, () => ({
    // 좌표/줌으로 카메라 이동 (2D의 flyTo 와 동일한 파라미터)
    flyToLocation(target) {
      try {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || !Cesium || viewer.isDestroyed() || !target) return;
        const lat = Number(target.lat);
        const lng = Number(target.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
        const heightM = zoomToHeightM(target.zoom);
        // 그 지점 상공 heightM 높이에 카메라 배치 (altKm = heightM/1000)
        const dest = toCesiumCoordRaw(Cesium, lat, lng, heightM / 1000);
        if (!dest) return;
        viewer.camera.flyTo({ destination: dest, duration: 1.2 });
      } catch (error) {
        console.error("[CesiumMapView] flyToLocation 실패:", error); // TODO: 배포 전 제거
      }
    },
    // 특정 마커로 이동 (자기 좌표 사용 — 클로저 고정값 아님)
    focusMarker(marker) {
      try {
        if (!marker) return;
        this.flyToLocation({
          lat: Number(marker.lat),
          lng: Number(marker.lng),
          zoom: 12,
        });
      } catch (error) {
        console.error("[CesiumMapView] focusMarker 실패:", error); // TODO: 배포 전 제거
      }
    },
  }));

  // ─── 1) 뷰어 초기화 (마운트 1회, Cesium 로드 후) ─────────────
  useEffect(() => {
    let handler = null;
    let disposed = false;

    loadCesium()
      .then((Cesium) => {
        try {
          if (disposed || !containerRef.current) return;
          cesiumRef.current = Cesium;

          // Ion 미사용 — CartoDB voyager 무료 타일 (우주 배경과 대비되어 지구가 뚜렷)
          const voyager = new Cesium.UrlTemplateImageryProvider({
            url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            credit:
              "© OpenStreetMap contributors © CARTO",
          });

          const viewer = new Cesium.Viewer(containerRef.current, {
            baseLayer: new Cesium.ImageryLayer(voyager),
            baseLayerPicker: false,
            geocoder: false,
            terrain: undefined,
            homeButton: false,
            timeline: false,
            animation: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            infoBox: false,
            selectionIndicator: false,
            fullscreenButton: false,
          });
          viewerRef.current = viewer;

          // 지구 반대편(뒷면) 엔티티가 지구에 가려지도록 깊이 테스트 활성화
          try {
            viewer.scene.globe.depthTestAgainstTerrain = true;
          } catch (e) {}

          // 클릭: 엔티티면 종류별 처리, 빈 곳이면 onMapClick
          handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
          handler.setInputAction((click) => {
            try {
              const picked = viewer.scene.pick(click.position);
              const payload =
                picked && picked.id
                  ? payloadRef.current.get(picked.id)
                  : null;
              if (payload) {
                if (payload.kind === "livecam") {
                  // 2D와 100% 동일: 부모의 onMarkerClick 만 호출
                  if (typeof cbRef.current.onMarkerClick === "function") {
                    cbRef.current.onMarkerClick(payload.data);
                  }
                } else if (payload.kind === "iss") {
                  if (typeof cbRef.current.onIssClick === "function") {
                    cbRef.current.onIssClick();
                  }
                } else if (
                  payload.kind === "earthquake" ||
                  payload.kind === "event"
                ) {
                  setInfo(payload);
                }
                return;
              }
              // 빈 곳 클릭 → 패널 닫기
              if (typeof cbRef.current.onMapClick === "function") {
                cbRef.current.onMapClick();
              }
            } catch (error) {
              console.error("[CesiumMapView] 클릭 처리 실패:", error); // TODO: 배포 전 제거
            }
          }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

          setReady(true);
        } catch (error) {
          console.error("[CesiumMapView] 뷰어 생성 실패:", error); // TODO: 배포 전 제거
        }
      })
      .catch((error) => {
        console.error("[CesiumMapView] Cesium 로드 실패:", error); // TODO: 배포 전 제거
      });

    return () => {
      disposed = true;
      try {
        if (handler && !handler.isDestroyed()) handler.destroy();
      } catch (e) {}
      try {
        const v = viewerRef.current;
        if (v && !v.isDestroyed()) v.destroy();
      } catch (e) {}
      viewerRef.current = null;
    };
  }, []);

  // ─── 2) 라이브캠 마커 (항상 표시) ────────────────────────────
  useEffect(() => {
    if (!ready) return undefined;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    try {
      removeEntities(livecamEntsRef);
      const pinBuilder = new Cesium.PinBuilder();
      const pin = pinBuilder
        .fromColor(Cesium.Color.fromCssColorString("#e1483c"), 34)
        .toDataURL();

      const list = Array.isArray(markers) ? markers : [];
      for (const m of list) {
        try {
          const lat = Number(m.lat);
          const lng = Number(m.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
          // ⚠️ 반복문 안에서 각 마커의 고유 좌표/데이터를 참조 (클로저 고정값 아님)
          const ent = viewer.entities.add({
            position: toCesiumCoordRaw(Cesium, lat, lng, 0),
            billboard: {
              image: pin,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              scale: 0.8,
              // disableDepthTestDistance 미설정 → 지구 뒷면 마커는 가려짐
            },
            label: {
              text: m.location || "",
              font: "12px sans-serif",
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
              pixelOffset: new Cesium.Cartesian2(0, -40),
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                2_000_000
              ),
            },
          });
          payloadRef.current.set(ent, { kind: "livecam", data: m });
          livecamEntsRef.current.push(ent);
        } catch (inner) {
          continue;
        }
      }
    } catch (error) {
      console.error("[CesiumMapView] 라이브캠 렌더 실패:", error); // TODO: 배포 전 제거
    }

    return () => removeEntities(livecamEntsRef);
  }, [ready, markers]);

  // ─── 3) ISS 마커 + 궤적 (고도 반영) ──────────────────────────
  useEffect(() => {
    if (!ready || !issEnabled) return undefined;
    let cancelled = false;
    let posTimer = null;
    let trajTimer = null;
    const satrecRef = { current: null };
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    let issMarker = null;

    async function pollPosition() {
      try {
        const res = await fetch("/api/iss/position", { cache: "no-store" });
        const d = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        if (!d || d.ok === false || typeof d.lat !== "number") return;

        // 최신 좌표를 부모에도 전달 (2D와 동일하게 ISS 선택 시 이동 기준값으로 사용)
        if (typeof cbRef.current.onIssPosition === "function") {
          cbRef.current.onIssPosition(d);
        }

        const altKm = typeof d.altKm === "number" ? d.altKm : 420;
        const pos = toCesiumCoordRaw(Cesium, d.lat, d.lng, altKm);
        if (!pos) return;

        if (!issMarker) {
          const icon = makeEmojiCanvas("🛰️", 44);
          issMarker = viewer.entities.add({
            position: pos,
            billboard: {
              image: icon || undefined,
              scale: 1,
            },
            label: {
              text: "ISS",
              font: "bold 13px sans-serif",
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor:
                Cesium.Color.fromCssColorString("#146c6b").withAlpha(0.8),
              pixelOffset: new Cesium.Cartesian2(0, -34),
            },
          });
          payloadRef.current.set(issMarker, { kind: "iss", data: d });
          issEntsRef.current.push(issMarker);
        } else {
          issMarker.position = pos;
          payloadRef.current.set(issMarker, { kind: "iss", data: d });
        }
      } catch (error) {
        console.error("[CesiumMapView] ISS 위치 갱신 실패:", error); // TODO: 배포 전 제거
      }
    }

    function drawTrajectory() {
      try {
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        if (!satrecRef.current) return;
        // 이전 궤적 폴리라인만 제거(마커 유지)
        const keep = [];
        for (const e of issEntsRef.current) {
          if (e && e.polyline) {
            try {
              viewer.entities.remove(e);
            } catch (inner) {}
          } else {
            keep.push(e);
          }
        }
        issEntsRef.current = keep;

        const segments = getIssTrajectory(satrecRef.current);
        for (const seg of segments) {
          if (!Array.isArray(seg) || seg.length < 2) continue;
          // [lat,lng,altKm] → Cesium [경도, 위도, 높이(m)] 평면 배열
          const flat = [];
          for (const p of seg) {
            flat.push(p[1], p[0], (Number(p[2]) || 0) * 1000);
          }
          const line = viewer.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(flat),
              width: 2,
              material: Cesium.Color.fromCssColorString(TRACK_COLOR),
              arcType: Cesium.ArcType.GEODESIC,
            },
          });
          issEntsRef.current.push(line);
        }
      } catch (error) {
        console.error("[CesiumMapView] 궤적 그리기 실패:", error); // TODO: 배포 전 제거
      }
    }

    async function loadTle() {
      try {
        const res = await fetch("/api/iss/tle", { cache: "no-store" });
        const d = await res.json();
        if (cancelled) return;
        if (!d || d.ok === false || !d.line1 || !d.line2) return;
        satrecRef.current = satellite.twoline2satrec(d.line1, d.line2);
        drawTrajectory();
      } catch (error) {
        console.warn("[CesiumMapView] TLE 로드 실패 → 궤적 생략", error); // TODO: 배포 전 제거
      }
    }

    pollPosition();
    posTimer = setInterval(pollPosition, ISS_POLL_MS);
    loadTle();
    trajTimer = setInterval(drawTrajectory, ISS_TRAJ_MS);

    return () => {
      cancelled = true;
      if (posTimer) clearInterval(posTimer);
      if (trajTimer) clearInterval(trajTimer);
      removeEntities(issEntsRef);
    };
  }, [ready, issEnabled]);

  // ─── 4) 지진 레이어 ──────────────────────────────────────────
  useEffect(() => {
    if (!ready || !eqEnabled) return undefined;
    let cancelled = false;
    let timer = null;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    async function load() {
      try {
        const res = await fetch("/api/earthquakes", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        removeEntities(eqEntsRef);
        const list = Array.isArray(data.earthquakes) ? data.earthquakes : [];
        for (const eq of list) {
          try {
            const lat = Number(eq.lat);
            const lng = Number(eq.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
            const color = Cesium.Color.fromCssColorString(
              getMagnitudeColor(eq.magnitude)
            );
            const radiusM = getMagnitudeRadiusKm(eq.magnitude) * 1000;
            const ent = viewer.entities.add({
              position: toCesiumCoordRaw(Cesium, lat, lng, 0),
              ellipse: {
                semiMinorAxis: radiusM,
                semiMajorAxis: radiusM,
                material: color.withAlpha(0.35),
                outline: true,
                outlineColor: color,
                outlineWidth: 1,
                height: 0,
              },
            });
            payloadRef.current.set(ent, { kind: "earthquake", data: eq });
            eqEntsRef.current.push(ent);
          } catch (inner) {
            continue;
          }
        }
      } catch (error) {
        console.error("[CesiumMapView] 지진 로드 실패:", error); // TODO: 배포 전 제거
      }
    }
    load();
    timer = setInterval(load, EQ_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeEntities(eqEntsRef);
    };
  }, [ready, eqEnabled]);

  // ─── 5) 오로라 레이어 (점묘화) ───────────────────────────────
  useEffect(() => {
    if (!ready || !auroraEnabled) return undefined;
    let cancelled = false;
    let timer = null;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    async function load() {
      try {
        const res = await fetch("/api/aurora-forecast", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        removeEntities(auroraEntsRef);
        const points = parseAuroraGrid(data.coordinates);
        for (const p of points) {
          try {
            const intensity = Number(p[2]);
            if (intensity < 0.2) continue; // 확률 20%+ 만
            const ent = viewer.entities.add({
              position: toCesiumCoordRaw(Cesium, p[0], p[1], 0),
              point: {
                pixelSize: 6,
                color: auroraColor(Cesium, intensity),
                outlineWidth: 0,
              },
            });
            auroraEntsRef.current.push(ent);
          } catch (inner) {
            continue;
          }
        }
      } catch (error) {
        console.error("[CesiumMapView] 오로라 로드 실패:", error); // TODO: 배포 전 제거
      }
    }
    load();
    timer = setInterval(load, AURORA_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeEntities(auroraEntsRef);
    };
  }, [ready, auroraEnabled]);

  // ─── 6) 자연재해 레이어 ──────────────────────────────────────
  useEffect(() => {
    if (!ready || !disasterEnabled) return undefined;
    let cancelled = false;
    let timer = null;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    async function load() {
      try {
        const res = await fetch("/api/natural-events", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        removeEntities(disasterEntsRef);
        const list = Array.isArray(data.events) ? data.events : [];
        for (const ev of list) {
          try {
            const lat = Number(ev.lat);
            const lng = Number(ev.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
            const icon = makeEmojiCanvas(getEventIcon(ev.category), 36);
            const ent = viewer.entities.add({
              position: toCesiumCoordRaw(Cesium, lat, lng, 0),
              billboard: { image: icon || undefined, scale: 1 },
            });
            payloadRef.current.set(ent, { kind: "event", data: ev });
            disasterEntsRef.current.push(ent);
          } catch (inner) {
            continue;
          }
        }
      } catch (error) {
        console.error("[CesiumMapView] 자연재해 로드 실패:", error); // TODO: 배포 전 제거
      }
    }
    load();
    timer = setInterval(load, DISASTER_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeEntities(disasterEntsRef);
    };
  }, [ready, disasterEnabled]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="absolute inset-0" />

      {/* 로딩 안내 (Cesium 자산 다운로드 동안) */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center text-sm text-white">
          3D 지구본을 불러오는 중...
        </div>
      )}

      {/* 지진/자연재해 클릭 정보 오버레이 (2D의 지도 팝업에 해당) */}
      {info && info.kind === "earthquake" && (
        <InfoOverlay
          onClose={() => setInfo(null)}
          title={`🌍 규모 M${
            typeof info.data.magnitude === "number"
              ? info.data.magnitude.toFixed(1)
              : "-"
          }`}
        >
          {info.data.depthKm != null && <p>깊이: {Math.round(info.data.depthKm)} km</p>}
          {info.data.time != null && (
            <p>
              발생:{" "}
              {(() => {
                try {
                  return new Date(info.data.time).toLocaleString("ko-KR");
                } catch (e) {
                  return "-";
                }
              })()}
            </p>
          )}
          {info.data.place && <p>{info.data.place}</p>}
        </InfoOverlay>
      )}

      {info && info.kind === "event" && (
        <InfoOverlay
          onClose={() => setInfo(null)}
          title={`${getEventIcon(info.data.category)} ${
            info.data.title || "자연재해"
          }`}
        >
          {info.data.categoryTitle && <p>카테고리: {info.data.categoryTitle}</p>}
          {info.data.date && (
            <p>
              발생일:{" "}
              {(() => {
                try {
                  return new Date(info.data.date).toLocaleString("ko-KR");
                } catch (e) {
                  return info.data.date;
                }
              })()}
            </p>
          )}
          {info.data.sourceUrl && (
            <p>
              <a
                href={info.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline"
              >
                출처: {info.data.sourceName || "링크"} ↗
              </a>
            </p>
          )}
          <p className="mt-2 text-[11px] text-amber-700">
            ⚠️ 참고용 정보이며 공식 경보가 아닙니다. 정확한 정보는 출처 링크를 확인하세요.
          </p>
        </InfoOverlay>
      )}
    </div>
  );
}

// ─── 정보 오버레이 카드 (지진/자연재해 공용) ──────────────────
function InfoOverlay({ title, children, onClose }) {
  return (
    <div className="absolute bottom-3 left-1/2 z-[1100] w-[92%] max-w-sm -translate-x-1/2 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded p-1 text-ink-muted transition hover:bg-brand-light hover:text-brand"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1 text-xs text-ink">{children}</div>
    </div>
  );
}
