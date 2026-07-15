// ─────────────────────────────────────────────────────────────
// 기존 마커에서 채널 일괄 등록 API — /api/auto-channels/import-from-markers
//
// (item 13) 기존 markers 컬렉션에서 youtube_channel_id 가 확인되는 마커들을 모아
// 채널 단위로 중복 없이 auto_channels 에 등록한다.
//   - 이미 등록된 채널(같은 channel_id)은 건너뛴다.
//   - channel_id 가 없는(레거시) 마커는 건너뛴다(scanning 없이 안전하게).
//   - 등록만 하고 스캔은 하지 않는다(대량 AI 호출 방지). 이후 크론/"지금 스캔"이 채운다.
//
// 관리자 전용. Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = "auto_channels";
const MARKERS = "markers";

export async function POST(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      const status = authResult.reason === "not_admin" ? 403 : 401;
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status }
      );
    }

    // 1) 기존 auto_channels 의 channel_id 집합(중복 방지)
    const existingIds = new Set();
    try {
      const chSnap = await adminDb.collection(CHANNELS).get();
      for (const d of chSnap.docs) {
        const cid = d.data() && d.data().channel_id;
        if (cid) existingIds.add(cid);
      }
    } catch (e) {
      console.error("[import-from-markers] 기존 채널 조회 실패:", e); // TODO: 배포 전 제거
    }

    // 2) markers 에서 channel_id 별로 대표 채널명 수집
    const byChannel = new Map(); // channel_id → channel_name
    let noChannelId = 0;
    try {
      const mSnap = await adminDb.collection(MARKERS).get();
      for (const d of mSnap.docs) {
        const data = d.data() || {};
        const cid = String(data.youtube_channel_id || "").trim();
        if (!cid) {
          noChannelId += 1;
          continue;
        }
        if (!byChannel.has(cid)) {
          byChannel.set(cid, String(data.youtube_channel_name || "").trim());
        }
      }
    } catch (e) {
      console.error("[import-from-markers] 마커 조회 실패:", e); // TODO: 배포 전 제거
      return Response.json(
        { ok: false, error: "마커 조회에 실패했습니다" },
        { status: 500 }
      );
    }

    // 3) 신규 채널만 등록 (배치)
    const now = FieldValue.serverTimestamp();
    let created = 0;
    let skippedExisting = 0;
    const toCreate = [];
    for (const [cid, name] of byChannel.entries()) {
      if (existingIds.has(cid)) {
        skippedExisting += 1;
        continue;
      }
      toCreate.push({ cid, name });
    }

    for (let i = 0; i < toCreate.length; i += 450) {
      const batch = adminDb.batch();
      for (const { cid, name } of toCreate.slice(i, i + 450)) {
        const ref = adminDb.collection(CHANNELS).doc();
        batch.set(ref, {
          channel_id: cid,
          handle: "",
          channel_name: name || cid,
          is_active: true,
          source: "imported",
          last_seen_video_at: null,
          created_at: now,
          updated_at: now,
        });
        created += 1;
      }
      await batch.commit();
    }

    try {
      revalidateTag("auto-markers");
    } catch (revalErr) {
      console.error("[import-from-markers] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json(
      {
        ok: true,
        created,
        skippedExisting,
        skippedNoChannelId: noChannelId,
        message: `${created}개 채널을 새로 등록했습니다. "지금 스캔"을 누르면 영상이 채워집니다.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/auto-channels/import-from-markers][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
