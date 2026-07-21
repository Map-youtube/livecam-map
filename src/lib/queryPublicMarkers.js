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

// ⚠️ 스냅샷 문서 크기 방어(1MB 한도): 이 결과는 국가/대륙별 스냅샷 문서에 통째로 저장된다.
//    마커가 3,000개+로 늘면 한 대륙 문서가 1MB 를 넘겨 쓰기가 실패 → 매 렌더 재스캔(누수 재발)한다.
//    SEO 목록 카드(RegionCard)·관련영상·JSON-LD·메타데이터는 아래 필드만 쓰므로, 무거운 텍스트
//    필드(youtube_description ~500자, description{ko,en}, youtube_title 등)는 저장에서 제외한다.
//    → 마커당 ~1KB → ~200바이트로 줄어 문서가 작게 유지된다(표시·기능 동일).
const SNAPSHOT_OMIT_FIELDS = new Set([
  "youtube_description",
  "description",
  "youtube_title",
  "youtube_url",
  "youtube_channel_name",
  "youtube_channel_id",
  "youtube_channel_url",
  "created_at",
  "updated_at",
  "last_checked_at",
  "description_confirmed",
  "disabled_reason",
  "ai_enriched",
  "ai_model",
  "ai_enriched_at",
  "source_channel_id",
  "source_channel_youtube_id",
]);
function slimForSnapshot(m) {
  if (!m || typeof m !== "object") return m;
  const out = {};
  for (const key of Object.keys(m)) {
    if (!SNAPSHOT_OMIT_FIELDS.has(key)) out[key] = m[key];
  }
  return out;
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

  // 스냅샷 저장 전, 목록/카드가 안 쓰는 무거운 필드를 제거해 문서 크기를 작게 유지한다.
  return [...manual, ...autoDeduped].map(slimForSnapshot);
}

// ⚠️ Firestore 읽기 폭증 방지(2026-07-21 사고 — 진짜 baseline 원인):
//    국가/대륙 페이지 본문(그리고 마커 상세의 '주변 라이브캠')은 렌더마다 이 함수를 부른다.
//    예전엔 unstable_cache(5분)였는데, 자동 스캔이 revalidateTag("auto-markers"/"public-markers")로
//    이 캐시와 SEO 페이지 ISR 을 함께 무효화 → 크롤러가 800개 페이지를 재렌더할 때마다 국가/대륙
//    전체를 다시 QUERY 했다(GCP 실측: 밤새 2,000~4,000 읽기/시간 꾸준 + 배포 빌드 시 4만 스파이크,
//    읽기의 91%가 QUERY). unstable_cache 는 서버리스 인스턴스별로 분리돼 크롤러 동시성 아래서
//    중복 스캔을 못 막는다. → 방송/ISS·nav·중복제거와 동일하게 국가/대륙별 Firestore 시간제
//    스냅샷으로 전환. 페이지 재렌더·빌드·크롤러 모두 스냅샷 문서 1개만 읽는다(15분에 1번만 스캔).
//    ⚠️ 스냅샷은 revalidateTag 로 즉시 갱신되지 않으므로, 마커 변경은 최대 15분 뒤 SEO 목록에 반영된다
//       (SEO 페이지는 원래 24h ISR 이라 즉시성이 필요 없음 — 허용되는 지연).

// 같은 국가 공개 마커 (국가별 Firestore 시간제 스냅샷, 15분)
export function getCountryPublicMarkers(countryUpper) {
  const cc = String(countryUpper || "").trim().toUpperCase();
  return getTimedSnapshot({
    docId: `country_${cc}`,
    refreshMs: 15 * 60 * 1000, // 15분
    compute: async () => {
      try {
        return await queryPublicMarkersByField("country", cc);
      } catch (error) {
        console.error("[queryPublicMarkers] 국가 쿼리 실패:", cc, error); // TODO: 배포 전 제거
        return []; // 실패 시 빈 배열 → 기본 isEmpty 가 이전 정상값을 유지(덮어쓰지 않음)
      }
    },
  });
}

// 같은 대륙 공개 마커 (legacy "americas" 포함 in 쿼리 후 정규화 continent 로 재확인, 대륙별 스냅샷 15분)
export function getContinentPublicMarkers(continent) {
  const cont = String(continent || "").trim();
  const inList =
    cont === "north_america" || cont === "south_america"
      ? [cont, "americas"] // legacy 값도 함께 조회
      : [cont];
  return getTimedSnapshot({
    docId: `continent_${cont}`,
    refreshMs: 15 * 60 * 1000, // 15분
    compute: async () => {
      try {
        const list = await queryPublicMarkersByField("continent", inList, true);
        // "in" 쿼리로 legacy("americas") 값이 섞여 올 수 있으므로, 정규화된 continent 가
        // 정확히 요청한 값과 같은 것만 남긴다(정규화는 queryPublicMarkersByField 안에서 적용됨).
        return list.filter((m) => (m.continent || "").trim() === cont);
      } catch (error) {
        console.error("[queryPublicMarkers] 대륙 쿼리 실패:", cont, error); // TODO: 배포 전 제거
        return [];
      }
    },
  });
}
