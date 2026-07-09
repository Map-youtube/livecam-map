// ─────────────────────────────────────────────────────────────
// NASA 라이브 영상 목록 API — src/app/api/iss/videos/route.js
//
// GET /api/iss/videos
//   NASA 공식 유튜브 채널의 "현재 라이브 중"인 영상 목록을 반환한다.
//
//   처리 순서:
//     1) 후보 videoId 수집 (무료·키 불필요, 두 소스를 합쳐 누락 방지):
//        (a) RSS 피드: 채널 "최근 업로드 15개"
//            https://www.youtube.com/feeds/videos.xml?channel_id=UCLA_DiR1FfKNvjuUpBHmylQ
//        (b) /streams 탭 HTML: 라이브/예정/지난 스트림 목록
//            https://www.youtube.com/@NASA/streams
//        ※ RSS 만 쓰면 "오래 켜둔 상시 라이브"가 최근 15개 밖으로 밀려 누락되므로,
//          streams 탭에서 스트림 videoId 를 추가로 모아 합친다(중복 제거).
//     2) videos.list(part=snippet, 배치 1유닛, 최대 50개)로 liveBroadcastContent==="live" 필터
//     3) 각 영상 { videoId, title, thumbnailUrl, channelName:"NASA" } 반환
//
//   ★ 캐싱: unstable_cache 로 5분(300초) 캐시
//     → NASA 방송 시작/종료가 최대 5분 내 목록에 반영되고,
//       videos.list 호출은 5분에 최대 1번(하루 최대 288유닛)으로 제한된다.
//
//   ★ 에러 처리: 어떤 소스가 실패해도 500 을 내지 않고 빈 배열을 반환한다.
//      (클라이언트가 "현재 진행 중인 라이브가 없습니다"로 처리)
//
// YOUTUBE_API_KEY 는 서버 전용(getLiveVideos 내부에서 사용). Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { getLiveVideos } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NASA 공식 유튜브 채널 (RSS + streams 탭)
const NASA_CHANNEL_ID = "UCLA_DiR1FfKNvjuUpBHmylQ";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${NASA_CHANNEL_ID}`;
const STREAMS_URL = "https://www.youtube.com/@NASA/streams";

// RSS 최대 개수 / videos.list 한 배치(1유닛) 최대 개수
const RSS_MAX = 15;
const STREAMS_MAX = 30;
const VIDEOS_LIST_MAX = 50;

// 유튜브가 봇 요청을 다르게 처리하지 않도록 브라우저 User-Agent 를 지정한다.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// ─── (a) RSS 피드에서 최신 videoId 추출 (정규식 파싱) ─────────
async function fetchRssVideoIds() {
  try {
    // 실시간 방송 여부가 자주 바뀌므로 개별 소스는 캐시하지 않고,
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
    while ((match = re.exec(xml)) !== null && ids.length < RSS_MAX) {
      const id = (match[1] || "").trim();
      if (id) ids.push(id);
    }
    return ids;
  } catch (error) {
    console.error("[api/iss/videos] RSS 파싱 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── (b) /streams 탭 HTML에서 videoId 추출 (정규식 파싱) ──────
// 라이브/예정/지난 스트림이 섞여 나오지만, 이후 videos.list 로 "live" 만 걸러낸다.
async function fetchStreamVideoIds() {
  try {
    const res = await fetch(STREAMS_URL, {
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!res.ok) {
      console.error(`[api/iss/videos] streams 실패 (status ${res.status})`); // TODO: 배포 전 제거
      return [];
    }
    const html = await res.text();
    const ids = [];
    const seen = new Set();
    // ytInitialData 안의 "videoId":"XXXXXXXXXXX" 패턴을 순서대로 추출(중복 제거)
    const re = /"videoId":"([A-Za-z0-9_-]{11})"/g;
    let match;
    while ((match = re.exec(html)) !== null && ids.length < STREAMS_MAX) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  } catch (error) {
    console.error("[api/iss/videos] streams 파싱 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── 라이브 영상 목록 계산 (5분 캐시) ────────────────────────
const getNasaLiveVideos = unstable_cache(
  async () => {
    try {
      // 두 소스에서 후보 videoId 수집 (한쪽이 실패해도 다른 쪽으로 진행)
      const [streamIds, rssIds] = await Promise.all([
        fetchStreamVideoIds(),
        fetchRssVideoIds(),
      ]);

      // 병합: streams(라이브 가능성 높음) 우선 + RSS, 중복 제거
      const merged = [];
      const seen = new Set();
      for (const id of [...streamIds, ...rssIds]) {
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push(id);
        }
      }
      // videos.list 는 배치당 50개까지(1유닛) → 앞에서 50개만 사용
      const ids = merged.slice(0, VIDEOS_LIST_MAX);
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
