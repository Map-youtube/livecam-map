"use client";

// ─────────────────────────────────────────────────────────────
// NaturalEventsLayer — NASA EONET 자연재해 오버레이 (Leaflet divIcon 마커)
//
// props:
//   - map     : 실제 L.Map 인스턴스
//   - enabled : true 면 표시, false 면 호출/타이머 정지 + 마커 전부 제거
//
// 동작:
//   - enabled 일 때만 /api/natural-events 호출.
//   - 카테고리별 이모지 아이콘(L.divIcon) 마커 표시.
//   - 클릭 팝업: 이벤트명 / 카테고리 / 발생일 / 출처 링크(새 탭) + 참고용 안내 문구.
//   - 15분마다 재조회 → 새로 그리기 전 이전 마커 전부 제거(겹침 방지).
//
// ⚠️ interval 은 언마운트/비활성화 시 반드시 clearInterval. 지도 레이어만 조작(return null).
// ⚠️ Leaflet 은 브라우저 전용 → 상위(MainMapView)에서 next/dynamic { ssr:false } 로 로드.
// ⚠️ 공식 경보가 아님을 팝업에 반드시 명시(오해 방지).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import { getEventIcon } from "@/lib/naturalEventsUtils";

const REFRESH_MS = 15 * 60 * 1000; // 15분

// ─── 이모지 divIcon ──────────────────────────────────────────
function makeEventIcon(emoji) {
  return L.divIcon({
    html:
      '<div style="font-size:20px;line-height:1;text-align:center;' +
      'filter:drop-shadow(0 1px 1px rgba(0,0,0,0.4));">' +
      emoji +
      "</div>",
    className: "natural-event-divicon", // 기본 흰 배경/테두리 제거(globals.css)
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

// ─── HTML 이스케이프 (제목/출처에 특수문자 방어) ─────────────
function esc(str) {
  try {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  } catch (e) {
    return "";
  }
}

// ─── 팝업 HTML (이벤트명/카테고리/발생일/출처/안내문구) ───────
function buildPopupHtml(ev) {
  const rows = [];
  const emoji = getEventIcon(ev.category);
  rows.push(
    `<div style="font-weight:700;margin-bottom:4px;">${emoji} ${esc(
      ev.title
    )}</div>`
  );
  if (ev.categoryTitle) {
    rows.push(`<div>카테고리: ${esc(ev.categoryTitle)}</div>`);
  }
  if (ev.date) {
    let dateText = ev.date;
    try {
      dateText = new Date(ev.date).toLocaleString("ko-KR");
    } catch (e) {
      dateText = ev.date;
    }
    rows.push(`<div>발생일: ${esc(dateText)}</div>`);
  }
  if (ev.sourceUrl) {
    rows.push(
      `<div><a href="${esc(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer" ` +
        `style="color:#1A73E8;text-decoration:underline;">출처: ${esc(
          ev.sourceName || "링크"
        )} ↗</a></div>`
    );
  }
  // ⚠️ 공식 경보가 아님을 반드시 안내
  rows.push(
    '<div style="margin-top:6px;color:#b45309;font-size:11px;">' +
      "⚠️ 참고용 정보이며 공식 경보가 아닙니다. 정확한 정보는 출처 링크를 확인하세요." +
      "</div>"
  );
  return `<div style="font-size:12px;line-height:1.5;max-width:240px;">${rows.join(
    ""
  )}</div>`;
}

export default function NaturalEventsLayer({ map, enabled = false }) {
  // 그려진 마커들 보관 (재조회 시 전부 제거용)
  const markersRef = useRef([]);

  useEffect(() => {
    if (!map || !enabled) return undefined;

    let cancelled = false;
    let timer = null;

    // ── 이전 마커 전부 제거 ──
    function removeAll() {
      try {
        for (const m of markersRef.current) {
          try {
            map.removeLayer(m);
          } catch (e) {}
        }
        markersRef.current = [];
      } catch (error) {
        console.error("[NaturalEventsLayer] 마커 제거 실패:", error); // TODO: 배포 전 제거
      }
    }

    // ── 자연재해 로드 → 마커 그리기 ──
    async function load() {
      try {
        const res = await fetch("/api/natural-events", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        // 새로 그리기 전 이전 마커 제거 (겹침 방지)
        removeAll();

        const list = Array.isArray(data.events) ? data.events : [];
        for (const ev of list) {
          try {
            if (typeof ev.lat !== "number" || typeof ev.lng !== "number") {
              continue;
            }
            const marker = L.marker([ev.lat, ev.lng], {
              icon: makeEventIcon(getEventIcon(ev.category)),
              zIndexOffset: 500, // 라이브캠 마커보다 약간 위(ISS 3000보다는 아래)
            });
            marker.bindPopup(buildPopupHtml(ev));
            marker.addTo(map);
            markersRef.current.push(marker);
          } catch (innerError) {
            // 개별 마커 실패는 건너뜀
            continue;
          }
        }
      } catch (error) {
        console.error("[NaturalEventsLayer] 자연재해 로드 실패:", error); // TODO: 배포 전 제거
      }
    }

    load(); // 즉시 1회
    timer = setInterval(load, REFRESH_MS); // 15분마다

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeAll();
    };
  }, [map, enabled]);

  return null;
}
