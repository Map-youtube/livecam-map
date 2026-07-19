// ─────────────────────────────────────────────────────────────
// 메인 화면 (/) — 사용자용 공개 화면 (로그인 불필요, 서버 컴포넌트)
//
// - getPublicMarkers()로 활성 마커를 5분 캐싱으로 조회.
// - tags 컬렉션을 직접 조회(간단한 조회라 별도 캐싱 없이 매번 조회 — 태그는 자주 안 바뀜).
// - markers, tags 를 클라이언트 컴포넌트 MainMapView 에 props 로 전달.
//
// ⚠️ 인증/로그인 로직을 넣지 않는다 (공개 화면).
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { getMapMarkers } from "@/lib/getMapMarkers";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getRegionDescriptions } from "@/lib/regionDescriptions";
import MainMapView from "@/components/MainMapView";

// ─── 홈 payload 경량화: 클라이언트(지도 화면)가 렌더링에 전혀 안 쓰는 마커 필드 제외 ──
//   ⚠️ 표시·기능 변화 0 이 전제. 아래 필드는 핀·패널·트리·툴팁 어디서도 읽지 않음을
//      마커 소비 컴포넌트 전수 검사(grep 0회: MainMapView/MapView/LeafletMap/VideoListPanel/
//      MainCategoryTree/MobileDrawer/IssVideoPanel/markerDesc/coordUtils)로 확인했다.
//   ⚠️ 블록리스트 방식: "확실히 안 쓰는 것"만 제거하고, 그 외 모든 필드(알려지지 않은 것 포함)는
//      값 그대로 통과시킨다 → 화면/동작이 기존과 100% 동일하게 유지된다.
//   ⚠️ 서버/SEO/빌드 경로(getPublicMarkers·getNormalizedPublicMarkers 등)는 건드리지 않는다.
//      오직 이 홈페이지에서 클라이언트로 넘기는 배열만 얇게 만든다(전역 캐시된 원본은 그대로).
//   목적: 마커 ~700개 × (제목/채널정보/타임스탬프/AI메타) 로 커진 초기 HTML 을 줄여 로딩 경량화.
const CLIENT_OMIT_MARKER_FIELDS = new Set([
  "youtube_title",
  "youtube_url",
  "youtube_channel_name",
  "youtube_channel_id",
  "youtube_channel_url",
  "created_at",
  "updated_at",
  "last_checked_at",
  "description_confirmed",
  "ai_enriched",
  "ai_model",
  "ai_enriched_at",
  "source_channel_id",
  "source_channel_youtube_id",
]);

// 마커에서 클라이언트 미사용 필드만 뺀 얕은 복사본 생성(나머지 필드·값은 완전히 동일).
function slimMarkerForClient(marker) {
  if (!marker || typeof marker !== "object") return marker;
  const out = {};
  for (const key of Object.keys(marker)) {
    if (!CLIENT_OMIT_MARKER_FIELDS.has(key)) out[key] = marker[key];
  }
  return out;
}

// 태그 목록 조회 (id, name 만 사용 → 타임스탬프 직렬화 문제 없음)
async function getPublicTags() {
  try {
    const snapshot = await adminDb.collection("tags").get();
    const tags = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: (doc.data() && doc.data().name) || "",
    }));
    // 한국어 가나다순 정렬
    tags.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return tags;
  } catch (error) {
    console.error("[page] 태그 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

export default async function Home() {
  // 마커(캐싱)·태그·자동 라이브 채널·지역 소개글을 병렬로 조회
  let markers = [];
  let tags = [];
  let liveChannels = [];
  let regionDescriptions = {};
  try {
    [markers, tags, liveChannels, regionDescriptions] = await Promise.all([
      getMapMarkers(),
      getPublicTags(),
      getLiveChannels(),
      getRegionDescriptions(),
    ]);
  } catch (error) {
    console.error("[page] 데이터 조회 실패:", error); // TODO: 배포 전 제거
    markers = [];
    tags = [];
    liveChannels = [];
    regionDescriptions = {};
  }

  // 클라이언트로 넘기기 직전에만 미사용 필드를 제거해 초기 payload 를 줄인다(표시·기능 동일).
  const slimMarkers = Array.isArray(markers)
    ? markers.map(slimMarkerForClient)
    : [];

  return (
    <MainMapView
      markers={slimMarkers}
      tags={tags}
      liveChannels={liveChannels}
      regionDescriptions={regionDescriptions}
    />
  );
}
