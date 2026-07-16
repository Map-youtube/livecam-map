// ─────────────────────────────────────────────────────────────
// 자동 마커 재생 상태 전수 점검 API — /api/auto-channels/verify-playback
//
// POST (관리자 전용)
//   - 현재 "사이트에 게시 중"인 자동 마커(auto_markers) 전체를 YouTube 실제 상태로 재검증한다:
//       is_live === true && is_active !== false && auto_disabled !== true 인 것만 대상.
//   - videos.list(getVideosLiveStatus, 50개당 1유닛)로 한 번에 조회한 뒤,
//     재생 불가로 판정된 영상을 is_live:false 로 숨긴다(문서는 보존 → 다시 정상 라이브가 되면
//     스캔이 자동 복원). 판정 기준:
//       · 응답에 없음(삭제/비공개)        → video_deleted
//       · status.embeddable === false     → embed_blocked (퍼가기 차단)
//       · liveStreamingDetails.actualEndTime 있음 → stream_ended (라이브 종료)
//       · liveBroadcastContent !== "live" → not_live (현재 라이브 아님)
//   - 관리자가 "지금 스캔"과 별개로, 언제든 버튼 한 번으로 재생불가 영상을 찾아 정리하고
//     "몇 개를 숨겼는지"를 즉시 확인하기 위한 용도(우연에 의존하지 않는 확정 점검).
//   - 응답: { ok, checked, hidden, byReason, videosListUnits }
//
// ⚠️ 스캔과 달리 새 영상 감지·AI 호출은 하지 않는다(이미 게시된 것만 재검증) → Gemini 비용 0.
// ⚠️ videos.list·Firestore 서버 전용 → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { getVideosLiveStatus } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MARKERS = "auto_markers";

export async function POST(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    // 현재 게시 중인 자동 마커만 대상 (Firestore where + JS 필터)
    const snap = await adminDb
      .collection(MARKERS)
      .where("is_live", "==", true)
      .get();
    const targets = snap.docs
      .map((d) => ({ ref: d.ref, id: d.id, data: d.data() || {} }))
      .filter(
        (t) => t.data.is_active !== false && t.data.auto_disabled !== true
      );

    const videoIds = targets
      .map((t) => t.data.youtube_video_id || t.id)
      .filter(Boolean);

    const report = {
      ok: true,
      checked: 0,
      hidden: 0,
      byReason: { embed_blocked: 0, stream_ended: 0, not_live: 0, video_deleted: 0 },
      videosListUnits: Math.ceil(videoIds.length / 50),
    };

    if (videoIds.length === 0) return Response.json(report, { status: 200 });

    // videos.list 로 일괄 상태 조회 (임베드 가능 여부 포함)
    const statusMap = await getVideosLiveStatus(videoIds);

    const toHide = []; // { ref, reason }
    for (const t of targets) {
      const vid = t.data.youtube_video_id || t.id;
      const status = statusMap.get(vid);
      // 조회 실패(응답 자체가 없던 배치 등)면 판단 보류(오탐 방지) → 건너뜀
      if (!status) continue;
      report.checked += 1;

      let reason = null;
      if (status.exists === false) reason = "video_deleted";
      else if (status.embeddable === false) reason = "embed_blocked";
      else if (status.streamEnded === true) reason = "stream_ended";
      else if (status.liveBroadcastContent !== "live") reason = "not_live";

      if (reason) toHide.push({ ref: t.ref, reason });
    }

    // 재생 불가로 판정된 마커: is_live:false 로 숨김 (문서 보존 → 자동 복원 여지)
    for (let i = 0; i < toHide.length; i += 400) {
      const batch = adminDb.batch();
      for (const item of toHide.slice(i, i + 400)) {
        batch.update(item.ref, {
          is_live: false,
          disabled_reason: item.reason,
          last_checked_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        report.byReason[item.reason] = (report.byReason[item.reason] || 0) + 1;
      }
      await batch.commit();
    }
    report.hidden = toHide.length;

    // 공개 캐시 무효화 → 손님 화면에서 즉시 제외
    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels/verify-playback] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json(report, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/verify-playback][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "점검 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
