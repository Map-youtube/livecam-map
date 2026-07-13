// ─────────────────────────────────────────────────────────────
// 자동 라이브 채널 단건 수정/삭제 API — /api/live-channels/[id]
//
// - PATCH  : 전달된 필드만 수정 (major/minor 분류, 채널명, lat/lng, location, is_active).
//            channel_input 이 오면 채널을 다시 해석해 channel_id/handle/channel_name 갱신.
// - DELETE : 문서 삭제.
//
// 존재하지 않는 id → 404. 관리자 전용. Node.js 런타임.
// ⚠️ channel_type:"iss"(ISS 특수 채널)는 삭제/타입변경을 막아 실수로 ISS 를 없애지 않게 한다.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { resolveYoutubeChannel } from "@/lib/liveChannelUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "live_channels";

// ─── PATCH: 수정 ─────────────────────────────────────────────
export async function PATCH(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json({ ok: false, error: authResult.error || "로그인이 필요합니다" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json({ ok: false, error: "채널을 찾을 수 없습니다" }, { status: 404 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json({ ok: false, error: "요청 본문이 올바르지 않습니다" }, { status: 400 });
    }

    const update = { updated_at: FieldValue.serverTimestamp() };

    // 분류/표시명/위치/활성 여부 (전달된 것만)
    if (typeof body.major_category === "string") update.major_category = body.major_category.trim();
    if (typeof body.minor_category === "string") update.minor_category = body.minor_category.trim();
    if (typeof body.channel_name === "string") update.channel_name = body.channel_name.trim();
    if (typeof body.location === "string") update.location = body.location.trim();
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;

    if (body.lat !== undefined) {
      const n = Number(body.lat);
      if (!Number.isNaN(n)) update.lat = n;
    }
    if (body.lng !== undefined) {
      const n = Number(body.lng);
      if (!Number.isNaN(n)) update.lng = n;
    }

    // 채널 자체를 바꾸는 경우: 다시 해석
    if (body.channel_input && String(body.channel_input).trim()) {
      const resolved = await resolveYoutubeChannel(body.channel_input);
      if (!resolved.ok) {
        return Response.json({ ok: false, error: resolved.error || "채널 해석 실패" }, { status: 400 });
      }
      update.channel_id = resolved.channelId;
      update.handle = resolved.handle || "";
      // 이름을 명시적으로 안 바꿨으면 해석된 이름으로 갱신
      if (update.channel_name === undefined) {
        update.channel_name = resolved.channelName || resolved.handle || resolved.channelId;
      }
    }

    await ref.update(update);

    try {
      revalidateTag("live-channels");
    } catch (revalErr) {
      console.error("[api/live-channels/[id]][PATCH] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("[api/live-channels/[id]][PATCH] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: false, error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

// ─── DELETE: 삭제 ────────────────────────────────────────────
export async function DELETE(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json({ ok: false, error: authResult.error || "로그인이 필요합니다" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json({ ok: false, error: "채널을 찾을 수 없습니다" }, { status: 404 });
    }

    // ISS 특수 채널은 삭제 금지 (실수 방지)
    const data = snap.data() || {};
    if (data.channel_type === "iss") {
      return Response.json(
        { ok: false, error: "ISS 채널은 삭제할 수 없습니다(특수 항목)" },
        { status: 400 }
      );
    }

    await ref.delete();

    try {
      revalidateTag("live-channels");
    } catch (revalErr) {
      console.error("[api/live-channels/[id]][DELETE] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("[api/live-channels/[id]][DELETE] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: false, error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
