// ─────────────────────────────────────────────────────────────
// queryPublicMarkers — country/continent 기준 "타겟 쿼리"로 공개 마커 조회 (서버 전용)
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-16/19 사고 후속): 대륙/국가/도시 SEO 목록 페이지
//    (약 100개+, 크롤러가 사이트맵 제출 후 처음 방문할 때마다 렌더)가 각자
//    getNormalizedPublicMarkers()(공개 마커 "전체", 수백~수천 개)를 읽어 JS 에서 국가/도시로
//    걸러냈다. 크롤러가 짧은 시간에 여러 페이지를 훑으면 페이지 수 × 전체 마커 수만큼 읽기가
//    발생해 무료 한도(5만/일)를 순식간에 넘긴다(2026-07-19 실측: 1시간에 최대 1.8만 읽기).
//    → getRelatedMarkers 에 적용했던 것과 같은 방식: country/continent 단일 필드로 "그 범위만"
//      쿼리한다. 읽는 문서 수가 전체 컬렉션이 아니라 "그 국가/대륙 크기"로 줄어든다.
//    ⚠️ 복합 인덱스 회피: is_active/is_live/auto_disabled 필터는 쿼리에 넣지 않고 작은
//       결과셋을 JS 에서 거른다 → 단일필드 쿼리라 별도 인덱스가 필요 없다.
//
// getCountryPublicMarkers(countryUpper) / getContinentPublicMarkers(continent):
//   반환 마커는 getNormalizedPublicMarkers() 와 동일한 형태(정규화·직렬화 완료).
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeContinent } from "@/lib/seoData";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

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
    console.error("[queryPublicMarkers] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

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

// ⚠️ 중복제거는 "그 국가/대륙 범위 안"이 아니라 "사이트 전체" 기준이어야 한다(getMapMarkers 와
//    동일 규칙). 범위 안에서만 제거하면, 수동 마커와 국가가 다르게 등록된(오분류 등) 자동 마커의
//    영상이 겹칠 때 원래는 제외돼야 하는데 살아남는 사례가 실제로 발생한다(실측: US/NL/PA/GL 4개
//    국가에서 발견). 그래서 "수동 마커 전체의 video_id 목록"만 기준으로 쓴다.
//    (필드 하나만 쓰지만 Firestore 는 문서 단위 과금이라 markers 컬렉션 전체 읽기와 비용은 같다.)
async function fetchGlobalManualVideoIds() {
  const snap = await adminDb.collection("markers").select("youtube_video_id", "is_active", "auto_disabled").get();
  const ids = new Set();
  snap.docs.forEach((d) => {
    const x = d.data() || {};
    if (x.is_active === false || x.auto_disabled === true) return;
    if (x.youtube_video_id) ids.add(x.youtube_video_id);
  });
  return [...ids]; // Set 은 캐시 직렬화가 안 되므로 배열로 반환
}
// ⚠️ Firestore 읽기 폭증 방지(2026-07-20 사고 후속 — 재발): 예전엔 unstable_cache 로 감쌌지만,
//    Vercel 서버리스에서 인스턴스별로 캐시가 분리돼 지역 SEO 페이지 렌더마다 markers 전체를
//    다시 스캔했다(getSeoNav 와 함께 읽기 초과 재발의 원인). → 방송/ISS·getSeoNav 와 동일하게
//    Firestore 시간제 스냅샷으로 전환: 15분에 1번만 markers 를 스캔하고, 그 외 모든 렌더는
//    스냅샷 문서 1개만 읽는다(트래픽·페이지 수와 무관하게 읽기 고정). 결과는 이전과 동일한 배열.
function getGlobalManualVideoIds() {
  return getTimedSnapshot({
    docId: "manual_video_ids",
    refreshMs: 15 * 60 * 1000, // 15분
    compute: async () => {
      try {
        return await fetchGlobalManualVideoIds();
      } catch (error) {
        console.error("[queryPublicMarkers] 전역 video_id 스캔 실패:", error); // TODO: 배포 전 제거
        return [];
      }
    },
    // 빈 배열([])도 유효값(수동 마커의 video_id 가 하나도 없을 수 있음)이므로 배열이면 그대로 사용.
    isEmpty: (v) => !Array.isArray(v),
  });
}

// field(country|continent) 기준으로 수동+자동 컬렉션을 타겟 쿼리해 "공개 마커" 배열 반환.
async function queryPublicMarkersByField(field, value, useIn = false) {
  const build = (col) =>
    useIn
      ? adminDb.collection(col).where(field, "in", value)
      : adminDb.collection(col).where(field, "==", value);

  const [manualSnap, autoSnap, globalManualVideoIdsArr] = await Promise.all([
    build("markers").get(),
    build("auto_markers").get(),
    getGlobalManualVideoIds(),
  ]);

  const manual = manualSnap.docs
    .map((d) => normalizeContinent(serializeMarker(d.id, d.data())))
    .filter(manualVisible);
  const auto = autoSnap.docs
    .map((d) => normalizeContinent(serializeMarker(d.id, d.data())))
    .filter(autoVisible);

  // 중복 제거: 같은 youtube_video_id 가 (사이트 전체) 수동 마커에 있으면 자동 쪽을 제외.
  const globalManualVideoIds = new Set(globalManualVideoIdsArr);
  const autoDeduped = auto.filter(
    (m) => !(m.youtube_video_id && globalManualVideoIds.has(m.youtube_video_id))
  );

  return [...manual, ...autoDeduped];
}

// 같은 국가 공개 마커 (unstable_cache 로 국가별 공유 캐시, 5분)
export function getCountryPublicMarkers(countryUpper) {
  return unstable_cache(
    () => queryPublicMarkersByField("country", countryUpper),
    ["public-markers-by-country", countryUpper],
    { revalidate: 300, tags: ["public-markers", "auto-markers"] }
  )();
}

// 같은 대륙 공개 마커 (legacy "americas" 포함해 in 쿼리 → 정규화값으로 재확인은 호출부 책임)
export function getContinentPublicMarkers(continent) {
  const inList =
    continent === "north_america" || continent === "south_america"
      ? [continent, "americas"] // legacy 값도 함께 조회
      : [continent];
  const key = [...inList].sort().join(",");
  return unstable_cache(
    () => queryPublicMarkersByField("continent", inList, true),
    ["public-markers-by-continent", key],
    { revalidate: 300, tags: ["public-markers", "auto-markers"] }
  )().then((list) =>
    // "in" 쿼리로 legacy 값도 섞여 왔을 수 있으므로, 정규화된 continent 가 정확히
    // 요청한 값과 같은 것만 남긴다(정규화는 이미 위에서 적용됨).
    list.filter((m) => (m.continent || "").trim() === continent)
  );
}
