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
