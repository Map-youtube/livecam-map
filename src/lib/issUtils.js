// ─────────────────────────────────────────────────────────────
// issUtils — ISS 궤적선 계산 유틸 (satellite.js 기반)
//
// getIssTrajectory(satrec, minutesBefore, minutesAfter, stepMinutes)
//   - 현재시각 기준 과거~미래 구간을 일정 간격으로 propagate 하여 지상 좌표(위경도)를 구한다.
//   - ★ 날짜변경선(경도 ±180) 처리: 연속 두 점의 경도 차가 180도를 넘으면 그 지점에서
//     배열을 끊어 여러 선분으로 분리한다(지도를 가로지르는 엉뚱한 직선 방지).
//   - 반환: { past: [선분들], future: [선분들] }  (각 선분 = [[lat,lng], ...])
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

// ─── 궤적 계산 ────────────────────────────────────────────────
export function getIssTrajectory(
  satrec,
  minutesBefore = 90,
  minutesAfter = 90,
  stepMinutes = 2
) {
  const pastPoints = [];
  const futurePoints = [];

  try {
    if (!satrec) return { past: [], future: [] };

    const nowMs = Date.now();

    for (let i = -minutesBefore; i <= minutesAfter; i += stepMinutes) {
      try {
        // 매 반복마다 그 시점의 새 Date 를 만든다 (각 지점의 고유 시각)
        const date = new Date(nowMs + i * 60000);

        // ECI 좌표로 전파. 실패 시 position 이 false → 건너뜀
        const pv = satellite.propagate(satrec, date);
        if (!pv || !pv.position) continue;

        // ECI → 지리 좌표(위경도, 라디안) 변환
        const gmst = satellite.gstime(date);
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lng = satellite.degreesLong(geo.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const point = { lat, lng };
        // i<=0 → 과거(현재 포함), i>=0 → 미래(현재 포함). i==0 은 양쪽에 넣어 선을 이어준다.
        if (i <= 0) pastPoints.push(point);
        if (i >= 0) futurePoints.push(point);
      } catch (innerError) {
        // 특정 시점 계산 실패는 그 지점만 건너뛴다
        continue;
      }
    }

    return {
      past: splitByDateline(pastPoints),
      future: splitByDateline(futurePoints),
    };
  } catch (error) {
    console.error("[issUtils] 궤적 계산 실패:", error); // TODO: 배포 전 제거
    return { past: [], future: [] };
  }
}
