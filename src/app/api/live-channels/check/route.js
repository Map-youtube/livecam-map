// ─────────────────────────────────────────────────────────────
// 채널 링크 즉시확인 API — /api/live-channels/check?channel_input=...
//
// 등록 폼에서 채널 링크를 입력하는 즉시(디바운스) 호출해:
//   - 등록 가능한 채널인지(해석 성공) + 표시 채널명
//   - 이미 등록된 채널(중복)인지
// 를 알려준다. (마커 등록의 check-duplicate 와 같은 UX)
//
// 서버 스크래핑(resolveYoutubeChannel)을 유발하므로 관리자 전용으로 둔다.
// 응답: { ok:true, status:"available"|"duplicate"|"invalid", channel_name, handle, existing?, error? }
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";
import { resolveYoutubeChannel } from "@/lib/liveChannelUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "live_channels";

export async function GET(request) {
  try {
    // 관리자 검증 (스크래핑 남용 방지)
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      const status = authResult.reason === "not_admin" ? 403 : 401;
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status }
      );
    }

    const { searchParams } = new URL(request.url);
    const input = (searchParams.get("channel_input") || "").trim();
    if (!input) {
      return Response.json({ ok: true, status: "idle" }, { status: 200 });
    }

    // 채널 해석 (URL/@핸들/UC-id/영상링크 → channelId·이름)
    const resolved = await resolveYoutubeChannel(input);
    if (!resolved.ok) {
      return Response.json(
        { ok: true, status: "invalid", error: resolved.error || "채널을 찾을 수 없습니다" },
        { status: 200 }
      );
    }

    // 중복 확인 (같은 channel_id 가 이미 있는지)
    let existing = null;
    try {
      const dup = await adminDb
        .collection(COLLECTION)
        .where("channel_id", "==", resolved.channelId)
        .limit(1)
        .get();
      if (!dup.empty) {
        const d = dup.docs[0];
        const data = d.data() || {};
        existing = {
          id: d.id,
          channel_name: data.channel_name || "",
          major_category: data.major_category || "",
          minor_category: data.minor_category || "",
        };
      }
    } catch (dupErr) {
      console.error("[api/live-channels/check] 중복확인 실패:", dupErr); // TODO: 배포 전 제거
    }

    if (existing) {
      return Response.json(
        {
          ok: true,
          status: "duplicate",
          channel_name: resolved.channelName || resolved.handle || resolved.channelId,
          handle: resolved.handle || "",
          existing,
        },
        { status: 200 }
      );
    }

    return Response.json(
      {
        ok: true,
        status: "available",
        channel_name: resolved.channelName || resolved.handle || resolved.channelId,
        handle: resolved.handle || "",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/live-channels/check][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, status: "error", error: "확인 중 오류가 발생했습니다" }, { status: 200 });
  }
}
