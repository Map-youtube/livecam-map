// ─────────────────────────────────────────────────────────────
// getLiveChannelVideos — 자동 라이브 채널의 "현재 라이브 영상" 목록 (서버 전용, 30분 캐싱)
//
// 채널별 라이브 영상을 { [channelDocId]: [{videoId,title,thumbnailUrl,channelName}] } 로 수집.
//   - unstable_cache(revalidate 1800초=30분, tag "live-channel-videos")로 캐싱 →
//     방문자 수와 무관하게 채널당 videos.list 는 30분에 최대 1회.
//   - API 라우트(/api/live-channels/videos)와 채널 SEO 페이지(/channel/[id])가 "같은 캐시"를
//     공유하도록 여기서 한 곳에 두었다(중복 호출/추가 비용 방지).
//
// ⚠️ getChannelLiveVideos 가 내부에서 YOUTUBE_API_KEY(videos.list) 를 사용(서버 전용).
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getChannelLiveVideos } from "@/lib/liveChannelUtils";

// 채널별 라이브 영상 수집 (캐시 대상)
async function computeByChannel() {
  const byChannel = {};
  try {
    const channels = await getLiveChannels();
    if (!Array.isArray(channels) || channels.length === 0) return byChannel;

    // 채널별 병렬 수집 (각자 실패해도 다른 채널에 영향 없음)
    const results = await Promise.all(
      channels.map(async (ch) => {
        try {
          const videos = await getChannelLiveVideos({
            channelId: ch.channel_id,
            handle: ch.handle,
            fallbackIds: Array.isArray(ch.fallback_video_ids)
              ? ch.fallback_video_ids
              : [],
          });
          // 표시용 채널명을 채널 문서의 이름으로 통일(없으면 유튜브 것 유지)
          const named = (Array.isArray(videos) ? videos : []).map((v) => ({
            ...v,
            channelName: ch.channel_name || v.channelName || "",
          }));
          return { id: ch.id, videos: named };
        } catch (error) {
          console.error(
            "[getLiveChannelVideos] 채널 수집 실패:",
            ch && ch.id,
            error
          ); // TODO: 배포 전 제거
          return { id: ch.id, videos: [] };
        }
      })
    );

    for (const r of results) {
      byChannel[r.id] = r.videos;
    }
  } catch (error) {
    console.error("[getLiveChannelVideos] 계산 실패:", error); // TODO: 배포 전 제거
  }
  return byChannel;
}

// 1시간 캐시 (라이브 영상 목록 갱신 주기 = YouTube videos.list 유닛 소모 주기)
// ⚠️ YouTube 무료 할당량(10,000유닛/일) 방어가 핵심 이유:
//   computeByChannel 은 채널 1개당 videos.list 1유닛을 쓴다(현재 방송 채널 수십 개).
//   30분마다 재확인하면 (채널수 × 48회)/일 로 유닛이 빠르게 소진돼, 실제로 할당량이
//   초과되면 운영(production)에서 백업 키가 없어 영상 목록이 통째로 비게 된다(사이트 영상 사라짐).
//   방송 채널은 새 라이브가 수시로 올라와 너무 길게 캐시하면 새 방송이 늦게 뜨므로, 신선도와
//   유닛 절감의 균형점으로 1시간으로 둔다. 하루 재확인 횟수 48회→24회(2배↓)로 유닛을 절감한다.
//   (스트림이 중간에 끊긴 영상은 클라이언트 iframe onError→report-error 로 별도 감지·숨김된다.)
export const getLiveChannelVideosCached = unstable_cache(
  computeByChannel,
  ["live-channel-videos"],
  {
    revalidate: 3600, // 1시간 (기존 30분 → YouTube 유닛 절감, 새 방송 신선도 균형)
    tags: ["live-channel-videos"],
  }
);
