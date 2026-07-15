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
import MainMapView from "@/components/MainMapView";

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
  // 마커(캐싱)·태그·자동 라이브 채널을 병렬로 조회
  let markers = [];
  let tags = [];
  let liveChannels = [];
  try {
    [markers, tags, liveChannels] = await Promise.all([
      getMapMarkers(),
      getPublicTags(),
      getLiveChannels(),
    ]);
  } catch (error) {
    console.error("[page] 데이터 조회 실패:", error); // TODO: 배포 전 제거
    markers = [];
    tags = [];
    liveChannels = [];
  }

  return (
    <MainMapView markers={markers} tags={tags} liveChannels={liveChannels} />
  );
}
