// ─────────────────────────────────────────────────────────────
// auroraUtils — 오로라 히트맵용 데이터 변환 유틸
//
// parseAuroraGrid(coordinates)
//   - /api/aurora-forecast 응답의 coordinates 배열을 leaflet.heat 형식으로 변환한다.
//   - NOAA OVATION 격자 형식: [경도(0~360), 위도(-90~90), 확률(0~100)]
//   - leaflet.heat 요구 형식: [위도, 경도, 강도(0~1)]  ← 경도/위도 순서가 반대라 주의!
//   - 필터:
//       · 확률(intensity) 0 이하 지점 제외 (렌더링 부하 감소)
//       · 위도 45도 미만 지점 제외 (저위도/남반구는 오로라 관측 사실상 불가 → 북반구 고위도 위주)
//   - NOAA 경도는 0~360 이므로 180 초과 값은 -360 하여 Leaflet(-180~180)로 맞춘다.
//   - try-catch 로 감싸 실패 시 빈 배열 반환.
//
// ※ 오로라는 "분포도" 표시 방식이라 마커 클릭형 지점 조회 함수는 만들지 않는다.
// ─────────────────────────────────────────────────────────────

// 오로라를 표시할 최소 위도 (이 미만은 제외)
const MIN_LATITUDE = 45;

// 히트맵 캔버스 크기 (경도 -180~180 → 가로, 위도 90~-90 → 세로)
const AURORA_CANVAS_W = 1024;
const AURORA_CANVAS_H = 512;
// 각 격자점을 그릴 반경(px) — 격자 간격(≈2.8px)보다 크게 잡아 부드럽게 뭉치게 함
const AURORA_BRUSH_RADIUS = 14;

export function parseAuroraGrid(coordinates) {
  const points = [];
  try {
    if (!Array.isArray(coordinates)) return points;

    for (const c of coordinates) {
      try {
        if (!Array.isArray(c) || c.length < 3) continue;

        const lngRaw = Number(c[0]); // 경도 (0~360)
        const lat = Number(c[1]); // 위도 (-90~90)
        const intensity = Number(c[2]); // 확률 (0~100)

        if (Number.isNaN(lngRaw) || Number.isNaN(lat) || Number.isNaN(intensity)) {
          continue;
        }
        // 확률 0 이하 제외 (부하 감소)
        if (intensity <= 0) continue;
        // 북반구 고위도만 (45도 미만 제외)
        if (lat < MIN_LATITUDE) continue;

        // NOAA 경도(0~360) → Leaflet 경도(-180~180)
        const lng = lngRaw > 180 ? lngRaw - 360 : lngRaw;

        // leaflet.heat 형식 [위도, 경도, 강도(0~1)]
        points.push([lat, lng, intensity / 100]);
      } catch (innerError) {
        // 개별 격자점 오류는 건너뛴다
        continue;
      }
    }
  } catch (error) {
    console.error("[auroraUtils] parseAuroraGrid 에러:", error); // TODO: 배포 전 제거
    return [];
  }
  return points;
}

// ─────────────────────────────────────────────────────────────
// renderAuroraToCanvas(coordinates)
//   - leaflet.heat 와 동일한 원리의 캔버스 히트맵을 만들어 data URL(PNG)로 반환한다.
//   - 알고리즘(leaflet.heat 방식):
//       ① 각 격자점 위치에 "중심이 진하고 밖으로 갈수록 투명"한 흑색 원형 그라데이션을
//          확률(0~1)에 비례한 불투명도로 겹쳐 그린다 → 겹치는 곳은 자연스럽게 뭉쳐 구름 모양.
//       ② 완성된 알파(누적 강도)를 파랑→초록→노랑→주황→빨강 팔레트로 색칠한다.
//   - 좌표 매핑: 경도 -180~180 → x 0~W, 위도 90~-90 → y 0~H (전 지구 평면)
//   - parseAuroraGrid 로 이미 필터링된 점([위도, 경도, 강도0~1])을 재사용한다
//     (확률 0 제외, 위도 45도 미만 제외).
//   - 브라우저에서만 동작(document 필요). 실패 시 null 반환.
// ─────────────────────────────────────────────────────────────
export function renderAuroraToCanvas(coordinates) {
  try {
    if (typeof document === "undefined") return null;

    const points = parseAuroraGrid(coordinates); // [위도, 경도, 강도(0~1)]
    if (!points.length) return null;

    const W = AURORA_CANVAS_W;
    const H = AURORA_CANVAS_H;
    const R = AURORA_BRUSH_RADIUS;

    // ── 원형 브러시(흑색 radial gradient) 준비 ──
    const brush = document.createElement("canvas");
    brush.width = R * 2;
    brush.height = R * 2;
    const bctx = brush.getContext("2d");
    const grad = bctx.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, R * 2, R * 2);

    // ── 강도 누적 캔버스 ──
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    for (const p of points) {
      try {
        const lat = p[0];
        const lng = p[1];
        const intensity = p[2]; // 0~1
        if (!intensity || intensity <= 0) continue;
        // 경도/위도 → 캔버스 좌표
        const x = ((lng + 180) / 360) * W;
        const y = ((90 - lat) / 180) * H;
        // 확률에 비례한 불투명도로 브러시를 겹쳐 찍는다(최소 0.05 보장)
        ctx.globalAlpha = Math.min(1, Math.max(0.05, intensity));
        ctx.drawImage(brush, x - R, y - R);
        // ★ 날짜변경선 이음매 제거: 좌우 끝(반경 이내) 점은 반대쪽 끝에도 한 번 더 그려
        //   이미지 양 끝이 자연스럽게 이어지도록 "래핑" 처리한다.
        if (x < R) {
          ctx.drawImage(brush, x + W - R, y - R); // 왼쪽 끝 → 오른쪽 끝에도
        } else if (x > W - R) {
          ctx.drawImage(brush, x - W - R, y - R); // 오른쪽 끝 → 왼쪽 끝에도
        }
      } catch (innerError) {
        continue;
      }
    }
    ctx.globalAlpha = 1;

    // ── 색상 팔레트(256단계) 준비: 파랑→초록→노랑→주황→빨강 ──
    const paletteCanvas = document.createElement("canvas");
    paletteCanvas.width = 256;
    paletteCanvas.height = 1;
    const pctx = paletteCanvas.getContext("2d");
    const pgrad = pctx.createLinearGradient(0, 0, 256, 0);
    pgrad.addColorStop(0.2, "blue");
    pgrad.addColorStop(0.4, "lime");
    pgrad.addColorStop(0.6, "yellow");
    pgrad.addColorStop(0.8, "orange");
    pgrad.addColorStop(1.0, "red");
    pctx.fillStyle = pgrad;
    pctx.fillRect(0, 0, 256, 1);
    const palette = pctx.getImageData(0, 0, 256, 1).data;

    // ── 누적 알파 → 팔레트 색으로 치환 ──
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const alpha = d[i + 3]; // 0~255 (누적 강도)
      if (alpha === 0) continue;
      const offset = alpha * 4; // 팔레트 인덱스(강도가 높을수록 빨강 쪽)
      d[i] = palette[offset]; // R
      d[i + 1] = palette[offset + 1]; // G
      d[i + 2] = palette[offset + 2]; // B
      // 알파는 그대로 두어 강도가 낮은 곳은 은은하게, 높은 곳은 진하게
    }
    ctx.putImageData(img, 0, 0);

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("[auroraUtils] renderAuroraToCanvas 에러:", error); // TODO: 배포 전 제거
    return null;
  }
}
