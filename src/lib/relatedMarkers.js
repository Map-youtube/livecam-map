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
//    → 이제 "같은 국가" 마커만 타겟 쿼리(country 는 ISO2 로 깨끗)로 읽고, 부족할 때만 "같은 대륙"을
//      추가로 읽는다. 읽는 문서 수가 컬렉션 전체가 아니라 "그 국가/대륙 크기"로 줄어든다.
//    ⚠️ 복합 인덱스 회피: is_active/is_live/auto_disabled 필터는 쿼리에 넣지 않고(작은 결과셋을)
//       JS 에서 거른다 → country/continent 단일 필드 쿼리라 별도 인덱스가 필요 없다.
//    country 별 결과는 unstable_cache(5분, tag public-markers/auto-markers)로 감싸, 같은 국가의
//    여러 마커 페이지가 조회를 공유한다(관리자 등록/스캔 시 revalidateTag 로 자동 무효화).
//
// 파리티: 선정 순서(도시→국가→대륙)·현재 마커 제외·중복 제거·limit 는 기존과 동일하게 유지한다.
//   단, "같은 도시"는 이제 "같은 국가 안의 같은 도시"로 정확히 한정된다(예: 미국 Paris 와 프랑스
//   Paris 가 도시명이 같다고 묶이던 기존의 부정확함이 사라짐 — 대륙 단계에선 여전히 후보로 남음).
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeContinent } from "@/lib/seoData";

const DEFAULT_LIMIT = 8;

// Firestore Timestamp 등 직렬화 불가 값을 순수 값으로 (getPublicMarkers.js 와 동일 로직)
function toPlainValue(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

function serializeMarker(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    console.error("[relatedMarkers] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// 공개 노출 필터 (getPublicMarkers.js / getAutoMarkers.js 와 동일 규칙)
function manualVisible(m) {
  return m && m.is_active !== false && m.auto_disabled !== true;
}
function autoVisible(m) {
  return (
    m &&
    m.is_live === true &&
    m.is_active !== false &&
    m.auto_disabled !== true &&
    typeof m.lat === "number" &&
    typeof m.lng === "number"
  );
}

// 수동+자동 두 컬렉션을 field 기준으로 쿼리해 "공개 마커" 배열로 반환.
//   - useIn=true 면 where(field,"in",value) (대륙 legacy/정규화 값 동시 조회용), 아니면 where("==").
//   - 대륙 정규화(americas→north/south) 적용, 공개 필터 적용.
//   - 중복 제거: 같은 youtube_video_id 가 수동·자동에 겹치면 수동 우선(getMapMarkers 규칙과 동일).
async function queryPublicMarkersByField(field, value, useIn = false) {
  const build = (col) =>
    useIn
      ? adminDb.collection(col).where(field, "in", value)
      : adminDb.collection(col).where(field, "==", value);

  const [manualSnap, autoSnap] = await Promise.all([
    build("markers").get(),
    build("auto_markers").get(),
  ]);

  const manual = manualSnap.docs
    .map((d) => normalizeContinent(serializeMarker(d.id, d.data())))
    .filter(manualVisible);
  const auto = autoSnap.docs
    .map((d) => normalizeContinent(serializeMarker(d.id, d.data())))
    .filter(autoVisible);

  const manualVideoIds = new Set(
    manual.map((m) => m.youtube_video_id).filter(Boolean)
  );
  const autoDeduped = auto.filter(
    (m) => !(m.youtube_video_id && manualVideoIds.has(m.youtube_video_id))
  );

  return [...manual, ...autoDeduped];
}

// 같은 국가 공개 마커 (unstable_cache 로 국가별 공유 캐시)
function getCountryMarkers(countryUpper) {
  return unstable_cache(
    () => queryPublicMarkersByField("country", countryUpper),
    ["related-markers-country", countryUpper],
    { revalidate: 300, tags: ["public-markers", "auto-markers"] }
  )();
}

// 같은 대륙 공개 마커 (legacy "americas" 포함해 in 쿼리 → 정규화값으로 다시 거른다)
function getContinentMarkers(inList) {
  const key = [...inList].sort().join(",");
  return unstable_cache(
    () => queryPublicMarkersByField("continent", inList, true),
    ["related-markers-continent", key],
    { revalidate: 300, tags: ["public-markers", "auto-markers"] }
  )();
}

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
      const countryMarkers = await getCountryMarkers(curCountry);
      const sameCity = curCity
        ? countryMarkers.filter(
            (m) => (m.city || "").trim().toLowerCase() === curCity
          )
        : [];
      addFrom(sameCity); // 1순위: 같은 (국가 안) 도시
      if (picked.length < limit) addFrom(countryMarkers); // 2순위: 같은 국가
    }

    // 2) 아직 부족하면 같은 대륙으로 채운다(도시/국가에 마커가 거의 없는 경우 대비).
    if (picked.length < limit && curContinent) {
      const inList =
        curContinent === "north_america" || curContinent === "south_america"
          ? [curContinent, "americas"] // legacy 값도 함께 조회 후 정규화로 재확인
          : [curContinent];
      const continentMarkers = await getContinentMarkers(inList);
      // 정규화된 대륙이 현재와 정확히 같은 것만(americas 를 섞어 읽었을 수 있으므로)
      const sameContinent = continentMarkers.filter(
        (m) => (m.continent || "").trim() === curContinent
      );
      addFrom(sameContinent);
    }

    return picked;
  } catch (error) {
    console.error("[relatedMarkers] 관련 마커 조회 실패:", error); // TODO: 배포 전 제거
    // 실패해도 상세 페이지 본문은 정상 표시되도록 빈 배열 반환
    return [];
  }
}
