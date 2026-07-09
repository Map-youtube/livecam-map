// ─────────────────────────────────────────────────────────────
// issUtils — ISS 궤적선 계산 유틸 (satellite.js 기반)
//
// getIssTrajectory(satrec, minutesAhead, stepSeconds)
//   - 현재시각 ~ +minutesAhead(기본 90분) "미래 구간만" 일정 간격으로 propagate 하여
//     지상 좌표(위경도)를 구한다. (과거 구간은 계산하지 않는다)
//   - 간격은 20초(stepSeconds)로 촘촘히 계산해 마커 위치와의 어긋남을 최소화한다.
//   - ★ 날짜변경선(경도 ±180) 처리: 연속 두 점의 경도 차가 180도를 넘으면 그 지점에서
//     배열을 끊어 여러 선분으로 분리한다(지도를 가로지르는 엉뚱한 직선 방지).
//   - 반환: [선분들]  (각 선분 = [[lat,lng], ...])  ← 단일 선분 배열로 단순화
//
// ⚠️ 반복문 안에서 매번 new Date(...) 를 새로 만들어 각 시점의 고유 좌표를 계산한다
//    (같은 Date 객체를 재사용/공유하는 클로저 버그 방지 — CLAUDE.md 버그 예방 규칙).
// ─────────────────────────────────────────────────────────────

import * as satellite from "satellite.js";

// ─── 날짜변경선 교차 지점에서 점 배열을 여러 선분으로 분리 ─────
// points: [{lat, lng}, ...] (시간순). 반환: [[[lat,lng],...], ...] (선분 배열)
function splitByDateline(points) {
  const segments = [];
  let current = [];
  try {
    for (let k = 0; k < points.length; k++) {
      if (k > 0) {
        const prev = points[k - 1];
        const cur = points[k];
        // 경도 점프가 180도를 넘으면 지도 반대편으로 넘어간 것 → 선분을 끊는다
        if (Math.abs(cur.lng - prev.lng) > 180) {
          if (current.length >= 2) segments.push(current);
          current = [];
        }
      }
      current.push([points[k].lat, points[k].lng]);
    }
    if (current.length >= 2) segments.push(current);
  } catch (error) {
    console.error("[issUtils] 날짜변경선 분리 실패:", error); // TODO: 배포 전 제거
  }
  return segments;
}

// ─── 궤적 계산 (미래 구간만) ─────────────────────────────────
export function getIssTrajectory(satrec, minutesAhead = 90, stepSeconds = 20) {
  const points = [];

  try {
    if (!satrec) return [];

    const nowMs = Date.now();
    const totalSeconds = minutesAhead * 60;

    // 현재시각(s=0) ~ +minutesAhead 를 stepSeconds(기본 20초) 간격으로 계산
    for (let s = 0; s <= totalSeconds; s += stepSeconds) {
      try {
        // 매 반복마다 그 시점의 새 Date 를 만든다 (각 지점의 고유 시각)
        const date = new Date(nowMs + s * 1000);

        // ECI 좌표로 전파. 실패 시 position 이 false → 건너뜀
        const pv = satellite.propagate(satrec, date);
        if (!pv || !pv.position) continue;

        // ECI → 지리 좌표(위경도, 라디안) 변환
        const gmst = satellite.gstime(date);
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lng = satellite.degreesLong(geo.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        points.push({ lat, lng });
      } catch (innerError) {
        // 특정 시점 계산 실패는 그 지점만 건너뛴다
        continue;
      }
    }

    // 날짜변경선 기준으로 여러 선분으로 분리해 반환 (단일 선분 배열)
    return splitByDateline(points);
  } catch (error) {
    console.error("[issUtils] 궤적 계산 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}
