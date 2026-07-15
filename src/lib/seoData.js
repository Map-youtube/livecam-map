// ─────────────────────────────────────────────────────────────
// seoData — SEO 정적 페이지(대륙/국가/도시/마커) 공용 데이터 헬퍼 (서버 전용)
//
// - getPublicMarkers(공개 마커, 5분 캐시 + tag:"public-markers")를 그대로 활용한다.
//   → 신규 마커 등록 시 마커 라우트가 호출하는 revalidateTag("public-markers")로
//     이 페이지들도 함께 On-Demand 재생성된다(별도 트리거 불필요).
// - 레거시 continent="americas" 마커는 국가코드로 north/south america 로 정규화한다
//   (메인 화면 MainMapView 와 동일한 규칙).
// - 도시명 → URL 슬러그 변환/역매칭 유틸 제공.
//
// ⚠️ 모든 함수는 try-catch 로 감싸 실패 시 빈 배열/기본값을 반환한다(빌드/렌더가 죽지 않게).
// ─────────────────────────────────────────────────────────────

import { getMapMarkers } from "@/lib/getMapMarkers";
import { getContinentByCountry } from "@/lib/continentUtils";

// 서비스가 사용하는 6개 대륙(+중동) 코드
export const VALID_CONTINENTS = [
  "asia",
  "europe",
  "north_america",
  "south_america",
  "africa",
  "oceania",
  "middleeast",
];

// 대륙별 간단 소개 문구(하드코딩) — 페이지 상단 인트로/메타 설명에 사용
export const CONTINENT_INTRO = {
  asia: "아시아의 실시간 라이브캠을 지도와 목록으로 만나보세요. 도쿄·서울·방콕 등 도시의 거리와 명소를 지금 이 순간 생중계로 감상할 수 있습니다.",
  europe:
    "유럽의 실시간 라이브캠을 한눈에. 파리·런던·로마 등 유럽 각지의 거리와 랜드마크를 실시간 영상으로 탐험해 보세요.",
  north_america:
    "북아메리카의 실시간 라이브캠 모음. 뉴욕·로스앤젤레스 등 미국·캐나다 도시의 생생한 현재 모습을 지도와 목록으로 확인하세요.",
  south_america:
    "남아메리카의 실시간 라이브캠. 리우데자네이루·부에노스아이레스 등 남미의 해변과 도시 풍경을 실시간으로 감상해 보세요.",
  africa:
    "아프리카의 실시간 라이브캠. 사파리 야생동물부터 도시 풍경까지, 아프리카 각지를 실시간 영상으로 만나보세요.",
  oceania:
    "오세아니아의 실시간 라이브캠. 시드니·오클랜드 등 호주·뉴질랜드의 해변과 도시를 실시간으로 탐험해 보세요.",
  middleeast:
    "중동의 실시간 라이브캠. 두바이·이스탄불 등 중동 주요 도시의 현재 모습을 지도와 목록으로 감상하세요.",
};

// 대륙 정규화: 레거시 continent="americas" 마커를 국가코드로 north/south america 재분류
function normalizeContinent(m) {
  try {
    if (m && m.continent === "americas") {
      const c = getContinentByCountry(m.country);
      if (c) return { ...m, continent: c };
    }
  } catch (error) {
    // 정규화 실패 시 원본 그대로 사용
  }
  return m;
}

// 정규화된 공개 마커 전체 (수동 ∪ 자동. is_active/auto_disabled/is_live 필터는 각 소스가 이미 처리)
export async function getNormalizedPublicMarkers() {
  try {
    const markers = await getMapMarkers();
    return (Array.isArray(markers) ? markers : []).map(normalizeContinent);
  } catch (error) {
    console.error("[seoData] 공개 마커 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 도시명 → URL 슬러그 (소문자, 공백→하이픈, 안전문자만 유지; 한글은 그대로 둔다)
export function citySlug(city) {
  try {
    return String(city || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9가-힣-]/g, "");
  } catch (error) {
    return "";
  }
}

// 썸네일 URL (저장값 우선, 없으면 video_id 로 생성)
export function getMarkerThumb(marker) {
  try {
    if (!marker) return null;
    if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
    if (marker.youtube_video_id) {
      return `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 배열을 key 함수 기준으로 그룹핑 → { key: [items] }
export function groupBy(items, keyFn) {
  const out = {};
  try {
    for (const it of items) {
      const k = keyFn(it);
      if (k == null) continue;
      if (!out[k]) out[k] = [];
      out[k].push(it);
    }
  } catch (error) {
    console.error("[seoData] groupBy 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}
