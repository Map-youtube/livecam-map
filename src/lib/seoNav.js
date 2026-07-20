// ─────────────────────────────────────────────────────────────
// seoNav — 상단 네비게이션용 "대륙 → 국가" 목록 (서버 전용)
//
// SEO 정적 페이지의 헤더 메뉴에 넣을 데이터를 만든다.
//   [{ continent: "asia", total: 42, countries: [{ code: "JP", count: 12 }, ...] }, ...]
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-20 사고 후속 — 재발):
//    이 함수는 continent→country 집계를 위해 getNormalizedPublicMarkers()(= 공개 마커 "전체",
//    markers + auto_markers 수백~수천 개)를 읽는다. 그런데 이 함수는 SeoPageShell(모든 SEO
//    페이지 5종: 대륙/국가/도시/마커/채널을 감싸는 공통 껍데기)의 헤더에서 호출되므로,
//    크롤러가 800개+ SEO URL 을 훑을 때 "페이지 렌더마다 전체 컬렉션 스캔"이 발생했다.
//    (c0511d6 은 페이지 '본문'만 타겟 쿼리로 바꾸고 이 공유 헤더를 놓쳐서 읽기 초과가 재발.)
//    unstable_cache 는 Vercel 서버리스에서 인스턴스별로 캐시가 분리돼 이 폭증을 못 막는다.
//    → 방송/ISS 와 동일하게 Firestore 시간제 스냅샷(getTimedSnapshot)으로 전환한다.
//      집계(전체 스캔)는 30분에 "딱 1번"만 하고, 모든 페이지 렌더는 스냅샷 문서 1개만 읽는다
//      (트래픽과 무관하게 읽기 고정). 헤더의 국가 카운트는 30분 지연 갱신되지만 무해하다.
//
// 국가명·대륙명은 여기서 번역하지 않는다(서버에는 사용자 언어가 없음).
// 코드(예: "asia", "JP")만 넘기고, 화면(클라이언트)에서 useI18n 으로 번역한다.
// ─────────────────────────────────────────────────────────────

import { VALID_CONTINENTS, getNormalizedPublicMarkers } from "@/lib/seoData";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

// 실제 집계(전체 마커 스캔) — 스냅샷이 만료됐을 때만 호출된다(throw 하지 않음).
async function computeSeoNav() {
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
    console.error("[seoNav] 집계 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

export async function getSeoNav() {
  try {
    // 30분 시간제 스냅샷: 만료 시에만 전체 스캔, 그 외에는 문서 1개만 읽음.
    const nav = await getTimedSnapshot({
      docId: "seo_nav",
      refreshMs: 30 * 60 * 1000, // 30분
      compute: computeSeoNav,
      // 배열이 비었으면(마커 0개 등) 이전 정상값 유지(일시적 실패 방어)
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    return Array.isArray(nav) ? nav : [];
  } catch (error) {
    console.error("[seoNav] 네비게이션 데이터 생성 실패:", error); // TODO: 배포 전 제거
    // 실패해도 헤더는 로고만이라도 보이도록 빈 배열 반환 (페이지는 계속 렌더)
    return [];
  }
}
