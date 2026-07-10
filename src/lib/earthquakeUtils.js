// ─────────────────────────────────────────────────────────────
// earthquakeUtils — 지진 표시용 계산 유틸
//
// - getMagnitudeColor(mag)   : 규모에 따른 색상 (<4 연두 / 4~5 진한주황 / 5~6 빨강 / 6+ 진한빨강)
// - getMagnitudeRadiusKm(mag): 규모에 비례한 원 반경(km). 지수적으로 커진다.
//
// ⚠️ 반환 반경은 km 단위다. Leaflet L.circle 의 radius 는 "미터"이므로 사용처에서 ×1000 한다.
// ─────────────────────────────────────────────────────────────

// ─── 규모 → 색상 ─────────────────────────────────────────────
export function getMagnitudeColor(mag) {
  try {
    // 밝은 지도에서도 잘 보이도록 채도 높은 팔레트 (연두→진한주황→빨강→진한빨강)
    const m = Number(mag);
    if (Number.isNaN(m)) return "#8BC34A"; // 값이 없으면 기본 연두
    if (m < 4) return "#8BC34A"; // 연두
    if (m < 5) return "#F57C00"; // 진한 주황
    if (m < 6) return "#E53935"; // 빨강
    return "#B71C1C"; // 진한 빨강 (6 이상)
  } catch (error) {
    console.error("[earthquakeUtils] getMagnitudeColor 에러:", error); // TODO: 배포 전 제거
    return "#8BC34A";
  }
}

// ─── 규모 → 원 반경(km) ──────────────────────────────────────
// 규모가 1 커질수록 반경이 약 1.8배씩 커진다 (지수적). 예: M4.5≈53km, M6≈102km, M7≈184km.
export function getMagnitudeRadiusKm(mag) {
  try {
    const m = Number(mag);
    // 값이 없으면 작은 기본 반경
    if (Number.isNaN(m)) return 20;
    // 음수/비정상 값 방어
    const safe = m < 0 ? 0 : m;
    return Math.pow(1.8, safe) * 3;
  } catch (error) {
    console.error("[earthquakeUtils] getMagnitudeRadiusKm 에러:", error); // TODO: 배포 전 제거
    return 20;
  }
}
