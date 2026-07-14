// ─────────────────────────────────────────────────────────────
// 자동 라이브 채널의 "현재 라이브 영상" 목록 API — /api/live-channels/videos
//
// GET → { ok, byChannel: { [channelDocId]: [{videoId,title,thumbnailUrl,channelName}] } }
//
//   - 실제 수집/캐싱 로직은 src/lib/getLiveChannelVideos.js 로 옮겨, 채널 SEO 페이지
//     (/channel/[id])와 "같은 30분 캐시"를 공유한다(중복 videos.list 호출/추가 비용 방지).
//   - 실패해도 500 대신 빈 결과 반환.
//
// Node.js 런타임(외부 fetch + 서버 키).
// ─────────────────────────────────────────────────────────────

import { getLiveChannelVideosCached } from "@/lib/getLiveChannelVideos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const byChannel = await getLiveChannelVideosCached();
    return Response.json({ ok: true, byChannel }, { status: 200 });
  } catch (error) {
    console.error("[api/live-channels/videos][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, byChannel: {} }, { status: 200 });
  }
}
