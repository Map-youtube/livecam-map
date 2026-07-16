// ─────────────────────────────────────────────────────────────
// regionDescriptions — 대륙/국가/도시 AI 소개글 저장/조회 (서버 전용)
//
// - Firestore 컬렉션 region_descriptions 에 지역별 소개글({ko,en})을 영구 저장(캐시).
//   문서 id = 안정적인 key(아래 키 빌더). 페이지는 key 로 조회해 표시하고,
//   없으면 각 페이지의 기존 하드코딩/템플릿 문구를 fallback 으로 쓴다(무회귀).
// - getRegionDescriptions(): 전체를 한 번 읽어 { key: {ko,en} } 맵으로 반환(unstable_cache, tag).
//   생성 라우트가 revalidateTag("region-descriptions") 로 무효화한다.
//
// 키 규칙(문서 id):
//   대륙: continent__{continent}
//   국가: country__{ISO2대문자}
//   도시: city__{continent}__{ISO2대문자}__{citySlug}
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";

export const REGION_DESC_COLLECTION = "region_descriptions";

export function continentDescKey(continent) {
  return `continent__${String(continent || "").trim()}`;
}
export function countryDescKey(country) {
  return `country__${String(country || "").trim().toUpperCase()}`;
}
export function cityDescKey(continent, country, citySlug) {
  return `city__${String(continent || "").trim()}__${String(country || "")
    .trim()
    .toUpperCase()}__${String(citySlug || "").trim()}`;
}

// 전체 소개글을 { key: {ko,en} } 형태로 조회 (직렬화 가능한 평범한 객체)
async function fetchAllRegionDescriptions() {
  try {
    const snap = await adminDb.collection(REGION_DESC_COLLECTION).get();
    const map = {};
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      map[d.id] = { ko: data.ko || "", en: data.en || "" };
    });
    return map;
  } catch (error) {
    console.error("[regionDescriptions] 조회 실패:", error); // TODO: 배포 전 제거
    return {};
  }
}

export const getRegionDescriptions = unstable_cache(
  fetchAllRegionDescriptions,
  ["region-descriptions"],
  { revalidate: 86400, tags: ["region-descriptions"] }
);

// 맵에서 한 지역의 소개글(ko/en 중 하나)을 안전하게 꺼낸다.
export function pickRegionText(map, key, locale = "ko") {
  try {
    const entry = map && map[key];
    if (!entry) return "";
    const primary = locale === "en" ? entry.en : entry.ko;
    // 선호 언어가 비어있으면 다른 언어라도 반환(있으면)
    return String(primary || entry.ko || entry.en || "").trim();
  } catch (error) {
    return "";
  }
}
