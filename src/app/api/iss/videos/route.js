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

// ─── NASA 상시 라이브(ISS) 후보 videoId (폴백) ────────────────
// ISS "24/7 상시 라이브"는 오래전에 시작돼 RSS(최근 15개 업로드)에 안 들어오고,
// /streams 탭 스크래핑도 데이터센터 IP(예: Vercel)에서는 유튜브의 consent/봇 페이지가
// 떠서 실패할 수 있다. 그래서 알려진 NASA ISS 라이브 videoId 를 후보에 항상 포함시킨다.
// (실제 "live" 여부는 아래 videos.list 가 판정하므로, 지난 ID 가 섞여도 무해하다.)
const NASA_FALLBACK_IDS = [
  "awQzjn72bI0", // Live High-Definition Views from the ISS (Official NASA Stream)
  "uwXgcTc8oY8", // Live Video from the International Space Station (Official NASA Stream)
  "DIgkvm2nmHc", // (구) ISS HD Earth Viewing 계열
  "P9C25Un7xaM", // (구) NASA Live 계열
  "21X5lGlDOfg", // (구) NASA Live 계열
];

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
    // hl/gl 로 영어·미국 지역을 강제하고, CONSENT 쿠키로 EU 동의 인터스티셜을 우회한다.
    // (데이터센터 IP 에서 유튜브가 동의/봇 페이지를 주면 ytInitialData 가 없어 스크래핑 실패)
    const res = await fetch(STREAMS_URL + "?hl=en&gl=US", {
      cache: "no-store",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI",
      },
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

// ─── 후보 수집 → 라이브 판정 (진단정보 포함, 캐시 안 함) ──────
async function computeLiveVideos() {
  // 두 소스에서 후보 videoId 수집 (한쪽이 실패해도 다른 쪽으로 진행)
  const [streamIds, rssIds] = await Promise.all([
    fetchStreamVideoIds(),
    fetchRssVideoIds(),
  ]);

  // 병합 순서: 폴백(상시 ISS) 먼저 → streams → RSS. 중복 제거.
  // ★ 폴백을 맨 앞에 두어 50개 제한(slice)에서 절대 잘려나가지 않게 한다(ISS 항상 확인).
  const merged = [];
  const seen = new Set();
  for (const id of [...NASA_FALLBACK_IDS, ...streamIds, ...rssIds]) {
    if (id && !seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  // videos.list 는 배치당 50개까지(1유닛) → 앞에서 50개만 사용
  const ids = merged.slice(0, VIDEOS_LIST_MAX);

  const live = ids.length ? await getLiveVideos(ids) : [];
  // 표시용 채널명을 "NASA" 로 고정
  const videos = live.map((v) => ({ ...v, channelName: "NASA" }));

  return {
    videos,
    // 운영 진단용(비밀값 없음). ?debug=1 로만 노출.
    debug: {
      keyPresent: !!process.env.YOUTUBE_API_KEY,
      rssCount: rssIds.length,
      streamsCount: streamIds.length,
      fallbackCount: NASA_FALLBACK_IDS.length,
      candidateCount: ids.length,
      liveCount: videos.length,
      liveTitles: videos.map((v) => v.title),
    },
  };
}

// ─── 라이브 영상 목록 (1시간 캐시) ───────────────────────────
// ⚠️ YouTube 무료 할당량(10,000유닛/일) 방어: ISS(NASA) 라이브 스트림의 video_id 는
//    수개월간 거의 바뀌지 않으므로 5분마다 videos.list 를 재확인할 필요가 없다.
//    1시간 캐시로 하루 재확인 횟수를 288회→24회(약 12배↓)로 줄여 유닛 소모를 크게 절감한다.
const getNasaLiveVideos = unstable_cache(
  async () => {
    try {
      const { videos } = await computeLiveVideos();
      return videos;
    } catch (error) {
      console.error("[api/iss/videos] 라이브 목록 계산 실패:", error); // TODO: 배포 전 제거
      return [];
    }
  },
  ["nasa-live-videos"], // 캐시 키
  {
    revalidate: 3600, // 1시간 (기존 5분 → YouTube 유닛 절감)
    tags: ["nasa-live-videos"],
  }
);

export async function GET(request) {
  try {
    // ?debug=1 : 캐시 우회 실시간 진단(비밀값 없음). 원인 파악 후 제거 예정.
    let wantDebug = false;
    try {
      wantDebug = new URL(request.url).searchParams.get("debug") === "1";
    } catch (e) {
      wantDebug = false;
    }
    if (wantDebug) {
      const { videos, debug } = await computeLiveVideos();
      return Response.json({ ok: true, videos, debug }, { status: 200 });
    }

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
