"use client";

// ─────────────────────────────────────────────────────────────
// IssTracker — ISS(국제우주정거장) 실시간 위치 + 궤적선 레이어 (isstracker.pl 스타일)
//
// props:
//   - map     : react-leaflet 이 만든 실제 L.Map 인스턴스 (LeafletMap 의 onMapReady 로 받음)
//   - enabled : true 면 추적 시작, false 면 모든 타이머 정지 + 레이어 제거
//
// 구성:
//   [마커] 2초마다 /api/iss/position → 마커 위치/팝업 갱신.
//          5회 연속 실패 시 마커 숨김 + 30초 간격 재시도, 성공하면 2초 모드로 자동 복귀.
//   [궤적선] 마운트 시 /api/iss/tle → satellite.js 로 궤적 계산, 5분마다 재계산.
//            TLE 실패 시 궤적선·동심원만 생략하고 마커는 정상 동작.
//   [동심원] ISS 중심 반경 500/1000/1500km 원 3개 (TLE 성공 시에만 표시, 마커 따라 이동).
//
// ⚠️ 이 컴포넌트는 화면에 DOM 을 그리지 않고(return null) 지도 레이어만 imperative 하게 조작한다.
// ⚠️ Leaflet 은 브라우저 전용이라 상위(MainMapView)에서 next/dynamic { ssr:false } 로 로드해야 한다.
// ⚠️ 모든 setInterval/타이머는 언마운트/비활성화 시 반드시 정리한다(메모리 누수·중복 실행 방지).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import * as satellite from "satellite.js";
import { getIssTrajectory } from "@/lib/issUtils";

// ─── 동작 상수 ────────────────────────────────────────────────
const POSITION_POLL_MS = 2000; // 위치 갱신 간격 (정상 모드)
const POSITION_RETRY_MS = 30000; // 위치 실패 후 재시도 간격
const MAX_FAILS = 5; // 이 횟수만큼 연속 실패하면 마커 숨김 + 백오프
const TRAJ_RECOMPUTE_MS = 5 * 60 * 1000; // 궤적 재계산 간격 (5분)
const CIRCLE_RADII_M = [500000, 1000000, 1500000]; // 동심원 반경(m): 500/1000/1500km
const TRACK_COLOR = "#e53935"; // 궤적선 빨간색 (isstracker.pl 스타일)

// ─── ISS SVG 아이콘 (태양전지판 형태, 외부 이미지 의존 없음) ──
const ISS_SVG =
  '<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
  // 중앙 트러스(가로 막대)
  '<rect x="5" y="22" width="38" height="4" rx="1" fill="#b0bec5" stroke="#607d8b" stroke-width="0.6"/>' +
  // 왼쪽 태양전지판 2장
  '<g fill="#1e88e5" stroke="#0d47a1" stroke-width="0.6">' +
  '<rect x="2" y="11" width="13" height="8"/><rect x="2" y="29" width="13" height="8"/></g>' +
  // 오른쪽 태양전지판 2장
  '<g fill="#1e88e5" stroke="#0d47a1" stroke-width="0.6">' +
  '<rect x="33" y="11" width="13" height="8"/><rect x="33" y="29" width="13" height="8"/></g>' +
  // 태양전지판 격자선(태양광 느낌)
  '<g stroke="#90caf9" stroke-width="0.4">' +
  '<line x1="6.5" y1="11" x2="6.5" y2="19"/><line x1="10.5" y1="11" x2="10.5" y2="19"/>' +
  '<line x1="6.5" y1="29" x2="6.5" y2="37"/><line x1="10.5" y1="29" x2="10.5" y2="37"/>' +
  '<line x1="37.5" y1="11" x2="37.5" y2="19"/><line x1="41.5" y1="11" x2="41.5" y2="19"/>' +
  '<line x1="37.5" y1="29" x2="37.5" y2="37"/><line x1="41.5" y1="29" x2="41.5" y2="37"/></g>' +
  // 중앙 모듈
  '<rect x="20" y="18" width="8" height="12" rx="1.5" fill="#eceff1" stroke="#546e7a" stroke-width="0.8"/>' +
  '<circle cx="24" cy="24" r="1.7" fill="#ffb300"/>' +
  "</svg>";

// ─── ISS divIcon 생성 ─────────────────────────────────────────
function makeIssIcon() {
  return L.divIcon({
    html: ISS_SVG,
    className: "iss-divicon", // 기본 흰 배경/테두리 없이 SVG 만 표시
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -20],
  });
}

// ─── 팝업 HTML (null 값은 줄 자체를 렌더링하지 않음) ──────────
function buildPopupHtml(d) {
  const rows = [];
  rows.push(
    '<div style="font-weight:700;margin-bottom:4px;">🛰️ ISS (국제우주정거장)</div>'
  );
  // 위도/경도 (소수점 2자리)
  rows.push(
    "<div>위도 " +
      d.lat.toFixed(2) +
      ", 경도 " +
      d.lng.toFixed(2) +
      "</div>"
  );
  // 고도 (km) — null 이면 줄 생략
  if (d.altKm != null) {
    rows.push(
      "<div>고도: " + Math.round(d.altKm).toLocaleString("en-US") + " km</div>"
    );
  }
  // 속도 (km/h, 천단위 콤마) — null 이면 줄 생략
  if (d.speedKmh != null) {
    rows.push(
      "<div>속도: " +
        Math.round(d.speedKmh).toLocaleString("en-US") +
        " km/h</div>"
    );
  }
  // 낮/밤 구간 (WTIA visibility 있을 때만)
  if (d.visibility === "daylight") {
    rows.push("<div>현재: 낮 구간 ☀️</div>");
  } else if (d.visibility === "eclipsed") {
    rows.push("<div>현재: 밤 구간 🌙</div>");
  }
  return '<div style="font-size:12px;line-height:1.5;">' + rows.join("") + "</div>";
}

export default function IssTracker({ map, enabled = true }) {
  // 지도 레이어 참조 (imperative 조작 대상)
  const markerRef = useRef(null); // L.Marker
  const circlesRef = useRef([]); // L.Circle[]
  const pastLinesRef = useRef([]); // L.Polyline[] (과거 궤적)
  const futureLinesRef = useRef([]); // L.Polyline[] (미래 궤적)
  // 궤적 계산용 상태
  const satrecRef = useRef(null);
  const tleOkRef = useRef(false);
  const lastDataRef = useRef(null); // 마지막 위치 응답(동심원 즉시 표시용)

  useEffect(() => {
    // 지도 인스턴스가 없거나 비활성화면 아무것도 하지 않음
    // (비활성화 시에는 이전 실행의 cleanup 이 이미 레이어/타이머를 정리했음)
    if (!map || !enabled) return undefined;

    let cancelled = false; // 언마운트/비활성화 후 늦게 도착한 응답 무시
    let posTimer = null; // 위치 폴링 타이머
    let trajTimer = null; // 궤적 재계산 타이머
    let failCount = 0; // 위치 연속 실패 횟수
    let mode = "normal"; // "normal"(2초) | "backoff"(30초)
    const issIcon = makeIssIcon();

    // ── 타이머 정리 헬퍼 ──
    function clearPosTimer() {
      if (posTimer) {
        clearInterval(posTimer);
        posTimer = null;
      }
    }

    // ── 레이어 제거 헬퍼 ──
    function removeMarkerAndCircles() {
      try {
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
          markerRef.current = null;
        }
        for (const c of circlesRef.current) {
          try {
            map.removeLayer(c);
          } catch (e) {
            // 개별 제거 실패는 무시
          }
        }
        circlesRef.current = [];
      } catch (error) {
        console.error("[IssTracker] 마커/동심원 제거 실패:", error); // TODO: 배포 전 제거
      }
    }
    function removeLines() {
      try {
        for (const p of pastLinesRef.current) {
          try {
            map.removeLayer(p);
          } catch (e) {}
        }
        for (const f of futureLinesRef.current) {
          try {
            map.removeLayer(f);
          } catch (e) {}
        }
        pastLinesRef.current = [];
        futureLinesRef.current = [];
      } catch (error) {
        console.error("[IssTracker] 궤적선 제거 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 마커 + 동심원 갱신 ──
    function updateMarker(d) {
      try {
        const latlng = [d.lat, d.lng];

        if (!markerRef.current) {
          // 최초 생성
          markerRef.current = L.marker(latlng, {
            icon: issIcon,
            zIndexOffset: 3000, // 라이브캠 마커/클러스터보다 위에
          });
          markerRef.current.bindPopup(buildPopupHtml(d));
          markerRef.current.addTo(map);
        } else {
          // 위치/팝업만 갱신
          markerRef.current.setLatLng(latlng);
          markerRef.current.setPopupContent(buildPopupHtml(d));
        }

        // 동심원: TLE 성공(tleOkRef) 일 때만 표시. 없으면 생성, 있으면 이동.
        // (interactive:false → 클릭이 지도로 전달되어 "빈 곳 클릭" 동작을 막지 않음)
        if (tleOkRef.current) {
          if (circlesRef.current.length === 0) {
            circlesRef.current = CIRCLE_RADII_M.map((r) =>
              L.circle(latlng, {
                radius: r,
                fill: false,
                color: "#9ca3af",
                weight: 1,
                opacity: 0.7,
                interactive: false,
              }).addTo(map)
            );
          } else {
            for (const c of circlesRef.current) c.setLatLng(latlng);
          }
        }
      } catch (error) {
        console.error("[IssTracker] 마커 갱신 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 위치 폴링 ──
    async function poll() {
      try {
        const res = await fetch("/api/iss/position", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        if (cancelled) return;
        if (!d || d.ok === false || typeof d.lat !== "number") {
          throw new Error("잘못된 응답");
        }

        lastDataRef.current = d;

        // 백오프 모드였다면 정상(2초) 모드로 복귀
        if (mode === "backoff") {
          mode = "normal";
          clearPosTimer();
          posTimer = setInterval(poll, POSITION_POLL_MS);
        }
        failCount = 0;

        updateMarker(d);
      } catch (error) {
        if (cancelled) return;
        failCount += 1;
        if (failCount >= MAX_FAILS && mode === "normal") {
          // 5회 연속 실패 → 마커 숨김 + 30초 백오프 모드로 전환
          console.warn(
            "[IssTracker] ISS 위치 " +
              MAX_FAILS +
              "회 연속 실패 → 마커 숨김, 30초 간격 재시도",
            error
          );
          removeMarkerAndCircles();
          mode = "backoff";
          clearPosTimer();
          posTimer = setInterval(poll, POSITION_RETRY_MS);
        }
      }
    }

    // ── 궤적선 그리기 ──
    function drawLines(traj) {
      try {
        removeLines();
        if (!traj) return;
        // 과거: 투명도 0.4, 미래: 실선(불투명 1)
        for (const seg of traj.past) {
          if (seg.length >= 2) {
            pastLinesRef.current.push(
              L.polyline(seg, {
                color: TRACK_COLOR,
                weight: 2,
                opacity: 0.4,
                interactive: false,
              }).addTo(map)
            );
          }
        }
        for (const seg of traj.future) {
          if (seg.length >= 2) {
            futureLinesRef.current.push(
              L.polyline(seg, {
                color: TRACK_COLOR,
                weight: 2,
                opacity: 1,
                interactive: false,
              }).addTo(map)
            );
          }
        }
      } catch (error) {
        console.error("[IssTracker] 궤적선 그리기 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 궤적 재계산 ──
    function recomputeTrajectory() {
      try {
        if (!satrecRef.current) return; // TLE 아직 없음
        const traj = getIssTrajectory(satrecRef.current);
        if (cancelled) return;
        drawLines(traj);
      } catch (error) {
        console.error("[IssTracker] 궤적 재계산 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── TLE 로드 → satrec 생성 → 궤적 계산 ──
    async function loadTle() {
      try {
        const res = await fetch("/api/iss/tle", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        if (cancelled) return;
        if (!d || d.ok === false || !d.line1 || !d.line2) {
          throw new Error("TLE 데이터 없음");
        }

        satrecRef.current = satellite.twoline2satrec(d.line1, d.line2);
        tleOkRef.current = true;

        recomputeTrajectory();
        // 마지막 위치가 이미 있으면 동심원을 바로 표시
        if (lastDataRef.current) updateMarker(lastDataRef.current);
      } catch (error) {
        // TLE 실패 → 궤적선·동심원만 생략, 마커는 정상
        tleOkRef.current = false;
        console.warn(
          "[IssTracker] TLE 로드 실패 → 궤적선·동심원 생략, 마커만 표시",
          error
        );
      }
    }

    // ── 시작 ──
    poll(); // 즉시 1회
    posTimer = setInterval(poll, POSITION_POLL_MS);
    loadTle();
    trajTimer = setInterval(recomputeTrajectory, TRAJ_RECOMPUTE_MS);

    // ── 정리 (언마운트/비활성화 시) ──
    return () => {
      cancelled = true;
      clearPosTimer();
      if (trajTimer) clearInterval(trajTimer);
      removeMarkerAndCircles();
      removeLines();
      satrecRef.current = null;
      tleOkRef.current = false;
    };
  }, [map, enabled]);

  // 지도 레이어만 조작하므로 렌더링 DOM 은 없음
  return null;
}
