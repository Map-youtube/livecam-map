"use client";

// ─────────────────────────────────────────────────────────────
// CesiumSpaceMapView — CesiumJS 기반 2D/3D/2.5D 우주 지도 (클라이언트 전용)
//
// 기존 라이브캠 마커·ISS·지진·오로라·자연재해 기능을 동일 API로 그대로 재사용하되,
// 렌더링만 Cesium 엔티티로 새로 구현한다. (fetch/캐싱 로직은 기존 것과 동일)
//
// ⚠️ Cesium Ion 미사용: Ion 토큰/지형/geocoder/3D Tiles 를 전혀 사용하지 않는다.
//    베이스맵은 CartoDB(무료 OSM 타일)만 사용. 정적 자산은 /cesium (public) 에서 로드.
// ⚠️ Cesium 은 브라우저 전용 → 반드시 next/dynamic { ssr:false } 로 로드한다(space-map/page.js).
// ⚠️ 언마운트 시 viewer.destroy() + 모든 interval clearInterval (메모리 누수 방지).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as satellite from "satellite.js";

import VideoListPanel from "@/components/VideoListPanel";
import { getIssTrajectory, getIssCesiumPosition } from "@/lib/issUtils";
import { getMagnitudeColor, getMagnitudeRadiusKm } from "@/lib/earthquakeUtils";
import { parseAuroraGrid } from "@/lib/auroraUtils";
import { getEventIcon } from "@/lib/naturalEventsUtils";

// ─── 프리빌드 Cesium 스크립트 로더 ────────────────────────────
// ⚠️ `import "cesium"` 로 번들링하면 Turbopack 이 대용량 소스를 처리하다 빌드가 멈춘다.
//    그래서 public/cesium 의 프리빌드 Cesium.js 를 <script>로 로드해 window.Cesium 을 쓴다.
//    (Ion 미사용 — 정적 자산은 전부 /cesium 에서 로드, 외부 Ion 호출 없음)
let cesiumLoadPromise = null;
function loadCesium() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window 없음(SSR)"));
  }
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    try {
      // Cesium 이 워커/텍스처를 찾을 기준 경로 (스크립트 로드 전에 설정)
      window.CESIUM_BASE_URL = "/cesium";

      // 위젯 CSS
      if (!document.getElementById("cesium-widgets-css")) {
        const link = document.createElement("link");
        link.id = "cesium-widgets-css";
        link.rel = "stylesheet";
        link.href = "/cesium/Widgets/widgets.css";
        document.head.appendChild(link);
      }

      // 이미 로드 중인 스크립트가 있으면 재사용
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

// ─── 갱신 주기 상수 (기존 레이어들과 동일) ────────────────────
const ISS_POLL_MS = 2000; // ISS 위치 2초
const ISS_TRAJ_MS = 60 * 1000; // 궤적 재계산 1분
const EQ_MS = 5 * 60 * 1000; // 지진 5분
const AURORA_MS = 10 * 60 * 1000; // 오로라 10분
const DISASTER_MS = 15 * 60 * 1000; // 자연재해 15분
const TRACK_COLOR = "#e53935"; // 궤적 빨강

// ─── 이모지를 캔버스에 그려 billboard 텍스처로 (외부 이미지 의존 없음) ──
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
    console.error("[CesiumSpaceMapView] 이모지 캔버스 생성 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 오로라 확률(0~1) → 색상 (파랑→초록→노랑→주황→빨강) ──────
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

// ─── 레이어 토글 버튼 공통 스타일 ─────────────────────────────
function toggleBtnClass(on) {
  return (
    "rounded-md border px-3 py-1.5 text-sm font-medium shadow-card transition " +
    (on
      ? "border-brand bg-brand text-white hover:bg-brand-hover"
      : "border-border bg-surface text-ink hover:bg-bg")
  );
}

export default function CesiumSpaceMapView() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  // 스크립트로 로드한 window.Cesium 참조 (모든 레이어 effect 가 공유)
  const cesiumRef = useRef(null);
  // 엔티티가 준비되면 클릭 시 정보를 찾기 위한 payload 맵 (entity → {kind,data})
  const payloadRef = useRef(new WeakMap());

  // 각 레이어의 엔티티 보관 (재조회/토글 시 제거용)
  const livecamEntsRef = useRef([]);
  const issEntsRef = useRef([]);
  const eqEntsRef = useRef([]);
  const auroraEntsRef = useRef([]);
  const disasterEntsRef = useRef([]);

  const [ready, setReady] = useState(false);
  const [sceneMode, setSceneMode] = useState("3D"); // 3D | 2D | columbus

  // 레이어 토글 (라이브캠은 항상 표시라 토글 없음). ISS 기본 켜짐.
  const [issEnabled, setIssEnabled] = useState(true);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [auroraEnabled, setAuroraEnabled] = useState(false);
  const [disasterEnabled, setDisasterEnabled] = useState(false);

  // 클릭 시 뜨는 오버레이 정보 { kind:'livecam'|'earthquake'|'event', data } | null
  const [overlay, setOverlay] = useState(null);
  // 라이브캠 오버레이에서 펼쳐진(재생 중인) 마커 id
  const [livecamExpandedId, setLivecamExpandedId] = useState(null);

  // ─── 공통: 엔티티 배열 제거 헬퍼 ──────────────────────────────
  function removeEntities(ref) {
    try {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      for (const e of ref.current) {
        try {
          viewer.entities.remove(e);
        } catch (inner) {}
      }
      ref.current = [];
    } catch (error) {
      console.error("[CesiumSpaceMapView] 엔티티 제거 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 1) 뷰어 초기화 (마운트 1회, Cesium 스크립트 로드 후) ────
  useEffect(() => {
    let handler = null;
    let disposed = false; // 로드 완료 전에 언마운트되면 뷰어를 만들지 않음

    loadCesium()
      .then((Cesium) => {
        try {
          if (disposed || !containerRef.current) return;
          cesiumRef.current = Cesium;

          // Ion 미사용 — CartoDB 무료 타일을 베이스맵으로 사용
          const osmLabels = new Cesium.UrlTemplateImageryProvider({
            url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            credit:
              "Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.",
          });

          const viewer = new Cesium.Viewer(containerRef.current, {
            baseLayer: new Cesium.ImageryLayer(osmLabels),
            baseLayerPicker: false,
            geocoder: false, // Ion geocoder 미사용
            terrain: undefined, // Ion 지형 미사용
            homeButton: true,
            timeline: false, // 시간 슬라이더 불필요
            animation: false,
            sceneModePicker: false, // 커스텀 2D/3D/2.5D 버튼을 따로 제공
            navigationHelpButton: false,
            infoBox: false, // 기본 정보창 대신 커스텀 오버레이 사용
            selectionIndicator: false,
            fullscreenButton: false,
          });
          viewerRef.current = viewer;

          // ─── 클릭 이벤트: 엔티티 클릭 시 커스텀 오버레이 열기 ───
          handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
          handler.setInputAction((click) => {
            try {
              const picked = viewer.scene.pick(click.position);
              if (picked && picked.id) {
                const payload = payloadRef.current.get(picked.id);
                if (payload) {
                  setOverlay(payload);
                  // 라이브캠이면 클릭한 마커를 바로 펼쳐 재생
                  if (payload.kind === "livecam" && payload.data) {
                    setLivecamExpandedId(payload.data.id);
                  }
                  return;
                }
              }
            } catch (error) {
              console.error("[CesiumSpaceMapView] 클릭 처리 실패:", error); // TODO: 배포 전 제거
            }
          }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

          setReady(true);
        } catch (error) {
          console.error("[CesiumSpaceMapView] 뷰어 생성 실패:", error); // TODO: 배포 전 제거
        }
      })
      .catch((error) => {
        console.error("[CesiumSpaceMapView] Cesium 로드 실패:", error); // TODO: 배포 전 제거
      });

    // 정리: 핸들러/뷰어 파괴
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
    let cancelled = false;
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return undefined;

    async function load() {
      try {
        const res = await fetch("/api/markers", { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        removeEntities(livecamEntsRef);

        const pinBuilder = new Cesium.PinBuilder();
        const pin = pinBuilder
          .fromColor(Cesium.Color.fromCssColorString("#e1483c"), 34)
          .toDataURL();

        const list = Array.isArray(data.markers) ? data.markers : [];
        for (const m of list) {
          try {
            const lat = Number(m.lat);
            const lng = Number(m.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
              billboard: {
                image: pin,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scale: 0.8,
              },
              label: {
                text: m.location || "",
                font: "12px sans-serif",
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
                pixelOffset: new Cesium.Cartesian2(0, -40),
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                // 너무 많은 라벨이 겹치지 않도록 가까이서만 표시
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
        console.error("[CesiumSpaceMapView] 라이브캠 로드 실패:", error); // TODO: 배포 전 제거
      }
    }
    load();

    return () => {
      cancelled = true;
      removeEntities(livecamEntsRef);
    };
  }, [ready]);

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

    // ISS 마커 엔티티는 하나만 유지하며 위치만 갱신
    let issMarker = null;

    async function pollPosition() {
      try {
        const res = await fetch("/api/iss/position", { cache: "no-store" });
        const d = await res.json();
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        if (!d || d.ok === false || typeof d.lat !== "number") return;

        // 실제 고도(altKm)로 3D 공간에 위치시킨다 (지표면에 붙이지 않음)
        const altKm = typeof d.altKm === "number" ? d.altKm : 420; // 폴백(open-notify는 null)
        const pos = getIssCesiumPosition(Cesium, d.lat, d.lng, altKm);
        if (!pos) return;

        if (!issMarker) {
          const icon = makeEmojiCanvas("🛰️", 44);
          issMarker = viewer.entities.add({
            position: pos,
            billboard: {
              image: icon || undefined,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scale: 1,
            },
            label: {
              text: "ISS",
              font: "bold 13px sans-serif",
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("#146c6b").withAlpha(0.8),
              pixelOffset: new Cesium.Cartesian2(0, -34),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          payloadRef.current.set(issMarker, { kind: "iss", data: d });
          issEntsRef.current.push(issMarker);
        } else {
          issMarker.position = pos;
          payloadRef.current.set(issMarker, { kind: "iss", data: d });
        }
      } catch (error) {
        console.error("[CesiumSpaceMapView] ISS 위치 갱신 실패:", error); // TODO: 배포 전 제거
      }
    }

    // 궤적선: TLE → getIssTrajectory([lat,lng,altKm]) → 고도 반영 폴리라인
    function drawTrajectory() {
      try {
        if (cancelled || !viewer || viewer.isDestroyed()) return;
        if (!satrecRef.current) return;

        // 이전 궤적 폴리라인만 제거(마커는 유지) — issEntsRef 에서 폴리라인만 골라 제거
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
          // [lat,lng,altKm] → Cesium 은 [경도, 위도, 높이(m)] 평면 배열 필요
          const flat = [];
          for (const p of seg) {
            flat.push(p[1], p[0], (Number(p[2]) || 0) * 1000);
          }
          const line = viewer.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(flat),
              width: 2,
              material: Cesium.Color.fromCssColorString(TRACK_COLOR),
              // 지구 곡률을 따라 부드럽게(호 형태로) 그린다
              arcType: Cesium.ArcType.GEODESIC,
            },
          });
          issEntsRef.current.push(line);
        }
      } catch (error) {
        console.error("[CesiumSpaceMapView] 궤적 그리기 실패:", error); // TODO: 배포 전 제거
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
        console.warn("[CesiumSpaceMapView] TLE 로드 실패 → 궤적 생략", error); // TODO: 배포 전 제거
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
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
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
        console.error("[CesiumSpaceMapView] 지진 로드 실패:", error); // TODO: 배포 전 제거
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

  // ─── 5) 오로라 레이어 (점묘화 — cesium-heatmap 미설치로 대체 방식) ──
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

        // parseAuroraGrid: [위도, 경도, 강도(0~1)] (위도45+·확률0 제외는 기존과 동일)
        const points = parseAuroraGrid(data.coordinates);
        for (const p of points) {
          try {
            const intensity = Number(p[2]);
            // 확률 20% 이상만 점으로 표시 (점묘화 부하 감소)
            if (intensity < 0.2) continue;
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(p[1], p[0], 0),
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
        console.error("[CesiumSpaceMapView] 오로라 로드 실패:", error); // TODO: 배포 전 제거
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
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
              billboard: {
                image: icon || undefined,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scale: 1,
              },
            });
            payloadRef.current.set(ent, { kind: "event", data: ev });
            disasterEntsRef.current.push(ent);
          } catch (inner) {
            continue;
          }
        }
      } catch (error) {
        console.error("[CesiumSpaceMapView] 자연재해 로드 실패:", error); // TODO: 배포 전 제거
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

  // ─── 장면 모드(2D/3D/2.5D) 전환 ──────────────────────────────
  function changeMode(mode) {
    try {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;
      if (mode === "3D") v.scene.morphTo3D(0.5);
      else if (mode === "2D") v.scene.morphTo2D(0.5);
      else v.scene.morphToColumbusView(0.5); // 2.5D
      setSceneMode(mode);
    } catch (error) {
      console.error("[CesiumSpaceMapView] 장면 모드 전환 실패:", error); // TODO: 배포 전 제거
    }
  }

  // 오버레이 닫기
  function closeOverlay() {
    setOverlay(null);
    setLivecamExpandedId(null);
  }

  // 모드 버튼 스타일
  function modeBtnClass(on) {
    return (
      "rounded-md border px-2.5 py-1 text-xs font-medium shadow-card transition " +
      (on
        ? "border-brand bg-brand text-white"
        : "border-border bg-surface text-ink hover:bg-bg")
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Cesium 캔버스 컨테이너 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 좌상단: 2D 지도로 돌아가기 + 장면 모드 전환 */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-card transition hover:bg-bg"
        >
          🗺️ 2D 지도로 돌아가기
        </Link>
        <div className="flex items-center gap-1 rounded-md bg-surface/80 p-1 shadow-card">
          <button type="button" onClick={() => changeMode("3D")} className={modeBtnClass(sceneMode === "3D")}>
            3D
          </button>
          <button type="button" onClick={() => changeMode("columbus")} className={modeBtnClass(sceneMode === "columbus")}>
            2.5D
          </button>
          <button type="button" onClick={() => changeMode("2D")} className={modeBtnClass(sceneMode === "2D")}>
            2D
          </button>
        </div>
      </div>

      {/* 우상단: 레이어 토글 (라이브캠은 항상 표시) */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setIssEnabled((v) => !v)} className={toggleBtnClass(issEnabled)}>
          🛰️ ISS
        </button>
        <button type="button" onClick={() => setEqEnabled((v) => !v)} className={toggleBtnClass(eqEnabled)}>
          🌍 지진
        </button>
        <button type="button" onClick={() => setAuroraEnabled((v) => !v)} className={toggleBtnClass(auroraEnabled)}>
          🌌 오로라
        </button>
        <button type="button" onClick={() => setDisasterEnabled((v) => !v)} className={toggleBtnClass(disasterEnabled)}>
          🔥 자연재해
        </button>
      </div>

      {/* 클릭 오버레이 (라이브캠 = 영상 패널 / 지진·자연재해 = 정보 카드) */}
      {overlay && overlay.kind === "livecam" && (
        <div className="absolute right-0 top-0 z-[1100] h-full w-[92%] max-w-[360px] border-l border-border bg-bg shadow-card">
          <VideoListPanel
            markers={[overlay.data]}
            title={overlay.data.location || "라이브캠"}
            expandedMarkerId={livecamExpandedId}
            onSelectMarker={(m) => setLivecamExpandedId(m ? m.id : null)}
            onClose={closeOverlay}
          />
        </div>
      )}

      {overlay && overlay.kind === "earthquake" && (
        <InfoOverlay onClose={closeOverlay} title={`🌍 규모 M${typeof overlay.data.magnitude === "number" ? overlay.data.magnitude.toFixed(1) : "-"}`}>
          {overlay.data.depthKm != null && <p>깊이: {Math.round(overlay.data.depthKm)} km</p>}
          {overlay.data.time != null && (
            <p>발생: {(() => { try { return new Date(overlay.data.time).toLocaleString("ko-KR"); } catch (e) { return "-"; } })()}</p>
          )}
          {overlay.data.place && <p>{overlay.data.place}</p>}
        </InfoOverlay>
      )}

      {overlay && overlay.kind === "event" && (
        <InfoOverlay onClose={closeOverlay} title={`${getEventIcon(overlay.data.category)} ${overlay.data.title || "자연재해"}`}>
          {overlay.data.categoryTitle && <p>카테고리: {overlay.data.categoryTitle}</p>}
          {overlay.data.date && (
            <p>발생일: {(() => { try { return new Date(overlay.data.date).toLocaleString("ko-KR"); } catch (e) { return overlay.data.date; } })()}</p>
          )}
          {overlay.data.sourceUrl && (
            <p>
              <a href={overlay.data.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                출처: {overlay.data.sourceName || "링크"} ↗
              </a>
            </p>
          )}
          <p className="mt-2 text-[11px] text-amber-700">
            ⚠️ 참고용 정보이며 공식 경보가 아닙니다. 정확한 정보는 출처 링크를 확인하세요.
          </p>
        </InfoOverlay>
      )}

      {/* ISS 마커 클릭 시 간단 정보 */}
      {overlay && overlay.kind === "iss" && (
        <InfoOverlay onClose={closeOverlay} title="🛰️ ISS (국제우주정거장)">
          <p>위도 {Number(overlay.data.lat).toFixed(2)}, 경도 {Number(overlay.data.lng).toFixed(2)}</p>
          {overlay.data.altKm != null && <p>고도: {Math.round(overlay.data.altKm).toLocaleString("en-US")} km</p>}
          {overlay.data.speedKmh != null && <p>속도: {Math.round(overlay.data.speedKmh).toLocaleString("en-US")} km/h</p>}
        </InfoOverlay>
      )}

      {/* 로딩 안내 */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center text-sm text-white">
          3D 지도를 초기화하는 중...
        </div>
      )}
    </div>
  );
}

// ─── 정보 오버레이 카드 (지진/자연재해/ISS 공용) ──────────────
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
