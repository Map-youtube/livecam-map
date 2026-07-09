// ─────────────────────────────────────────────────────────────
// earthquakeUtils — 지진 표시용 계산 유틸
//
// - getMagnitudeColor(mag)   : 규모에 따른 색상 (<4 초록 / 4~5 노랑 / 5~6 주황 / 6+ 빨강)
// - getMagnitudeRadiusKm(mag): 규모에 비례한 원 반경(km). 지수적으로 커진다.
//
// ⚠️ 반환 반경은 km 단위다. Leaflet L.circle 의 radius 는 "미터"이므로 사용처에서 ×1000 한다.
// ─────────────────────────────────────────────────────────────

// ─── 규모 → 색상 ─────────────────────────────────────────────
export function getMagnitudeColor(mag) {
  try {
    const m = Number(mag);
    if (Number.isNaN(m)) return "#22c55e"; // 값이 없으면 기본 초록
    if (m < 4) return "#22c55e"; // 초록
    if (m < 5) return "#eab308"; // 노랑
    if (m < 6) return "#f97316"; // 주황
    return "#ef4444"; // 빨강 (6 이상)
  } catch (error) {
    console.error("[earthquakeUtils] getMagnitudeColor 에러:", error); // TODO: 배포 전 제거
    return "#22c55e";
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
