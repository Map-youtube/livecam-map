// ─────────────────────────────────────────────────────────────
// YouTube 도우미 유틸리티 (서버 전용)
//
// - extractVideoId : 다양한 형태의 YouTube URL에서 video_id 추출
// - getYoutubeInfo : videos.list(part=snippet) 호출로 영상 메타데이터 수집 (1유닛)
// - getThumbnailUrl: video_id로 썸네일 URL 생성
//
// ⚠️ YOUTUBE_API_KEY는 서버 전용 환경변수다. 절대 NEXT_PUBLIC 접두사를 붙이지 않는다.
// ⚠️ 비용 절감을 위해 Search API(100유닛)는 절대 사용하지 않는다. videos.list(1유닛)만 사용.
// ─────────────────────────────────────────────────────────────

// ─── video_id 추출 ─────────────────────────────────────────────
// 지원 형태:
//   https://www.youtube.com/watch?v=VIDEOID
//   https://youtu.be/VIDEOID
//   https://www.youtube.com/live/VIDEOID
//   https://www.youtube.com/embed/VIDEOID
//   https://www.youtube.com/shorts/VIDEOID
//   https://www.youtube.com/v/VIDEOID
// 추출 실패 시 null 반환.
export function extractVideoId(url) {
  try {
    // 입력값 유효성 검사
    if (!url || typeof url !== "string") {
      return null;
    }

    const trimmed = url.trim();

    // YouTube video_id는 정확히 11자리의 [A-Za-z0-9_-] 문자로 구성된다.
    const ID_PATTERN = "[A-Za-z0-9_-]{11}";

    // 각 URL 형태에 대응하는 정규식 목록 (순서대로 매칭 시도)
    const patterns = [
      // watch?v=VIDEOID  (쿼리 파라미터 v)
      new RegExp("[?&]v=(" + ID_PATTERN + ")"),
      // youtu.be/VIDEOID
      new RegExp("youtu\\.be/(" + ID_PATTERN + ")"),
      // /live/VIDEOID
      new RegExp("/live/(" + ID_PATTERN + ")"),
      // /embed/VIDEOID
      new RegExp("/embed/(" + ID_PATTERN + ")"),
      // /shorts/VIDEOID
      new RegExp("/shorts/(" + ID_PATTERN + ")"),
      // /v/VIDEOID
      new RegExp("/v/(" + ID_PATTERN + ")"),
    ];

    // 패턴을 순서대로 시도하여 첫 매칭의 캡처 그룹 반환
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // 마지막 예외 처리: 입력 자체가 순수 11자리 video_id인 경우
    if (new RegExp("^" + ID_PATTERN + "$").test(trimmed)) {
      return trimmed;
    }

    // 어떤 패턴에도 해당하지 않으면 추출 실패
    return null;
  } catch (error) {
    // 예기치 못한 에러 발생 시에도 null 반환 (호출부에서 400 처리 가능)
    console.error("[youtubeUtils] extractVideoId 에러:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 썸네일 URL 생성 ───────────────────────────────────────────
// video_id만 있으면 API 호출 없이 썸네일 URL을 만들 수 있다.
// hqdefault(480x360)는 모든 영상에서 안정적으로 제공되는 해상도다.
export function getThumbnailUrl(videoId) {
  try {
    if (!videoId || typeof videoId !== "string") {
      return null;
    }
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  } catch (error) {
    console.error("[youtubeUtils] getThumbnailUrl 에러:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── YouTube Data API 키 (기본 + 백업 자동 전환) ──────────────
// 기본 키(YOUTUBE_API_KEY)가 "할당량 초과(403 quotaExceeded/dailyLimitExceeded)"일 때만
// 백업 키(YOUTUBE_API_KEY_TEST)로 자동 재시도한다.
//   - 평소(기본 키 정상)엔 백업 키를 호출하지 않는다 → 추가 호출/비용 0 (순수 보험용).
//   - 할당량 초과 응답(403)은 유닛을 소모하지 않으므로, 백업 전환에 따른 추가 유닛도 없다.
//   - quota 외의 403(키 무효 등)은 같은 이유로 또 실패하므로 재시도하지 않는다.
//   ⚠️ 백업 키는 "다른 GCP 프로젝트"에서 발급해야 별도 할당량으로 의미가 있다
//      (같은 프로젝트 키는 같은 10,000 한도를 공유해 백업 효과가 없다).
//   ⚠️ 이 함수들은 채널 라이브 영상·마커 영상 등 모든 videos.list 호출에 공통 적용된다.

// 설정된 YouTube 키들을 [기본, 백업] 순서로(빈 값 제외) 반환.
function getYoutubeApiKeys() {
  const primary = (process.env.YOUTUBE_API_KEY || "").trim();
  const backup = (process.env.YOUTUBE_API_KEY_TEST || "").trim();
  return [primary, backup].filter(Boolean);
}

// 응답이 "할당량 초과 403"인지 판별 (본문은 clone 으로 읽어 원본 소비 안 함).
async function isQuotaExceeded(res) {
  if (!res || res.status !== 403) return false;
  try {
    const body = await res.clone().json();
    const reasons = ((body.error && body.error.errors) || []).map(
      (e) => e.reason
    );
    return (
      reasons.includes("quotaExceeded") ||
      reasons.includes("dailyLimitExceeded")
    );
  } catch (error) {
    return false;
  }
}

// videos.list 등 YouTube Data API 호출 공통 래퍼.
//   endpoint: URL 객체 (key 파라미터는 붙이지 않은 상태로 넘긴다 — 여기서 키를 붙인다)
//   기본 키로 호출 → 할당량 초과면 백업 키로 1회 재시도. 반환: fetch Response.
async function youtubeFetch(endpoint) {
  const keys = getYoutubeApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "환경변수 YOUTUBE_API_KEY 가 설정되지 않았습니다. (.env.local 확인)"
    );
  }
  let lastRes = null;
  for (let i = 0; i < keys.length; i += 1) {
    const url = new URL(endpoint.toString());
    url.searchParams.set("key", keys[i]);
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });
    if (res.ok) return res;
    lastRes = res;
    // 마지막 키였거나, 할당량 초과가 아닌 다른 에러면 그대로 반환(재시도 무의미)
    const quota = await isQuotaExceeded(res);
    if (!quota || i === keys.length - 1) return res;
    console.error(
      "[youtubeUtils] 기본 YouTube 키 할당량 초과 → 백업 키(YOUTUBE_API_KEY_TEST)로 재시도"
    ); // TODO: 배포 전 제거
  }
  return lastRes;
}

// ─── 영상 메타데이터 수집 (videos.list, 1유닛) ─────────────────
// part=snippet 만 요청하여 1유닛만 소모한다.
// 반환: { title, description, channelName, thumbnailUrl, channelId, channelUrl }
// 실패(키 없음/네트워크 오류/영상 없음) 시 에러를 throw 하여 호출부에서 처리하도록 한다.
export async function getYoutubeInfo(videoId) {
  try {
    if (!videoId || typeof videoId !== "string") {
      throw new Error("유효한 videoId가 필요합니다.");
    }

    // videos.list 엔드포인트 (part=snippet,liveStreamingDetails → 여전히 1유닛)
    // liveStreamingDetails.actualEndTime 로 "라이브 방송 종료" 여부를 판별한다.
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,liveStreamingDetails");
    endpoint.searchParams.set("id", videoId);

    // API 호출 (기본 키 할당량 초과 시 백업 키로 자동 재시도)
    const res = await youtubeFetch(endpoint);

    // HTTP 레벨 에러 처리
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        `YouTube API 호출 실패 (status ${res.status}): ${bodyText.slice(0, 200)}`
      );
    }

    const data = await res.json();

    // 결과가 없으면 (삭제/비공개/잘못된 id) 에러 처리
    if (!data.items || data.items.length === 0) {
      throw new Error(
        `videoId '${videoId}'에 해당하는 영상을 찾을 수 없습니다. (삭제/비공개 여부 확인)`
      );
    }

    const snippet = data.items[0].snippet || {};

    // 썸네일 URL 선택: snippet에 제공된 고해상도 우선, 없으면 직접 생성
    const thumbnails = snippet.thumbnails || {};
    const thumbnailUrl =
      (thumbnails.high && thumbnails.high.url) ||
      (thumbnails.medium && thumbnails.medium.url) ||
      (thumbnails.default && thumbnails.default.url) ||
      getThumbnailUrl(videoId);

    // 설명은 첫 500자만 저장 (Firestore 문서 크기 절약 + 표시용)
    const description = (snippet.description || "").slice(0, 500);

    // ─── 채널 정보 추출 ───────────────────────────────────────
    // snippet 안에 이미 channelId 가 포함되어 있으므로 추가 API 호출/유닛 소모가 없다.
    // channelId 로 채널 URL을 만들어, 나중에 재생불가 점검 시 채널로 바로 이동할 수 있게 한다.
    const channelId = snippet.channelId || "";
    const channelUrl = channelId
      ? `https://www.youtube.com/channel/${channelId}`
      : "";

    // ─── 라이브 상태 판별 ─────────────────────────────────────
    // liveStreamingDetails.actualEndTime 이 있으면 "라이브 방송이 종료된" 영상이다.
    // (영상 객체 자체는 남아있어 oEmbed 로는 못 잡지만, 실제로는 재생 불가/라이브 아님)
    const lsd = data.items[0].liveStreamingDetails || null;
    const actualEndTime = lsd && lsd.actualEndTime ? lsd.actualEndTime : null;
    const liveBroadcastContent = snippet.liveBroadcastContent || "none";
    const streamEnded = Boolean(actualEndTime);

    return {
      title: snippet.title || "",
      description,
      channelName: snippet.channelTitle || "",
      thumbnailUrl,
      channelId,
      channelUrl,
      // 라이브 상태 정보
      liveBroadcastContent, // "live" | "upcoming" | "none"
      actualEndTime, // 방송 종료 시각(있으면 종료된 것)
      streamEnded, // 라이브 방송 종료 여부
    };
  } catch (error) {
    // 호출부(API Route)에서 500 처리할 수 있도록 그대로 전파
    console.error("[youtubeUtils] getYoutubeInfo 에러:", error); // TODO: 배포 전 제거
    throw error;
  }
}

// ─── 여러 영상의 존재/라이브 상태 일괄 조회 (videos.list, 배치) ──
// videos.list 는 한 번에 최대 50개 id 를 1유닛으로 조회할 수 있어 매우 저렴하다.
//   반환: Map(videoId → { exists, streamEnded, liveBroadcastContent })
//   - 응답 items 에 없는 id = 삭제/비공개 → { exists:false }
//   - liveStreamingDetails.actualEndTime 있으면 streamEnded:true (라이브 종료)
// 실패 시 빈 Map 을 반환(throw 하지 않음) → 호출부에서 "판단 보류"로 처리 가능.
export async function getVideosLiveStatus(videoIds) {
  const result = new Map();
  try {
    if (getYoutubeApiKeys().length === 0) {
      console.error(
        "[youtubeUtils] YouTube 키(YOUTUBE_API_KEY)가 없어 라이브 상태 조회를 건너뜁니다."
      ); // TODO: 배포 전 제거
      return result;
    }

    const ids = (Array.isArray(videoIds) ? videoIds : [])
      .map((v) => String(v || "").trim())
      .filter((v) => v.length > 0);

    // 50개씩 배치 (videos.list 최대 id 수)
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
      endpoint.searchParams.set("part", "snippet,liveStreamingDetails");
      endpoint.searchParams.set("id", chunk.join(","));

      // 기본 키 할당량 초과 시 백업 키로 자동 재시도
      const res = await youtubeFetch(endpoint);
      if (!res.ok) {
        // 이 배치는 판단 보류(결과에 넣지 않음)
        console.error(
          `[youtubeUtils] getVideosLiveStatus 배치 실패 (status ${res.status})`
        ); // TODO: 배포 전 제거
        continue;
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      // 존재하는(=응답에 온) id 들 처리
      for (const it of items) {
        const vid = it.id;
        const lsd = it.liveStreamingDetails || null;
        const ended = Boolean(lsd && lsd.actualEndTime);
        const lbc =
          (it.snippet && it.snippet.liveBroadcastContent) || "none";
        result.set(vid, {
          exists: true,
          streamEnded: ended,
          liveBroadcastContent: lbc,
        });
      }
      // 응답에 없는 id = 삭제/비공개 → exists:false
      for (const vid of chunk) {
        if (!result.has(vid)) {
          result.set(vid, {
            exists: false,
            streamEnded: false,
            liveBroadcastContent: "none",
          });
        }
      }
    }
  } catch (error) {
    console.error("[youtubeUtils] getVideosLiveStatus 에러:", error); // TODO: 배포 전 제거
  }
  return result;
}

// ─── 여러 영상 중 "현재 라이브 중"인 것만 정보 반환 (videos.list, 배치) ──
// part=snippet 으로 배치 조회(50개/1유닛)한 뒤 snippet.liveBroadcastContent === "live"
// 인 영상만 남긴다. (NASA 채널 최근 영상 중 실시간 방송만 골라내는 용도)
//   반환: [{ videoId, title, thumbnailUrl, channelName }]  (라이브인 것만, 순서 보존)
// 실패(키 없음/네트워크/배치 오류) 시 빈 배열 반환 — throw 하지 않는다.
export async function getLiveVideos(videoIds) {
  const liveVideos = [];
  try {
    if (getYoutubeApiKeys().length === 0) {
      console.error(
        "[youtubeUtils] YouTube 키(YOUTUBE_API_KEY)가 없어 라이브 영상 조회를 건너뜁니다."
      ); // TODO: 배포 전 제거
      return liveVideos;
    }

    const ids = (Array.isArray(videoIds) ? videoIds : [])
      .map((v) => String(v || "").trim())
      .filter((v) => v.length > 0);

    // 50개씩 배치 (videos.list 최대 id 수, 배치당 1유닛)
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
      endpoint.searchParams.set("part", "snippet");
      endpoint.searchParams.set("id", chunk.join(","));

      // 기본 키 할당량 초과 시 백업 키로 자동 재시도
      const res = await youtubeFetch(endpoint);
      if (!res.ok) {
        // 이 배치는 건너뛴다 (전체 실패로 보지 않음)
        console.error(
          `[youtubeUtils] getLiveVideos 배치 실패 (status ${res.status})`
        ); // TODO: 배포 전 제거
        continue;
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      for (const it of items) {
        const snippet = it.snippet || {};
        // 현재 실시간 방송 중인 영상만 (upcoming/none 제외)
        if (snippet.liveBroadcastContent !== "live") continue;

        const thumbnails = snippet.thumbnails || {};
        const thumbnailUrl =
          (thumbnails.high && thumbnails.high.url) ||
          (thumbnails.medium && thumbnails.medium.url) ||
          (thumbnails.default && thumbnails.default.url) ||
          getThumbnailUrl(it.id);

        liveVideos.push({
          videoId: it.id,
          title: snippet.title || "",
          thumbnailUrl,
          channelName: snippet.channelTitle || "NASA",
        });
      }
    }
  } catch (error) {
    console.error("[youtubeUtils] getLiveVideos 에러:", error); // TODO: 배포 전 제거
  }
  return liveVideos;
}

// ─── 영상 존재 여부 빠른 확인 (oEmbed, 무료) ──────────────────
// 엑셀 매크로(location.xlsm) IsYouTubeVideoValid() 와 동일한 방식.
//   https://www.youtube.com/oembed?url=...&format=json 에 GET 요청 →
//   200 이면 재생 가능(존재), 그 외(404 등)면 재생 불가(삭제/비공개/지역제한).
//
// ⚠️ 이 방식은 YouTube Data API(videos.list) 와 완전히 다른 별도의 공개 프로토콜이다.
//    API 키(YOUTUBE_API_KEY)가 필요 없고, Data API 월 유닛 한도와 무관하다. 완전 무료.
// ⚠️ 한계: 이 방식은 "삭제/비공개/지역제한"만 정확히 감지한다.
//    "라이브 방송은 끝났지만 영상 자체는 남아있는 경우"는 200 을 반환할 수 있어 감지하지 못할 수 있다.
//
// 반환:
//   - 존재:        { exists: true, statusCode: 200 }
//   - 존재 안 함:  { exists: false, statusCode: 실제코드 }
//   - 예외(네트워크 등): { exists: false, statusCode: null, error: true } (throw 하지 않음)
export async function checkVideoExists(videoId) {
  try {
    if (!videoId || typeof videoId !== "string") {
      return { exists: false, statusCode: null, error: true };
    }

    // oEmbed 엔드포인트 구성 (API 키 불필요)
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl =
      "https://www.youtube.com/oembed?url=" +
      encodeURIComponent(watchUrl) +
      "&format=json";

    const res = await fetch(oembedUrl, {
      method: "GET",
      // 실시간 상태 확인이므로 캐시하지 않는다.
      cache: "no-store",
    });

    if (res.status === 200) {
      return { exists: true, statusCode: 200 };
    }
    return { exists: false, statusCode: res.status };
  } catch (error) {
    // 네트워크 오류 등 → 안전하게 실패 처리(throw 안 함).
    // 확인 실패를 곧바로 "존재 안 함"으로 단정하지 않도록 error 플래그를 함께 반환한다.
    console.error("[youtubeUtils] checkVideoExists 에러:", error); // TODO: 배포 전 제거
    return { exists: false, statusCode: null, error: true };
  }
}
