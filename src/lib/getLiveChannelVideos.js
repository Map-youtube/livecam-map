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

// 30분 캐시 (라이브 영상 목록 갱신 주기 = YouTube videos.list 유닛 소모 주기)
export const getLiveChannelVideosCached = unstable_cache(
  computeByChannel,
  ["live-channel-videos"],
  {
    revalidate: 1800,
    tags: ["live-channel-videos"],
  }
);
