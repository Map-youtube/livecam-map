// ─────────────────────────────────────────────────────────────
// 자동 라이브 채널의 "현재 라이브 영상" 목록 API — /api/live-channels/videos
//
// GET → { ok, byChannel: { [channelDocId]: [{videoId,title,thumbnailUrl,channelName}] } }
//
//   - 활성 채널(getLiveChannels)마다 getChannelLiveVideos 로 현재 라이브 영상을 수집.
//   - unstable_cache 로 30분(1800초) 캐싱 → 방문자 수와 무관하게 채널당 videos.list 는
//     30분에 최대 1회. (채널 N개면 30분당 최대 N유닛 = 하루 최대 48×N 유닛)
//   - 실패해도 500 대신 빈 결과 반환.
//
// Node.js 런타임(외부 fetch + 서버 키).
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getChannelLiveVideos } from "@/lib/liveChannelUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
            "[api/live-channels/videos] 채널 수집 실패:",
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
    console.error("[api/live-channels/videos] 계산 실패:", error); // TODO: 배포 전 제거
  }
  return byChannel;
}

// 30분 캐시 (라이브 영상 목록 갱신 주기 = YouTube videos.list 유닛 소모 주기)
const getByChannelCached = unstable_cache(computeByChannel, ["live-channel-videos"], {
  revalidate: 1800,
  tags: ["live-channel-videos"],
});

export async function GET() {
  try {
    const byChannel = await getByChannelCached();
    return Response.json({ ok: true, byChannel }, { status: 200 });
  } catch (error) {
    console.error("[api/live-channels/videos][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, byChannel: {} }, { status: 200 });
  }
}
