"use client";

// ─────────────────────────────────────────────────────────────
// IssTracker — ISS(국제우주정거장) 실시간 위치 + 궤적선 레이어 (isstracker.pl 스타일)
//
// props:
//   - map     : react-leaflet 이 만든 실제 L.Map 인스턴스 (LeafletMap 의 onMapReady 로 받음)
//   - enabled : true 면 추적 시작, false 면 모든 타이머 정지 + 레이어 제거
//
// 구성:
//   [마커] 2초마다 /api/iss/position → 마커 위치 갱신 + 위치 정보를 부모(onPositionUpdate)에 전달.
//          마커 클릭 시 onIssClick 호출(트리 ISS 항목 클릭과 동일 → 영상 패널 오픈).
//          5회 연속 실패 시 마커 숨김 + 30초 간격 재시도, 성공하면 2초 모드로 자동 복귀.
//   [궤적선] 마운트 시 /api/iss/tle → satellite.js 로 "미래 구간(현재~+90분)만" 궤적 계산,
//            1분마다 재계산(선이 항상 현재 위치에서 뻗어나가도록). 진한 빨간 실선 1개.
//            TLE 실패 시 궤적선·동심원만 생략하고 마커는 정상 동작.
//   [동심원] ISS 중심 반경 500/1000/1500km 원 3개 (TLE 성공 시에만 표시, 마커 따라 이동).
//
// ⚠️ 이 컴포넌트는 화면에 DOM 을 그리지 않고(return null) 지도 레이어만 imperative 하게 조작한다.
// ⚠️ Leaflet 은 브라우저 전용이라 상위(MainMapView)에서 next/dynamic { ssr:false } 로 로드해야 한다.
// ⚠️ 모든 setInterval/타이머는 언마운트/비활성화 시 반드시 정리한다(메모리 누수·중복 실행 방지).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-polylinedecorator"; // L.polylineDecorator / L.Symbol.arrowHead 를 L 에 추가
import * as satellite from "satellite.js";
import { getIssTrajectory } from "@/lib/issUtils";

// ─── 동작 상수 ────────────────────────────────────────────────
const POSITION_POLL_MS = 2000; // 위치 갱신 간격 (정상 모드)
const POSITION_RETRY_MS = 30000; // 위치 실패 후 재시도 간격
const MAX_FAILS = 5; // 이 횟수만큼 연속 실패하면 마커 숨김 + 백오프
const TRAJ_RECOMPUTE_MS = 1 * 60 * 1000; // 궤적 재계산 간격 (1분)
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

export default function IssTracker({
  map,
  enabled = true,
  onIssClick,
  onPositionUpdate,
}) {
  // 지도 레이어 참조 (imperative 조작 대상)
  const markerRef = useRef(null); // L.Marker
  const circlesRef = useRef([]); // L.Circle[]
  // 미래 궤적선 레이어(날짜변경선 분리로 선분이 여러 개일 수 있어 배열로 관리)
  const lineLayersRef = useRef([]); // L.Polyline[]
  // 궤적선 위 방향 화살표(polylineDecorator) — 재계산 시 함께 갱신
  const decoratorRef = useRef(null);
  // 궤적 계산용 상태
  const satrecRef = useRef(null);
  const tleOkRef = useRef(false);
  const lastDataRef = useRef(null); // 마지막 위치 응답(동심원 즉시 표시용)

  // 콜백을 ref 로 최신 유지 → 부모 리렌더로 콜백이 바뀌어도 메인 effect(타이머/레이어)를
  // 재실행하지 않게 한다(VideoListPanel 의 onErrorRef 와 동일 패턴).
  const onIssClickRef = useRef(onIssClick);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  useEffect(() => {
    onIssClickRef.current = onIssClick;
  }, [onIssClick]);
  useEffect(() => {
    onPositionUpdateRef.current = onPositionUpdate;
  }, [onPositionUpdate]);

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
        for (const line of lineLayersRef.current) {
          try {
            map.removeLayer(line);
          } catch (e) {}
        }
        lineLayersRef.current = [];
        // 방향 화살표 decorator 도 함께 제거 (겹침/중복 방지)
        if (decoratorRef.current) {
          try {
            map.removeLayer(decoratorRef.current);
          } catch (e) {}
          decoratorRef.current = null;
        }
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
          // 팝업 대신: 마커 클릭 시 부모에 ISS 선택 이벤트 전달
          // (카테고리 트리 ISS 항목 클릭과 동일하게 → 패널 오픈 + 트리 하이라이트)
          // 위/경도/고도/속도는 팝업이 아니라 영상 목록 패널 상단에 표시한다.
          // ⚠️ on("click") 은 최초 1회만 등록(매 갱신마다 등록하면 핸들러가 중복된다).
          markerRef.current.on("click", () => {
            try {
              if (typeof onIssClickRef.current === "function") {
                onIssClickRef.current();
              }
            } catch (clickError) {
              console.error("[IssTracker] ISS 마커 클릭 처리 실패:", clickError); // TODO: 배포 전 제거
            }
          });
          markerRef.current.addTo(map);
        } else {
          // 위치만 갱신
          markerRef.current.setLatLng(latlng);
        }

        // 현재 위치 정보를 부모에 전달(패널 상단 표시 + 지도 이동 기준값으로 사용)
        try {
          if (typeof onPositionUpdateRef.current === "function") {
            onPositionUpdateRef.current(d);
          }
        } catch (posError) {
          console.error("[IssTracker] 위치 콜백 처리 실패:", posError); // TODO: 배포 전 제거
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

    // ── 궤적선 그리기 (미래 구간 진한 빨간 실선 1종류) ──
    function drawLines(segments) {
      try {
        removeLines();
        if (!Array.isArray(segments)) return;
        // 날짜변경선 분리로 선분이 여러 개일 수 있으나 스타일은 동일(실선, 불투명 1)
        for (const seg of segments) {
          if (seg.length >= 2) {
            lineLayersRef.current.push(
              L.polyline(seg, {
                color: TRACK_COLOR,
                weight: 2,
                opacity: 1,
                interactive: false,
              }).addTo(map)
            );
          }
        }

        // ── 이동방향 화살표: 궤적선을 따라 일정 간격으로 여러 개 표시 ──
        // leaflet-polylinedecorator 의 arrowHead 심볼을 repeat 간격으로 반복.
        // repeat/pixelSize 는 눈으로 보고 조정 가능(간격 80px, 화살표 9px 로 시작).
        if (
          lineLayersRef.current.length > 0 &&
          typeof L.polylineDecorator === "function"
        ) {
          decoratorRef.current = L.polylineDecorator(lineLayersRef.current, {
            patterns: [
              {
                offset: "5%",
                repeat: "80px",
                symbol: L.Symbol.arrowHead({
                  pixelSize: 9,
                  polygon: false,
                  pathOptions: {
                    stroke: true,
                    color: TRACK_COLOR,
                    weight: 2,
                    opacity: 1,
                  },
                }),
              },
            ],
          }).addTo(map);
        }
      } catch (error) {
        console.error("[IssTracker] 궤적선 그리기 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 궤적 재계산 (미래 구간만) ──
    // ⚠️ 궤적선은 "오직 TLE 계산 좌표"로만 그린다.
    //    (과거에 실측 위치를 선 앞에 붙이는 prepend 보정이 있었으나, 실측점과 계산점의
    //     미세한 차이로 궤적 중간에 V자 꼭짓점/비정상 직선이 생기는 버그의 주원인이라 제거함.
    //     20초 간격 촘촘한 계산만으로 마커와의 정합은 충분하다.)
    function recomputeTrajectory() {
      try {
        if (!satrecRef.current) return; // TLE 아직 없음
        const segments = getIssTrajectory(satrecRef.current);
        if (cancelled) return;
        drawLines(segments);
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
