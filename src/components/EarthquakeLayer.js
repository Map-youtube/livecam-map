"use client";

// ─────────────────────────────────────────────────────────────
// EarthquakeLayer — 실시간 지진 오버레이 (Leaflet L.circle)
//
// props:
//   - map     : react-leaflet 이 만든 실제 L.Map 인스턴스 (LeafletMap 의 onMapReady 로 받음)
//   - enabled : true 면 표시 시작, false 면 호출/타이머 정지 + 원 전부 제거
//
// 동작:
//   - enabled 일 때만 /api/earthquakes 호출(꺼져있으면 호출 안 함).
//   - 각 지진을 L.circle 로 표시: 반경 = 규모 비례, 색상 = 규모별.
//   - 클릭 시 팝업: 규모 / 깊이 / 발생시각(현지 표기) / 장소명.
//   - 5분마다 재조회 → 새로 그리기 전에 이전 원을 전부 제거(겹침 방지).
//
// ⚠️ interval 은 언마운트/비활성화 시 반드시 clearInterval. 지도 레이어만 조작(return null).
// ⚠️ Leaflet 은 브라우저 전용 → 상위(MainMapView)에서 next/dynamic { ssr:false } 로 로드.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  getMagnitudeColor,
  getMagnitudeRadiusKm,
} from "@/lib/earthquakeUtils";

const REFRESH_MS = 5 * 60 * 1000; // 5분

// ─── 팝업 HTML (규모/깊이/시각/장소) ─────────────────────────
function buildPopupHtml(eq) {
  const rows = [];
  const mag = typeof eq.magnitude === "number" ? eq.magnitude.toFixed(1) : "-";
  rows.push(
    `<div style="font-weight:700;margin-bottom:4px;">🌍 규모 M${mag}</div>`
  );
  if (eq.depthKm != null) {
    rows.push(`<div>깊이: ${Math.round(eq.depthKm)} km</div>`);
  }
  if (eq.time != null) {
    // 발생시각을 보는 사람의 현지 표기로
    let timeText = "-";
    try {
      timeText = new Date(eq.time).toLocaleString("ko-KR");
    } catch (e) {
      timeText = "-";
    }
    rows.push(`<div>발생: ${timeText}</div>`);
  }
  if (eq.place) {
    rows.push(`<div>${eq.place}</div>`);
  }
  return `<div style="font-size:12px;line-height:1.5;">${rows.join("")}</div>`;
}

export default function EarthquakeLayer({ map, enabled = false }) {
  // 그려진 원 레이어들 보관 (재조회 시 전부 제거용)
  const circlesRef = useRef([]);

  useEffect(() => {
    // 지도 없거나 꺼져 있으면 아무 동작 안 함(호출도 안 함)
    if (!map || !enabled) return undefined;

    let cancelled = false;
    let timer = null;

    // ── 이전 원 전부 제거 ──
    function removeAll() {
      try {
        for (const c of circlesRef.current) {
          try {
            map.removeLayer(c);
          } catch (e) {}
        }
        circlesRef.current = [];
      } catch (error) {
        console.error("[EarthquakeLayer] 원 제거 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 지진 목록 로드 → 원 그리기 ──
    async function load() {
      try {
        const res = await fetch("/api/earthquakes", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        // 새로 그리기 전 이전 원 제거 (겹침 방지)
        removeAll();

        const list = Array.isArray(data.earthquakes) ? data.earthquakes : [];
        for (const eq of list) {
          try {
            if (typeof eq.lat !== "number" || typeof eq.lng !== "number") {
              continue;
            }
            const color = getMagnitudeColor(eq.magnitude);
            const circle = L.circle([eq.lat, eq.lng], {
              // 반경(km) → 미터로 변환
              radius: getMagnitudeRadiusKm(eq.magnitude) * 1000,
              color,
              weight: 1,
              fillColor: color,
              fillOpacity: 0.25, // 채움 투명도 낮게
            });
            circle.bindPopup(buildPopupHtml(eq));
            circle.addTo(map);
            circlesRef.current.push(circle);
          } catch (innerError) {
            // 개별 원 실패는 건너뜀
            continue;
          }
        }
      } catch (error) {
        console.error("[EarthquakeLayer] 지진 로드 실패:", error); // TODO: 배포 전 제거
      }
    }

    load(); // 즉시 1회
    timer = setInterval(load, REFRESH_MS); // 5분마다

    // 정리: 타이머 해제 + 원 제거
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeAll();
    };
  }, [map, enabled]);

  return null;
}
