// ─────────────────────────────────────────────────────────────
// liveChannelUtils — "자동 라이브 채널"(방송/우주 등) 공용 유틸 (서버 전용)
//
// 기존 NASA(ISS) 전용 로직(src/app/api/iss/videos/route.js)을 일반화한 것.
//   - 어떤 유튜브 채널이든 채널 ID(UC…)/@핸들만 있으면 "현재 라이브 중"인 영상 목록을
//     RSS + /streams 스크래핑 + videos.list(1유닛) 로 수집한다.
//   - resolveYoutubeChannel: 관리자가 붙여넣은 채널 URL/@핸들/UC-id 에서
//     channelId·handle·channelName 을 추출/해석한다(채널 페이지 스크래핑, API 키 불필요).
//
// ⚠️ YOUTUBE_API_KEY 는 getLiveVideos 내부에서만 사용(서버 전용).
// ⚠️ 모든 함수는 실패해도 throw 하지 않고 빈 값/부분값을 반환한다(사이트가 죽지 않게).
// ─────────────────────────────────────────────────────────────

import { getLiveVideos } from "@/lib/youtubeUtils";

// 유튜브가 봇 요청을 다르게 처리하지 않도록 브라우저 User-Agent 지정.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// EU 동의 인터스티셜/봇 페이지 우회용 공통 헤더(데이터센터 IP 대응).
const SCRAPE_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI",
};

const RSS_MAX = 15; // RSS 최근 업로드 최대 개수
const STREAMS_MAX = 30; // /streams 탭 최대 개수
const VIDEOS_LIST_MAX = 50; // videos.list 한 배치(1유닛) 최대 개수

// ─── 채널 ID(UC…) 로 RSS 피드에서 최신 videoId 추출 ────────────
async function fetchRssVideoIds(channelId) {
  try {
    if (!channelId) return [];
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const xml = await res.text();
    const ids = [];
    const re = /<yt:videoId>([^<]+)<\/yt:videoId>/g;
    let match;
    while ((match = re.exec(xml)) !== null && ids.length < RSS_MAX) {
      const id = (match[1] || "").trim();
      if (id) ids.push(id);
    }
    return ids;
  } catch (error) {
    console.error("[liveChannelUtils] RSS 파싱 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── @핸들의 /streams 탭 HTML 에서 videoId 추출 ────────────────
// 라이브/예정/지난 스트림이 섞여 나오지만 이후 videos.list 로 "live" 만 걸러낸다.
async function fetchStreamVideoIds(handle) {
  try {
    if (!handle) return [];
    // @핸들을 정규화(@ 접두 보장)
    const h = handle.startsWith("@") ? handle : `@${handle}`;
    const url = `https://www.youtube.com/${h}/streams?hl=en&gl=US`;
    const res = await fetch(url, { cache: "no-store", headers: SCRAPE_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [];
    const seen = new Set();
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
    console.error("[liveChannelUtils] streams 파싱 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── 채널의 "현재 라이브 중" 영상 목록 ─────────────────────────
// 입력: { channelId(UC…), handle(@핸들, 선택), fallbackIds(항상 후보에 포함할 videoId[]) }
// 반환: [{ videoId, title, thumbnailUrl, channelName }]  (라이브인 것만)
// 실패 시 빈 배열. (호출부에서 캐싱)
export async function getChannelLiveVideos({
  channelId,
  handle,
  fallbackIds = [],
} = {}) {
  try {
    // RSS(채널ID) + streams(@핸들) 를 병렬 수집 (한쪽 실패해도 진행)
    const [rssIds, streamIds] = await Promise.all([
      fetchRssVideoIds(channelId),
      fetchStreamVideoIds(handle),
    ]);

    // 병합 순서: 폴백 먼저 → streams → RSS (중복 제거).
    // 폴백을 맨 앞에 둬 50개 제한에서 잘려나가지 않게 한다(상시 라이브 항상 확인).
    const merged = [];
    const seen = new Set();
    const safeFallback = Array.isArray(fallbackIds) ? fallbackIds : [];
    for (const id of [...safeFallback, ...streamIds, ...rssIds]) {
      if (id && !seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    const ids = merged.slice(0, VIDEOS_LIST_MAX);
    if (ids.length === 0) return [];

    // videos.list 로 실제 "live" 만 필터 (배치 1유닛)
    return await getLiveVideos(ids);
  } catch (error) {
    console.error("[liveChannelUtils] getChannelLiveVideos 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── 입력 문자열에서 채널 식별자 대략 파싱 ─────────────────────
// 반환: { channelId?, handle?, legacyPath? } (확실한 것만 채움)
function parseChannelInput(input) {
  const out = {};
  try {
    const s = String(input || "").trim();
    if (!s) return out;

    // 1) 순수 UC 채널 ID
    if (/^UC[0-9A-Za-z_-]{20,}$/.test(s)) {
      out.channelId = s;
      return out;
    }
    // 2) 순수 @핸들
    if (/^@[A-Za-z0-9._-]+$/.test(s)) {
      out.handle = s;
      return out;
    }
    // 3) URL 형태
    //    /channel/UC…
    const chMatch = s.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/);
    if (chMatch) out.channelId = chMatch[1];
    //    /@handle
    const hMatch = s.match(/\/(@[A-Za-z0-9._-]+)/);
    if (hMatch) out.handle = hMatch[1];
    //    /c/name 또는 /user/name (레거시) → 페이지 스크래핑으로 해석 필요
    const legacy = s.match(/\/(?:c|user)\/([A-Za-z0-9._-]+)/);
    if (legacy) out.legacyPath = s;
    // URL 인데 아무것도 못 뽑았으면 통째로 스크래핑 대상(legacyPath)로 둔다
    if (!out.channelId && !out.handle && /youtube\.com|youtu\.be/.test(s)) {
      out.legacyPath = s;
    }
  } catch (error) {
    // 무시 (부분 파싱)
  }
  return out;
}

// ─── 채널 페이지 스크래핑으로 channelId/handle/channelName 보강 ──
// URL 또는 @핸들 페이지를 받아 HTML 에서 값을 추출한다.
async function scrapeChannelPage(pageUrl) {
  const out = {};
  try {
    const res = await fetch(pageUrl + (pageUrl.includes("?") ? "&" : "?") + "hl=en&gl=US", {
      cache: "no-store",
      headers: SCRAPE_HEADERS,
    });
    if (!res.ok) return out;
    const html = await res.text();

    // channelId (UC…) — 여러 위치 중 먼저 잡히는 것 사용
    const idM =
      html.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/) ||
      html.match(/<meta itemprop="channelId" content="(UC[0-9A-Za-z_-]{20,})">/) ||
      html.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/);
    if (idM) out.channelId = idM[1];

    // handle (@…) — canonicalBaseUrl 또는 vanityChannelUrl 에서
    const hM =
      html.match(/"canonicalBaseUrl":"\/(@[A-Za-z0-9._-]+)"/) ||
      html.match(/youtube\.com\/(@[A-Za-z0-9._-]+)/);
    if (hM) out.handle = hM[1];

    // channelName — og:title 또는 채널 메타데이터
    const nM =
      html.match(/<meta property="og:title" content="([^"]+)">/) ||
      html.match(/"title":"([^"]+)","navigationEndpoint"/);
    if (nM) out.channelName = decodeHtmlEntities(nM[1]);
  } catch (error) {
    console.error("[liveChannelUtils] 채널 페이지 스크래핑 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// 간단한 HTML 엔티티 디코딩(og:title 등에서 &amp; 등 처리)
function decodeHtmlEntities(s) {
  try {
    return String(s || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } catch (error) {
    return s;
  }
}

// ─── 관리자 입력(채널 URL/@핸들/UC-id) → 채널 식별정보 해석 ────
// 반환: { ok, channelId, handle, channelName } 또는 { ok:false, error }
//   - channelId 는 RSS 에 필수. 최소한 channelId 가 있어야 ok:true.
//   - handle 은 streams 스크래핑용(있으면 좋고 없어도 동작).
export async function resolveYoutubeChannel(input) {
  try {
    const parsed = parseChannelInput(input);
    let { channelId, handle } = parsed;
    let channelName = "";

    // channelId 가 아직 없으면(핸들/레거시/URL) 페이지를 스크래핑해 보강한다.
    if (!channelId) {
      let pageUrl = "";
      if (handle) pageUrl = `https://www.youtube.com/${handle}`;
      else if (parsed.legacyPath) {
        pageUrl = parsed.legacyPath.startsWith("http")
          ? parsed.legacyPath
          : `https://www.youtube.com/${parsed.legacyPath}`;
      }
      if (pageUrl) {
        const scraped = await scrapeChannelPage(pageUrl);
        channelId = channelId || scraped.channelId;
        handle = handle || scraped.handle;
        channelName = scraped.channelName || "";
      }
    } else {
      // channelId 는 있는데 이름/핸들이 없으면 채널 페이지에서 보강(선택)
      const scraped = await scrapeChannelPage(
        `https://www.youtube.com/channel/${channelId}`
      );
      handle = handle || scraped.handle;
      channelName = scraped.channelName || "";
    }

    if (!channelId) {
      return {
        ok: false,
        error:
          "채널 ID(UC…)를 찾지 못했습니다. 채널 홈 URL, @핸들, 또는 UC로 시작하는 채널 ID를 입력하세요.",
      };
    }

    return {
      ok: true,
      channelId,
      handle: handle || "",
      channelName: channelName || "",
    };
  } catch (error) {
    console.error("[liveChannelUtils] resolveYoutubeChannel 실패:", error); // TODO: 배포 전 제거
    return { ok: false, error: "채널 정보를 해석하지 못했습니다." };
  }
}
