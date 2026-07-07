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

// ─── 영상 메타데이터 수집 (videos.list, 1유닛) ─────────────────
// part=snippet 만 요청하여 1유닛만 소모한다.
// 반환: { title, description, channelName, thumbnailUrl }
// 실패(키 없음/네트워크 오류/영상 없음) 시 에러를 throw 하여 호출부에서 처리하도록 한다.
export async function getYoutubeInfo(videoId) {
  try {
    if (!videoId || typeof videoId !== "string") {
      throw new Error("유효한 videoId가 필요합니다.");
    }

    // 서버 전용 API 키
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "환경변수 YOUTUBE_API_KEY 가 설정되지 않았습니다. (.env.local 확인)"
      );
    }

    // videos.list 엔드포인트 (part=snippet → 1유닛)
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", apiKey);

    // API 호출
    const res = await fetch(endpoint.toString(), {
      method: "GET",
      // 라이브 상태/제목은 수시로 바뀔 수 있으므로 캐시하지 않는다.
      cache: "no-store",
    });

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

    return {
      title: snippet.title || "",
      description,
      channelName: snippet.channelTitle || "",
      thumbnailUrl,
    };
  } catch (error) {
    // 호출부(API Route)에서 500 처리할 수 있도록 그대로 전파
    console.error("[youtubeUtils] getYoutubeInfo 에러:", error); // TODO: 배포 전 제거
    throw error;
  }
}
