// ─────────────────────────────────────────────────────────────
// issUtils — ISS 궤적선 계산 유틸 (satellite.js 기반)
//
// getIssTrajectory(satrec, minutesAhead, stepSeconds)
//   - 현재시각 ~ +minutesAhead(기본 90분) "미래 구간만" 일정 간격으로 propagate 하여
//     지상 좌표(위경도)를 구한다. (과거 구간은 계산하지 않는다)
//   - 간격은 20초(stepSeconds)로 촘촘히 계산해 마커 위치와의 어긋남을 최소화한다.
//   - ★ 선분 분리 규칙 (지도를 가로지르는 비정상 직선 방지):
//       ① 날짜변경선(경도 ±180): 연속 두 점의 경도 차가 180도를 넘으면 그 지점에서 끊는다.
//       ② 계산 실패로 점을 건너뛴 경우: 건너뛴 지점에서 현재 선분을 종료하고 새 선분을 시작한다.
//          (건너뛴 앞뒤 점을 직접 이으면 실제 궤도와 무관한 직선이 생기기 때문)
//   - 반환: [선분들]  (각 선분 = [[lat, lng, altKm], ...])
//     · 각 점의 3번째 값(altKm)은 그 시점의 고도(km). Leaflet 은 [lat,lng] 만 읽으므로
//       기존 2D 지도와 완전히 호환되고, Cesium(3D)에서는 이 고도로 궤도를 띄워 그린다.
//
// ⚠️ 반복문 안에서 매번 new Date(nowMs + s * 1000) 을 새로 만들어(s는 초 단위)
//    각 시점의 고유 좌표를 계산한다 (Date 재사용/단위 착오 금지 — CLAUDE.md 버그 예방 규칙).
//
// getIssCesiumPosition(Cesium, lat, lng, altKm) → Cesium.Cartesian3 (3차원 좌표)
//   · issUtils 가 Cesium 을 직접 import 하면 Leaflet 경로(IssTracker)까지 Cesium(대용량,
//     브라우저 전용)을 끌어오게 되므로, Cesium 모듈을 "인자로 받아" 변환만 수행한다.
// ─────────────────────────────────────────────────────────────

import * as satellite from "satellite.js";

// ─── 궤적 계산 (미래 구간만) ─────────────────────────────────
export function getIssTrajectory(satrec, minutesAhead = 90, stepSeconds = 20) {
  const segments = []; // 완성된 선분들 [[ [lat,lng], ... ], ...]
  let current = []; // 현재 이어 그리는 중인 선분 [[lat,lng], ...]

  // ── 현재 선분을 닫고 새 선분 준비 (점 2개 미만이면 선이 안 되므로 버린다) ──
  function closeCurrentSegment() {
    if (current.length >= 2) segments.push(current);
    current = [];
  }

  try {
    if (!satrec) return [];

    const nowMs = Date.now();
    const totalSeconds = minutesAhead * 60;

    // 현재시각(s=0) ~ +minutesAhead 를 stepSeconds(기본 20초) 간격으로 계산
    for (let s = 0; s <= totalSeconds; s += stepSeconds) {
      try {
        // 매 반복마다 그 시점의 새 Date 를 만든다 (s는 "초" 단위 → ms 로 변환은 *1000)
        const date = new Date(nowMs + s * 1000);

        // ECI 좌표로 전파. 실패 시 position 이 false
        const pv = satellite.propagate(satrec, date);
        if (!pv || !pv.position) {
          // ★ 점을 건너뛰면 선분을 여기서 끊는다 (앞뒤 점을 직접 잇는 직선 방지)
          closeCurrentSegment();
          continue;
        }

        // ECI → 지리 좌표(위경도, 라디안) 변환
        const gmst = satellite.gstime(date);
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lng = satellite.degreesLong(geo.longitude);
        // geo.height 는 지표면 기준 고도(km). Cesium(3D)에서 궤도를 띄우는 데 사용한다.
        const altKm =
          typeof geo.height === "number" && !Number.isNaN(geo.height)
            ? geo.height
            : 0;
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          // ★ 유효하지 않은 좌표도 동일하게 선분을 끊고 건너뛴다
          closeCurrentSegment();
          continue;
        }

        // ★ 날짜변경선 처리: 직전 점과 경도 차가 180도를 넘으면
        //   지도 반대편으로 넘어간 것 → 현재 선분을 끊고 새 선분을 시작한다.
        if (current.length > 0) {
          const prevLng = current[current.length - 1][1];
          if (Math.abs(lng - prevLng) > 180) {
            closeCurrentSegment();
          }
        }

        // [위도, 경도, 고도(km)] — Leaflet 은 앞 2개만 사용(호환), Cesium 은 고도까지 사용
        current.push([lat, lng, altKm]);
      } catch (innerError) {
        // ★ 특정 시점 계산 예외도 선분을 끊고 그 지점만 건너뛴다
        closeCurrentSegment();
        continue;
      }
    }

    // 마지막으로 그리던 선분 마감
    closeCurrentSegment();

    return segments;
  } catch (error) {
    console.error("[issUtils] 궤적 계산 실패:", error); // TODO: 배포 전 제거
    return segments;
  }
}

// ─── 위경도+고도 → Cesium 3차원 좌표 (Cesium 은 인자로 받음) ──
// Cesium.Cartesian3.fromDegrees(경도, 위도, 높이(m)) 규칙에 맞춰 변환한다.
// (issUtils 는 Cesium 을 import 하지 않는다 — Leaflet 경로에 Cesium 을 끌어오지 않기 위함)
export function getIssCesiumPosition(Cesium, lat, lng, altKm) {
  try {
    if (!Cesium || !Cesium.Cartesian3) return null;
    const heightM = (Number(altKm) || 0) * 1000; // km → m
    return Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat), heightM);
  } catch (error) {
    console.error("[issUtils] getIssCesiumPosition 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}
