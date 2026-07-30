"use client";

// ─────────────────────────────────────────────────────────────
// TyphoonLayer — 태풍 오버레이 (현재위치 + 과거경로 + 예상경로 + 풍속 피해범위)
//
// props:
//   - map     : 실제 L.Map 인스턴스
//   - enabled : true 면 표시, false 면 호출/타이머 정지 + 그린 것 전부 제거
//
// 그리는 것 (아래→위 순서로 겹친다):
//   1) 풍속 피해범위 폴리곤 — 현재 위치 기준 34/50/64kt 사분면 반경 (공식 발표값)
//   2) 과거 경로 — 실선(회색). NASA EONET 관측 궤적.
//   3) 예상 경로 — 점선(빨강) + 각 예보지점 원형 마커(시각·풍속 툴팁)
//   4) 현재 중심 — 🌀 아이콘 + 이름/강도 상시 라벨
//
// ⚠️ 예상경로·풍속반경은 NHC/JTWC 공식 발표 원문값이다(우리가 추정·보간하지 않음).
//    단, 공식 "예보 원뿔(cone of uncertainty)"은 셰이프파일로만 제공돼 여기서는 그리지 않는다.
//    → 팝업에 "경로는 예보이며 오차가 있다"는 안내를 반드시 넣는다(과신 방지).
//
// ⚠️ interval 은 언마운트/비활성화 시 반드시 clearInterval. 지도 레이어만 조작(return null).
// ⚠️ Leaflet 은 브라우저 전용 → 상위(MapView)에서 next/dynamic { ssr:false } 로 로드.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  windRadiiPolygon,
  typhoonCategory,
  ktToKmh,
} from "@/lib/typhoonUtils";

const REFRESH_MS = 30 * 60 * 1000; // 30분 (기관 예보가 6시간 주기라 충분)

// 풍속 등급별 피해범위 표시 스타일 (강한 바람일수록 진하고 좁다)
//   ⚠️ 34kt=열대폭풍급(피해 시작), 50kt=강풍, 64kt=태풍/허리케인급(심각)
const RADII_STYLES = [
  { key: "r34", color: "#F9A825", fill: 0.1, weight: 1, labelKt: 34 },
  { key: "r50", color: "#EF6C00", fill: 0.14, weight: 1, labelKt: 50 },
  { key: "r64", color: "#C62828", fill: 0.2, weight: 1.5, labelKt: 64 },
];

// ─── HTML 이스케이프 ─────────────────────────────────────────
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

// ─── 🌀 중심 아이콘 (강도 색상 링) ───────────────────────────
function makeCenterIcon(color) {
  return L.divIcon({
    html:
      '<div style="position:relative;width:30px;height:30px;">' +
      '<div style="position:absolute;inset:0;border-radius:50%;border:2.5px solid ' +
      color +
      ';box-shadow:0 0 6px ' +
      color +
      ';"></div>' +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;font-size:19px;line-height:1;">🌀</div>' +
      "</div>",
    className: "typhoon-center-divicon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

// 시각 표기 (UTC 기준임을 명시)
function fmtTime(iso, locale) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale, {
      timeZone: "UTC",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return String(iso);
  }
}

// ─── 팝업 HTML ───────────────────────────────────────────────
function buildPopupHtml(ty, t, locale) {
  const rows = [];
  const kmh = ktToKmh(ty.maxWindKt);
  const gustKmh = ktToKmh(ty.gustKt);

  rows.push(
    `<div style="font-weight:700;margin-bottom:4px;">🌀 ${esc(ty.name)}</div>`
  );
  if (ty.classification) {
    rows.push(`<div>${esc(t("typhoonGrade"))}: ${esc(ty.classification)}</div>`);
  }
  if (typeof ty.maxWindKt === "number") {
    rows.push(
      `<div>${esc(t("maxWindSpeed"))}: <b>${ty.maxWindKt} kt</b>` +
        (kmh ? ` (${kmh} km/h)` : "") +
        "</div>"
    );
  }
  if (typeof ty.gustKt === "number") {
    rows.push(
      `<div>${esc(t("typhoonGust"))}: ${ty.gustKt} kt` +
        (gustKmh ? ` (${gustKmh} km/h)` : "") +
        "</div>"
    );
  }
  if (typeof ty.movementKt === "number") {
    rows.push(
      `<div>${esc(t("typhoonMovement"))}: ${
        typeof ty.movementDeg === "number" ? ty.movementDeg + "° " : ""
      }${ty.movementKt} kt</div>`
    );
  }
  if (ty.advisoryAt) {
    rows.push(
      `<div>${esc(t("typhoonAdvisoryTime"))}: ${esc(
        fmtTime(ty.advisoryAt, locale)
      )} UTC</div>`
    );
  }

  // 피해범위 요약 (있는 등급만)
  const radiiLines = [];
  for (const s of RADII_STYLES) {
    const r = ty.currentRadii && ty.currentRadii[s.key];
    if (!r) continue;
    const max = Math.max(
      Number(r.ne) || 0,
      Number(r.se) || 0,
      Number(r.sw) || 0,
      Number(r.nw) || 0
    );
    if (max <= 0) continue;
    radiiLines.push(
      `<div style="color:${s.color};">● ${s.labelKt}kt ${esc(
        t("typhoonWindRadius")
      )}: ${esc(t("typhoonMaxRadius"))} ${max} NM (${Math.round(
        max * 1.852
      )} km)</div>`
    );
  }
  if (radiiLines.length > 0) {
    rows.push(
      `<div style="margin-top:5px;border-top:1px solid #e4e7ec;padding-top:4px;">${radiiLines.join(
        ""
      )}</div>`
    );
  }

  if (Array.isArray(ty.forecast) && ty.forecast.length > 0) {
    const last = ty.forecast[ty.forecast.length - 1];
    rows.push(
      `<div style="margin-top:4px;">${esc(t("typhoonForecastTrack"))}: ${
        ty.forecast.length
      }${esc(t("typhoonPoints"))} (~${esc(fmtTime(last.validAt, locale))} UTC)</div>`
    );
  }

  if (ty.sourceUrl) {
    rows.push(
      `<div style="margin-top:4px;"><a href="${esc(
        ty.sourceUrl
      )}" target="_blank" rel="noopener noreferrer" ` +
        `style="color:#1A73E8;text-decoration:underline;">${esc(
          t("source")
        )}: ${esc(ty.sourceName || ty.source)} ↗</a></div>`
    );
  }

  // ⚠️ 예보 오차 안내 — 공식 경보 대체물이 아님을 반드시 명시
  rows.push(
    '<div style="margin-top:6px;color:#b45309;font-size:11px;">⚠️ ' +
      esc(t("typhoonDisclaimer")) +
      "</div>"
  );

  return `<div style="font-size:12px;line-height:1.5;max-width:260px;">${rows.join(
    ""
  )}</div>`;
}

export default function TyphoonLayer({ map, enabled = false }) {
  // 그린 레이어 전부 보관 (재조회 시 제거용)
  const layersRef = useRef([]);
  const { t, locale } = useI18n();

  useEffect(() => {
    if (!map || !enabled) return undefined;

    let cancelled = false;
    let timer = null;

    function removeAll() {
      try {
        for (const layer of layersRef.current) {
          try {
            map.removeLayer(layer);
          } catch (e) {}
        }
        layersRef.current = [];
      } catch (error) {
        console.error("[TyphoonLayer] 레이어 제거 실패:", error); // TODO: 배포 전 제거
      }
    }

    function add(layer) {
      layer.addTo(map);
      layersRef.current.push(layer);
    }

    async function load() {
      try {
        const res = await fetch("/api/typhoons", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        removeAll(); // 새로 그리기 전 이전 것 제거(겹침 방지)

        const list = Array.isArray(data.typhoons) ? data.typhoons : [];
        for (const ty of list) {
          try {
            if (typeof ty.lat !== "number" || typeof ty.lng !== "number") {
              continue;
            }
            // ⚠️ 아래 모든 계산은 "이 태풍(ty) 자신의" 좌표·반경·경로만 참조한다
            //    (반복문 밖 고정값이나 첫 태풍의 값을 쓰지 않는다).
            const cat = typhoonCategory(ty.maxWindKt);
            const color = ty.categoryColor || cat.color;

            // ── 1) 풍속 피해범위 (약한 등급부터 그려 강한 등급이 위에 오게) ──
            for (const s of RADII_STYLES) {
              const quad = ty.currentRadii && ty.currentRadii[s.key];
              const pts = windRadiiPolygon(ty.lat, ty.lng, quad);
              if (!pts) continue;
              const poly = L.polygon(pts, {
                color: s.color,
                weight: s.weight,
                opacity: 0.75,
                fillColor: s.color,
                fillOpacity: s.fill,
                interactive: false, // 클릭은 중심 마커가 받게
              });
              add(poly);
            }

            // ── 2) 과거 경로 (실선) ──
            const obs = Array.isArray(ty.observedTrack) ? ty.observedTrack : [];
            if (obs.length >= 2) {
              const line = L.polyline(
                obs.map((p) => [p.lat, p.lng]),
                {
                  color: "#5b6472",
                  weight: 2,
                  opacity: 0.7,
                  interactive: false,
                }
              );
              add(line);
            }

            // ── 3) 예상 경로 (점선 + 지점 마커) ──
            const fc = Array.isArray(ty.forecast) ? ty.forecast : [];
            if (fc.length >= 1) {
              // 현재 위치에서 예보 지점들로 이어지는 점선
              const fcLine = L.polyline(
                [[ty.lat, ty.lng], ...fc.map((p) => [p.lat, p.lng])],
                {
                  color: "#C62828",
                  weight: 2.5,
                  opacity: 0.9,
                  dashArray: "7,6",
                  interactive: false,
                }
              );
              add(fcLine);

              for (const fp of fc) {
                // ⚠️ 각 예보 지점은 자기 자신의 시각·풍속을 표시한다.
                const fcCat = typhoonCategory(fp.maxWindKt);
                const dot = L.circleMarker([fp.lat, fp.lng], {
                  radius: 4,
                  color: "#ffffff",
                  weight: 1.5,
                  fillColor: fcCat.color,
                  fillOpacity: 1,
                });
                const when = fmtTime(fp.validAt, locale);
                const kmh = ktToKmh(fp.maxWindKt);
                dot.bindTooltip(
                  `${when} UTC · ${fp.maxWindKt ?? "-"} kt${
                    kmh ? ` (${kmh} km/h)` : ""
                  }`,
                  { direction: "top", className: "event-label" }
                );
                add(dot);
              }
            }

            // ── 4) 현재 중심 마커 (맨 위) ──
            const marker = L.marker([ty.lat, ty.lng], {
              icon: makeCenterIcon(color),
              zIndexOffset: 800, // 자연재해(500)보다 위, ISS(3000)보다 아래
            });
            marker.bindPopup(buildPopupHtml(ty, t, locale));
            const kmh = ktToKmh(ty.maxWindKt);
            marker.bindTooltip(
              `🌀 ${ty.name}${
                typeof ty.maxWindKt === "number"
                  ? ` · ${ty.maxWindKt}kt${kmh ? `/${kmh}km/h` : ""}`
                  : ""
              }`,
              {
                permanent: true,
                direction: "right",
                className: "event-label",
                offset: [12, 0],
              }
            );
            add(marker);
          } catch (innerError) {
            // 개별 태풍 실패는 건너뛴다(나머지는 그린다)
            continue;
          }
        }
      } catch (error) {
        console.error("[TyphoonLayer] 태풍 로드 실패:", error); // TODO: 배포 전 제거
      }
    }

    load(); // 즉시 1회
    timer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      removeAll();
    };
    // locale 변경 시 팝업/툴팁을 새 언어로 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, locale]);

  return null;
}
