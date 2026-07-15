// ─────────────────────────────────────────────────────────────
// 자동 채널 단건 수정/삭제 API — /api/auto-channels/[id]
//
// - PATCH  : 채널명/활성여부 수정. channel_input 이 오면 채널 재해석(channel_id/handle/name 갱신).
// - DELETE : 채널 삭제 + 그 채널이 만든 auto_markers 전부 삭제(cascade).
//
// 존재하지 않는 id → 404. 관리자 전용. Node.js 런타임.
// ⚠️ 방송 채널과 달리 lat/lng·카테고리 필드가 없다(영상마다 AI 가 채우므로 채널엔 없음).
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { resolveYoutubeChannel } from "@/lib/liveChannelUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "auto_channels";
const MARKERS = "auto_markers";

// ─── PATCH: 수정 ─────────────────────────────────────────────
export async function PATCH(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "채널을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(
        { ok: false, error: "요청 본문이 올바르지 않습니다" },
        { status: 400 }
      );
    }

    const update = { updated_at: FieldValue.serverTimestamp() };
    if (typeof body.channel_name === "string")
      update.channel_name = body.channel_name.trim();
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;

    // 채널 자체 교체
    if (body.channel_input && String(body.channel_input).trim()) {
      const resolved = await resolveYoutubeChannel(body.channel_input);
      if (!resolved.ok) {
        return Response.json(
          { ok: false, error: resolved.error || "채널 해석 실패" },
          { status: 400 }
        );
      }
      try {
        const dup = await adminDb
          .collection(COLLECTION)
          .where("channel_id", "==", resolved.channelId)
          .get();
        const conflict = dup.docs.find((d) => d.id !== id);
        if (conflict) {
          return Response.json(
            { ok: false, error: "이미 등록된 채널입니다" },
            { status: 409 }
          );
        }
      } catch (dupErr) {
        console.error("[api/auto-channels/[id]][PATCH] 중복확인 실패:", dupErr); // TODO: 배포 전 제거
      }
      update.channel_id = resolved.channelId;
      update.handle = resolved.handle || "";
      if (update.channel_name === undefined) {
        update.channel_name =
          resolved.channelName || resolved.handle || resolved.channelId;
      }
    }

    await ref.update(update);

    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels/[id]][PATCH] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/[id]][PATCH] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// ─── DELETE: 삭제 (채널 + 그 채널의 auto_markers cascade) ──────
export async function DELETE(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "채널을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 이 채널이 만든 자동 마커 전부 삭제 (배치)
    let deletedMarkers = 0;
    try {
      const markerSnap = await adminDb
        .collection(MARKERS)
        .where("source_channel_id", "==", id)
        .get();
      // Firestore 배치는 500개 제한 → 나눠 커밋
      const docs = markerSnap.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const batch = adminDb.batch();
        for (const d of docs.slice(i, i + 450)) batch.delete(d.ref);
        await batch.commit();
      }
      deletedMarkers = docs.length;
    } catch (mErr) {
      console.error("[api/auto-channels/[id]][DELETE] 마커 삭제 실패:", mErr); // TODO: 배포 전 제거
    }

    await ref.delete();

    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels/[id]][DELETE] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id, deletedMarkers }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/[id]][DELETE] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
