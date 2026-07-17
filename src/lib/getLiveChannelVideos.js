// ─────────────────────────────────────────────────────────────
// getLiveChannelVideos — 자동 라이브 채널의 "현재 라이브 영상" 목록 (서버 전용, 1시간 스냅샷)
//
// 채널별 라이브 영상을 { [channelDocId]: [{videoId,title,thumbnailUrl,channelName}] } 로 수집.
//   - Firestore 시간제 스냅샷(live_snapshots/broadcast, 1시간)으로 캐싱 → 방문자 수와 무관하게
//     전체 재계산(전역 50개 배칭 videos.list)은 1시간에 딱 1회. (getTimedSnapshot 주석 참고)
//   - API 라우트(/api/live-channels/videos)와 채널 SEO 페이지(/channel/[id])가 "같은 스냅샷"을
//     공유하도록 여기서 한 곳에 두었다(중복 호출/추가 비용 방지).
//
// ⚠️ getLiveVideos 가 내부에서 YOUTUBE_API_KEY(videos.list) 를 사용(서버 전용).
// ─────────────────────────────────────────────────────────────

import { getLiveChannels } from "@/lib/getLiveChannels";
import { getChannelCandidateVideoIds } from "@/lib/liveChannelUtils";
import { getLiveVideos } from "@/lib/youtubeUtils";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

// 채널별 라이브 영상 수집 (캐시 대상) — "전역 50개 배칭"으로 videos.list 유닛 최소화.
//
// ⚠️ 유닛 절감 방식(지역 자동 스캔과 동일):
//   과거엔 채널마다 videos.list 를 따로 불렀다(채널 1개 = 최소 1유닛 → 52채널 = 52유닛/회).
//   videos.list 는 한 번에 50개 ID 를 1유닛으로 확인할 수 있으므로, 모든 채널의 후보 영상ID 를
//   한데 모아 50개씩 묶어 부르면 유닛 = ceil(전체 후보/50) 로 줄어든다(채널 수와 무관).
//   → 확인하는 후보 ID 집합은 기존과 100% 동일하므로 "뜨는 영상 결과도 동일". 부르는 방식만 묶음.
//   1단계(후보 수집: RSS/streams 스크래핑)는 YouTube Data API 가 아니라 무료라 유닛 0.
async function computeByChannel() {
  const byChannel = {};
  try {
    const channels = await getLiveChannels();
    if (!Array.isArray(channels) || channels.length === 0) return byChannel;

    // 1) 채널별 후보 videoId 수집(무료 스크래핑, 유닛 0). 영상ID → 채널 매핑 구성.
    //    각 채널 슬롯을 미리 [] 로 초기화(라이브 없으면 빈 배열 유지 = 기존과 동일).
    const idToChannel = new Map(); // videoId → channel doc
    await Promise.all(
      channels.map(async (ch) => {
        byChannel[ch.id] = [];
        try {
          const ids = await getChannelCandidateVideoIds({
            channelId: ch.channel_id,
            handle: ch.handle,
            fallbackIds: Array.isArray(ch.fallback_video_ids)
              ? ch.fallback_video_ids
              : [],
          });
          for (const id of ids) {
            // 같은 영상ID 가 여러 채널 후보에 겹치면 먼저 등록된 채널에 귀속(사실상 없음).
            if (id && !idToChannel.has(id)) idToChannel.set(id, ch);
          }
        } catch (error) {
          console.error(
            "[getLiveChannelVideos] 후보 수집 실패:",
            ch && ch.id,
            error
          ); // TODO: 배포 전 제거
        }
      })
    );

    const allIds = [...idToChannel.keys()];
    if (allIds.length === 0) return byChannel;

    // 2) 전역 50개 배칭으로 "현재 라이브 + 임베드 가능"만 한 번에 검증
    //    (getLiveVideos 가 내부에서 50개씩 나눠 호출 → 유닛 = ceil(allIds/50))
    const liveVideos = await getLiveVideos(allIds); // [{videoId,title,thumbnailUrl,channelName}]

    // 3) 라이브 영상을 각 채널로 분배 + 표시용 채널명을 채널 문서 이름으로 통일.
    for (const v of liveVideos) {
      const ch = idToChannel.get(v.videoId);
      if (!ch) continue;
      if (!byChannel[ch.id]) byChannel[ch.id] = [];
      byChannel[ch.id].push({
        ...v,
        channelName: ch.channel_name || v.channelName || "",
      });
    }
  } catch (error) {
    console.error("[getLiveChannelVideos] 계산 실패:", error); // TODO: 배포 전 제거
  }
  return byChannel;
}

// ─── 방송 채널 라이브 목록 (Firestore 시간제 스냅샷, 1시간) ─────
// ⚠️ YouTube 무료 할당량(10,000유닛/일) 방어가 핵심 — 두 겹으로 막는다:
//   (1) 전역 50개 배칭: computeByChannel 이 모든 채널 후보를 묶어 videos.list 를 호출
//       → 유닛 = ceil(전체 후보/50) (채널 수와 무관, 결과는 기존과 동일).
//   (2) Firestore 시간제 스냅샷: 과거 unstable_cache 는 Vercel 서버리스에서 인스턴스/리전별로
//       캐시가 분리돼 방문자 수에 비례해 재계산이 폭증했다(하루 20,000+ 호출로 할당량 2배 초과 사고).
//       → live_snapshots/broadcast 문서로 "전역 단일 캐시"를 만들어 트래픽과 무관하게 1시간 1회만
//         재계산하고, 방문자 요청은 Firestore 에서 읽어 내려준다(방문자당 YouTube 0).
//   방송은 새 라이브가 수시로 올라오므로 신선도·유닛 절감 균형점으로 1시간.
//   (스트림이 중간에 끊긴 영상은 클라이언트 iframe onError→report-error 로 별도 감지·숨김된다.)
export async function getLiveChannelVideosCached() {
  return getTimedSnapshot({
    docId: "broadcast",
    refreshMs: 60 * 60 * 1000, // 1시간
    compute: computeByChannel, // 실패해도 {} 반환(throw 안 함)
  });
}
