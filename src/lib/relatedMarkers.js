// ─────────────────────────────────────────────────────────────
// relatedMarkers — 마커 상세 페이지의 "관련 영상" 목록 (서버 전용)
//
// 선정 기준 (CLAUDE.md 3-3절):
//   1) 같은 도시의 다른 마커를 먼저 채운다
//   2) 부족하면 같은 국가의 다른 마커로 채운다
//   3) 그래도 부족하면 같은 대륙의 다른 마커로 채운다 (도시/국가에 마커가 1개뿐인 경우 대비)
//   4) 현재 마커는 제외
//   5) 공개(활성) 마커만
//
// 왜 필요한가:
//   영상을 다 본 방문자가 이어서 볼 콘텐츠가 없으면 그대로 이탈한다.
//   같은 지역의 다른 라이브캠을 붙여 연속 탐색을 유도한다(이탈률 전략).
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-16 사고 후속): 예전에는 getNormalizedPublicMarkers()로
//    공개 마커 "전체"(수동+자동, 수백~수천 개)를 매 페이지마다 읽어 JS 에서 걸렀다.
//    마커가 3,000개+로 늘면 (마커 상세 페이지 수 × 3,000) 읽기가 되어 무료 한도를 다시 초과한다.
//    → src/lib/queryPublicMarkers.js 의 country/continent 타겟 쿼리를 그대로 재사용한다
//      (대륙/국가/도시 SEO 목록 페이지와 동일 로직 — 국가별 결과 unstable_cache 5분 공유,
//       중복제거는 "사이트 전체" 기준이라 정확함. 자세한 이유는 그 파일 주석 참고).
//
// 파리티: 선정 순서(도시→국가→대륙)·현재 마커 제외·중복 제거·limit 는 기존과 동일하게 유지한다.
//   단, "같은 도시"는 이제 "같은 국가 안의 같은 도시"로 정확히 한정된다(예: 미국 Paris 와 프랑스
//   Paris 가 도시명이 같다고 묶이던 기존의 부정확함이 사라짐 — 대륙 단계에선 여전히 후보로 남음).
// ─────────────────────────────────────────────────────────────

import {
  getCountryPublicMarkers,
  getContinentPublicMarkers,
} from "@/lib/queryPublicMarkers";

const DEFAULT_LIMIT = 8;

export async function getRelatedMarkers(current, limit = DEFAULT_LIMIT) {
  try {
    if (!current || !current.id) return [];

    const curCity = (current.city || "").trim().toLowerCase();
    const curCountry = (current.country || "").trim().toUpperCase();
    const curContinent = (current.continent || "").trim();

    const picked = [];
    const seen = new Set([current.id]); // 현재 마커 제외

    // ⚠️ 각 후보는 자기 자신의 값으로 판정(반복문 밖 고정값 참조 금지). 중복 id 제외, limit 준수.
    const addFrom = (list) => {
      for (const m of Array.isArray(list) ? list : []) {
        if (picked.length >= limit) break;
        if (!m || !m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        picked.push(m);
      }
    };

    // 1) 같은 국가 마커를 한 번 읽어 "도시 → 국가" 두 단계를 채운다.
    if (curCountry) {
      const countryMarkers = await getCountryPublicMarkers(curCountry);
      const sameCity = curCity
        ? countryMarkers.filter(
            (m) => (m.city || "").trim().toLowerCase() === curCity
          )
        : [];
      addFrom(sameCity); // 1순위: 같은 (국가 안) 도시
      if (picked.length < limit) addFrom(countryMarkers); // 2순위: 같은 국가
    }

    // 2) 아직 부족하면 같은 대륙으로 채운다(도시/국가에 마커가 거의 없는 경우 대비).
    //    getContinentPublicMarkers 가 legacy "americas" 조회 + 정규화 재확인까지 내부 처리한다.
    if (picked.length < limit && curContinent) {
      const continentMarkers = await getContinentPublicMarkers(curContinent);
      addFrom(continentMarkers);
    }

    return picked;
  } catch (error) {
    console.error("[relatedMarkers] 관련 마커 조회 실패:", error); // TODO: 배포 전 제거
    // 실패해도 상세 페이지 본문은 정상 표시되도록 빈 배열 반환
    return [];
  }
}
