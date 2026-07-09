// ─────────────────────────────────────────────────────────────
// NASA 라이브 영상 목록 API — src/app/api/iss/videos/route.js
//
// GET /api/iss/videos
//   NASA 공식 유튜브 채널의 "현재 라이브 중"인 영상 목록을 반환한다.
//
//   처리 순서:
//     1) 유튜브 RSS 피드(무료·키 불필요)로 최신 영상 videoId 최대 15개 수집
//        https://www.youtube.com/feeds/videos.xml?channel_id=UCLA_DiR1FfKNvjuUpBHmylQ
//        (정규식으로 <yt:videoId> 태그만 추출 — 외부 XML 파서 미사용)
//     2) videos.list(part=snippet, 배치 1유닛)로 liveBroadcastContent==="live" 필터
//     3) 각 영상 { videoId, title, thumbnailUrl, channelName:"NASA" } 반환
//
//   ★ 캐싱: unstable_cache 로 5분(300초) 캐시
//     → NASA 방송 시작/종료가 최대 5분 내 목록에 반영되고,
//       videos.list 호출은 5분에 최대 1번(하루 최대 288유닛)으로 제한된다.
//
//   ★ 에러 처리: RSS/videos.list 실패해도 500 을 내지 않고 빈 배열을 반환한다.
//      (클라이언트가 "현재 진행 중인 라이브가 없습니다"로 처리)
//
// YOUTUBE_API_KEY 는 서버 전용(getLiveVideos 내부에서 사용). Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { getLiveVideos } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NASA 공식 유튜브 채널 ID (RSS 피드 대상)
const NASA_CHANNEL_ID = "UCLA_DiR1FfKNvjuUpBHmylQ";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${NASA_CHANNEL_ID}`;
const MAX_VIDEOS = 15;

// ─── RSS 피드에서 최신 videoId 추출 (정규식 파싱) ─────────────
async function fetchRecentVideoIds() {
  try {
    // 실시간 방송 여부가 자주 바뀌므로 RSS 자체는 캐시하지 않고,
    // 상위(getNasaLiveVideos)의 unstable_cache 로 전체 결과를 5분 캐싱한다.
    const res = await fetch(RSS_URL, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[api/iss/videos] RSS 실패 (status ${res.status})`); // TODO: 배포 전 제거
      return [];
    }

    const xml = await res.text();
    const ids = [];

    // <yt:videoId>VIDEOID</yt:videoId> 를 순서대로(최신순) 최대 15개 추출
    const re = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
    let match;
    while ((match = re.exec(xml)) !== null && ids.length < MAX_VIDEOS) {
      const id = (match[1] || "").trim();
      if (id) ids.push(id);
    }

    return ids;
  } catch (error) {
    console.error("[api/iss/videos] RSS 파싱 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── 라이브 영상 목록 계산 (5분 캐시) ────────────────────────
// unstable_cache 로 감싸 결과를 5분 캐싱한다(방문자 폭주해도 videos.list 는 5분 1회).
const getNasaLiveVideos = unstable_cache(
  async () => {
    try {
      const ids = await fetchRecentVideoIds();
      if (ids.length === 0) return [];

      const live = await getLiveVideos(ids);
      // 표시용 채널명을 "NASA" 로 고정
      return live.map((v) => ({ ...v, channelName: "NASA" }));
    } catch (error) {
      console.error("[api/iss/videos] 라이브 목록 계산 실패:", error); // TODO: 배포 전 제거
      return [];
    }
  },
  ["nasa-live-videos"], // 캐시 키
  {
    revalidate: 300, // 5분
    tags: ["nasa-live-videos"],
  }
);

export async function GET() {
  try {
    const videos = await getNasaLiveVideos();
    return Response.json(
      { ok: true, videos: Array.isArray(videos) ? videos : [] },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/iss/videos][GET] 에러:", error); // TODO: 배포 전 제거
    // ★ 실패해도 500 대신 빈 배열 (클라이언트가 "라이브 없음"으로 처리)
    return Response.json({ ok: true, videos: [] }, { status: 200 });
  }
}
