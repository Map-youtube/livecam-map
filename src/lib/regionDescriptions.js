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

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

export const REGION_DESC_COLLECTION = "region_descriptions";

// 홈 화면이 쓰는 "전체 소개글 맵"을 담아두는 전역 공유 스냅샷 문서 id (live_snapshots/{id})
const SNAPSHOT_DOC_ID = "region_descriptions";
// 스냅샷 재계산 주기. 소개글은 하루 1회 자동 스캔 때만 늘어나고, 그때
// invalidateRegionDescriptionsSnapshot() 이 즉시 무효화하므로 주기는 여유 있게 둔다.
const SNAPSHOT_REFRESH_MS = 6 * 60 * 60 * 1000; // 6시간

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

// ─────────────────────────────────────────────────────────────
// ⚠️ Firestore 읽기 절감(2026-07-29, 실측 대응):
//    홈(/)이 렌더될 때마다 위 fetchAllRegionDescriptions 가 region_descriptions 컬렉션
//    "전체"(현재 214개)를 스캔했다. unstable_cache 는 Vercel 서버리스 인스턴스별로 분리돼
//    콜드 렌더마다 재조회되므로, 실측 24시간 QUERY 읽기 44,644건의 주된 몫이었다.
//    (커밋 457fcbf 가 같은 문제를 대륙/국가/도시 SEO 페이지 3곳에서 고쳤으나 홈은 누락됐다.)
//
//    → 방송 목록·사이트맵과 동일한 "Firestore 시간제 스냅샷"(liveSnapshot)으로 전환한다.
//      전체 스캔은 주기당 1회만 일어나고, 그 외 렌더는 스냅샷 문서 1개만 읽는다.
//      214 읽기/렌더 → 1 읽기/렌더.
//
//    ⚠️ 반환값은 기존과 완전히 동일한 { key: {ko,en} } 맵이다(호출부·화면 변화 없음).
//    ⚠️ 소개글이 새로 생성되면 regionDescriptionRun 이 이 스냅샷을 즉시 무효화하므로
//       신선도는 기존(revalidateTag)과 동일하게 유지된다.
//    ⚠️ 실측 크기 78.9KB (Firestore 1MB 한도의 7.7%) — 여유 있음.
//    ⚠️ 스냅샷이 비었으면(계산 실패 등) 이전 정상값을 유지한다(getTimedSnapshot 규칙).
// ─────────────────────────────────────────────────────────────
async function fetchAllRegionDescriptionsShared() {
  try {
    const data = await getTimedSnapshot({
      docId: SNAPSHOT_DOC_ID,
      refreshMs: SNAPSHOT_REFRESH_MS,
      compute: fetchAllRegionDescriptions, // 실패해도 {} 반환(throw 안 함)
      // 값이 {ko,en} 객체라 기본 isEmpty(배열 판정)로는 판단이 어렵다 → 키 개수로 판정.
      isEmpty: (v) => !v || typeof v !== "object" || Object.keys(v).length === 0,
    });
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.error("[regionDescriptions] 스냅샷 조회 실패:", error); // TODO: 배포 전 제거
    return {};
  }
}

// 소개글이 새로 생성/수정됐을 때 스냅샷을 즉시 만료시킨다(다음 렌더에서 재계산).
//   문서를 지우면 getTimedSnapshot 이 "저장값 없음"으로 보고 새로 계산해 저장한다.
export async function invalidateRegionDescriptionsSnapshot() {
  try {
    await adminDb.collection("live_snapshots").doc(SNAPSHOT_DOC_ID).delete();
  } catch (error) {
    // 실패해도 최대 SNAPSHOT_REFRESH_MS 뒤에 자연히 갱신되므로 조용히 넘어간다.
    console.error("[regionDescriptions] 스냅샷 무효화 실패:", error); // TODO: 배포 전 제거
  }
}

export const getRegionDescriptions = unstable_cache(
  fetchAllRegionDescriptionsShared,
  ["region-descriptions"],
  { revalidate: 86400, tags: ["region-descriptions"] }
);

// ─────────────────────────────────────────────────────────────
// getRegionText(key, locale) — 지역 소개글 "한 개"를 문서 1개만 읽어 가져온다.
//
// ⚠️ Firestore 읽기 절감(2026-07-26): SEO 목록 페이지(대륙/국가/도시)는 소개글 "한 줄"이
//    필요할 뿐인데, 예전에는 getRegionDescriptions() 로 region_descriptions 컬렉션 전체
//    (현재 137개)를 읽어 맵을 만든 뒤 그중 하나만 꺼내 썼다. 게다가 generateMetadata 와
//    페이지 본문에서 각각 호출해 페이지 1개당 최대 274 읽기가 발생했다.
//    unstable_cache 는 Vercel 서버리스 인스턴스별로 분리돼(콜드 렌더마다 재조회) 크롤러가
//    수백 페이지를 훑으면 하루 수만 읽기가 됐다(실측 baseline 과 일치).
//    → 문서 id 가 곧 key(continent__asia / country__JP / city__...) 이므로 해당 문서 1개만
//      직접 읽는다. 137 읽기 → 1 읽기(137배 절감). 없는 키는 문서 없음(읽기 1)으로 처리.
//    ⚠️ React cache() 로 감싸 "같은 렌더 안에서 같은 키는 실제 조회 1번"이 되게 하고
//       (generateMetadata + 본문 중복 제거), unstable_cache 로 시간 캐시도 함께 건다.
//    ⚠️ 반환값·fallback 동작은 기존 pickRegionText 와 완전히 동일하다(표시 변화 없음).
// ─────────────────────────────────────────────────────────────
async function fetchRegionDoc(key) {
  try {
    if (!key) return null;
    const snap = await adminDb.collection(REGION_DESC_COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return { ko: data.ko || "", en: data.en || "" };
  } catch (error) {
    console.error("[regionDescriptions] 단건 조회 실패:", key, error); // TODO: 배포 전 제거
    return null;
  }
}

// 키별 시간 캐시(24시간) — 생성 라우트가 revalidateTag("region-descriptions") 로 무효화한다.
function getRegionDocCached(key) {
  return unstable_cache(
    () => fetchRegionDoc(key),
    ["region-description", String(key || "")],
    { revalidate: 86400, tags: ["region-descriptions"] }
  )();
}

// 같은 렌더(요청) 안에서는 같은 키를 한 번만 조회
const getRegionDocPerRender = cache(getRegionDocCached);

export async function getRegionText(key, locale = "ko") {
  try {
    const entry = await getRegionDocPerRender(key);
    if (!entry) return "";
    // pickRegionText 와 동일한 우선순위: 선호 언어 → 다른 언어 → 빈 문자열
    const primary = locale === "en" ? entry.en : entry.ko;
    return String(primary || entry.ko || entry.en || "").trim();
  } catch (error) {
    return "";
  }
}

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
