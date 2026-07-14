// ─────────────────────────────────────────────────────────────
// seoNav — 상단 네비게이션용 "대륙 → 국가" 목록 (서버 전용)
//
// SEO 정적 페이지의 헤더 메뉴에 넣을 데이터를 만든다.
//   [{ continent: "asia", total: 42, countries: [{ code: "JP", count: 12 }, ...] }, ...]
//
// ⚠️ 비용: getNormalizedPublicMarkers(= getPublicMarkers, 5분 캐시 + tag "public-markers")를
//    그대로 재사용하므로 추가 조회/비용이 발생하지 않는다. 마커가 등록/수정되면
//    revalidateTag("public-markers") 로 이 메뉴도 함께 갱신된다.
//
// 국가명·대륙명은 여기서 번역하지 않는다(서버에는 사용자 언어가 없음).
// 코드(예: "asia", "JP")만 넘기고, 화면(클라이언트)에서 useI18n 으로 번역한다.
// ─────────────────────────────────────────────────────────────

import { VALID_CONTINENTS, getNormalizedPublicMarkers } from "@/lib/seoData";

export async function getSeoNav() {
  try {
    const markers = await getNormalizedPublicMarkers();

    // 대륙별 국가 카운트 집계: { asia: { JP: 12, TH: 8 }, ... }
    const byContinent = {};
    for (const m of Array.isArray(markers) ? markers : []) {
      if (!m || !m.continent || !m.country) continue;
      const cont = String(m.continent);
      const code = String(m.country).toUpperCase();
      if (!byContinent[cont]) byContinent[cont] = {};
      byContinent[cont][code] = (byContinent[cont][code] || 0) + 1;
    }

    // 마커가 하나도 없는 대륙은 메뉴에서 뺀다(빈 페이지로 보내지 않기 위해).
    const nav = [];
    for (const cont of VALID_CONTINENTS) {
      const countryMap = byContinent[cont];
      if (!countryMap) continue;

      // 마커가 많은 국가부터 (같으면 코드순)
      const countries = Object.keys(countryMap)
        .map((code) => ({ code, count: countryMap[code] }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

      const total = countries.reduce((sum, c) => sum + c.count, 0);
      if (total === 0) continue;

      nav.push({ continent: cont, total, countries });
    }
    return nav;
  } catch (error) {
    console.error("[seoNav] 네비게이션 데이터 생성 실패:", error); // TODO: 배포 전 제거
    // 실패해도 헤더는 로고만이라도 보이도록 빈 배열 반환 (페이지는 계속 렌더)
    return [];
  }
}
