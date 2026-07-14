// ─────────────────────────────────────────────────────────────
// relatedMarkers — 마커 상세 페이지의 "관련 영상" 목록 (서버 전용)
//
// 선정 기준 (CLAUDE.md 3-3절):
//   1) 같은 도시의 다른 마커를 먼저 채운다
//   2) 부족하면 같은 국가의 다른 마커로 채운다
//   3) 그래도 부족하면 같은 대륙의 다른 마커로 채운다 (도시/국가에 마커가 1개뿐인 경우 대비)
//   4) 현재 마커는 제외
//   5) 공개(활성) 마커만  ← getNormalizedPublicMarkers 가 이미 활성만 반환
//
// 왜 필요한가:
//   영상을 다 본 방문자가 이어서 볼 콘텐츠가 없으면 그대로 이탈한다.
//   같은 지역의 다른 라이브캠을 붙여 연속 탐색을 유도한다(이탈률 전략).
//
// ⚠️ 비용: getNormalizedPublicMarkers(= getPublicMarkers, 5분 캐시 + tag "public-markers")를
//    재사용하므로 추가 DB 조회/API 비용이 없다.
// ─────────────────────────────────────────────────────────────

import { getNormalizedPublicMarkers } from "@/lib/seoData";

const DEFAULT_LIMIT = 8;

export async function getRelatedMarkers(current, limit = DEFAULT_LIMIT) {
  try {
    if (!current || !current.id) return [];

    const all = await getNormalizedPublicMarkers();
    const list = Array.isArray(all) ? all : [];

    // 현재 마커 제외
    const others = list.filter((m) => m && m.id && m.id !== current.id);

    const curCity = (current.city || "").trim().toLowerCase();
    const curCountry = (current.country || "").trim().toUpperCase();
    const curContinent = (current.continent || "").trim();

    // ⚠️ 각 후보는 "자기 자신의" 도시/국가/대륙 값으로 판정한다 (반복문 밖 고정값 참조 금지)
    const sameCity = curCity
      ? others.filter(
          (m) => (m.city || "").trim().toLowerCase() === curCity
        )
      : [];
    const sameCountry = curCountry
      ? others.filter(
          (m) => (m.country || "").trim().toUpperCase() === curCountry
        )
      : [];
    const sameContinent = curContinent
      ? others.filter((m) => (m.continent || "").trim() === curContinent)
      : [];

    // 같은 도시 → 같은 국가 → 같은 대륙 순으로 채우되, 중복은 id 로 걸러낸다.
    const picked = [];
    const seen = new Set();
    for (const group of [sameCity, sameCountry, sameContinent]) {
      for (const m of group) {
        if (picked.length >= limit) break;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        picked.push(m);
      }
      if (picked.length >= limit) break;
    }

    return picked;
  } catch (error) {
    console.error("[relatedMarkers] 관련 마커 조회 실패:", error); // TODO: 배포 전 제거
    // 실패해도 상세 페이지 본문은 정상 표시되도록 빈 배열 반환
    return [];
  }
}
