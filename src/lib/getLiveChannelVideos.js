// ─────────────────────────────────────────────────────────────
// getLiveChannelVideos — 자동 라이브 채널의 "현재 라이브 영상" 목록 (서버 전용, 1시간 스냅샷)
//
// 채널별 라이브 영상을 { [channelDocId]: [{videoId,title,thumbnailUrl,channelName}] } 로 수집.
//   - Firestore 시간제 스냅샷(live_snapshots/broadcast, 1시간)으로 캐싱 → 방문자 수와 무관하게
//     전체 재계산(채널당 videos.list 1유닛)은 1시간에 딱 1회. (getTimedSnapshot 주석 참고)
//   - API 라우트(/api/live-channels/videos)와 채널 SEO 페이지(/channel/[id])가 "같은 스냅샷"을
//     공유하도록 여기서 한 곳에 두었다(중복 호출/추가 비용 방지).
//
// ⚠️ getChannelLiveVideos 가 내부에서 YOUTUBE_API_KEY(videos.list) 를 사용(서버 전용).
// ─────────────────────────────────────────────────────────────

import { getLiveChannels } from "@/lib/getLiveChannels";
import { getChannelLiveVideos } from "@/lib/liveChannelUtils";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

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

// ─── 방송 채널 라이브 목록 (Firestore 시간제 스냅샷, 1시간) ─────
// ⚠️ YouTube 무료 할당량(10,000유닛/일) 방어가 핵심:
//   computeByChannel 은 채널 1개당 videos.list 1유닛을 쓴다(현재 방송 채널 수십 개).
//   과거엔 unstable_cache 를 썼으나, Vercel 서버리스에서 인스턴스/리전별로 캐시가 분리돼
//   방문자가 많아지면 재계산이 방문자 수에 비례해 폭증 → 하루 20,000+ 호출로 할당량 2배 초과 사고.
//   → Firestore 문서 1개(live_snapshots/broadcast)로 "전역 단일 캐시"를 만들어, 트래픽과 무관하게
//     1시간에 딱 1번만 재계산한다. 방문자 요청은 Firestore 에서 읽어 내려줌(방문자당 YouTube 0).
//   방송은 새 라이브가 수시로 올라오므로 신선도·유닛 절감 균형점으로 1시간.
//   (스트림이 중간에 끊긴 영상은 클라이언트 iframe onError→report-error 로 별도 감지·숨김된다.)
export async function getLiveChannelVideosCached() {
  return getTimedSnapshot({
    docId: "broadcast",
    refreshMs: 60 * 60 * 1000, // 1시간
    compute: computeByChannel, // 실패해도 {} 반환(throw 안 함)
  });
}
