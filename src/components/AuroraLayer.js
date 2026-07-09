"use client";

// ─────────────────────────────────────────────────────────────
// AuroraLayer — 오로라 예보 히트맵 오버레이 (leaflet.heat)
//
// NOAA 오로라 예보 이미지(초록~빨강 그라데이션)처럼 지도 위에 색상 분포도로 표시한다.
// 지진/자연재해와 달리 마커·클릭형 정보창은 없다(분포 자체가 정보).
//
// props:
//   - map     : 실제 L.Map 인스턴스
//   - enabled : true 면 표시, false 면 호출/타이머 정지 + 히트레이어 제거
//
// 동작:
//   1. enabled 일 때만 /api/aurora-forecast 호출.
//   2. parseAuroraGrid 로 [위도,경도,강도] 변환 → L.heatLayer 로 지도에 추가.
//   3. 10분마다 재조회 → 새로 그리기 전 기존 heatLayer 제거(겹침 방지).
//
// ⚠️ leaflet.heat 는 브라우저 전용 → 상위(MainMapView)에서 next/dynamic { ssr:false } 로 로드.
// ⚠️ interval 은 언마운트/비활성화 시 반드시 clearInterval.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.heat"; // L.heatLayer 를 전역 L 에 추가
import { parseAuroraGrid } from "@/lib/auroraUtils";

const REFRESH_MS = 10 * 60 * 1000; // 10분

export default function AuroraLayer({ map, enabled = false }) {
  // 현재 히트맵 레이어 (재조회 시 제거용)
  const heatRef = useRef(null);

  useEffect(() => {
    if (!map || !enabled) return undefined;

    let cancelled = false;
    let timer = null;

    // ── 기존 히트레이어 제거 ──
    function removeHeat() {
      try {
        if (heatRef.current) {
          map.removeLayer(heatRef.current);
          heatRef.current = null;
        }
      } catch (error) {
        console.error("[AuroraLayer] 히트레이어 제거 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 오로라 예보 로드 → 히트맵 그리기 ──
    async function load() {
      try {
        const res = await fetch("/api/aurora-forecast", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        // 새로 그리기 전 기존 레이어 제거 (제거 안 하면 겹쳐 그려짐)
        removeHeat();

        const points = parseAuroraGrid(data.coordinates);
        if (points.length === 0) return;

        // 색상 그라데이션: 확률 낮음=파랑/초록, 높음=주황/빨강 (NOAA 원본 느낌)
        // radius/blur 는 지도 확대 배율에 따라 느낌이 달라지므로 추후 미세조정 가능.
        heatRef.current = L.heatLayer(points, {
          radius: 25,
          blur: 20,
          maxZoom: 5,
          minOpacity: 0.3,
          gradient: {
            0.2: "blue",
            0.4: "lime",
            0.6: "yellow",
            0.8: "orange",
            1.0: "red",
          },
        }).addTo(map);
      } catch (error) {
        console.error("[AuroraLayer] 오로라 로드 실패:", error); // TODO: 배포 전 제거
      }
    }

    load(); // 즉시 1회
    timer = setInterval(load, REFRESH_MS); // 10분마다

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeHeat();
    };
  }, [map, enabled]);

  return null;
}
