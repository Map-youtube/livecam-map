// ─────────────────────────────────────────────────────────────
// 지역 자동 채널 CRUD API — /api/auto-channels
//
// 방송(live_channels)과 달리, 여기 등록한 채널의 영상은 Gemini AI 가
// 위치·장소명·태그·설명·대륙/국가/도시까지 자동으로 채워 "일반 지역 마커"로 만든다.
//   - GET  : 채널 목록 (관리자 목록/자동완성용, 읽기 공개)
//   - POST : 채널 등록 (관리자). 채널 URL/@핸들/UC-id/영상링크 아무거나 →
//            resolveYoutubeChannel 로 해석 → 중복확인 → 저장 → 즉시 1채널 스캔(첫 영상 표시).
//
// Firestore 컬렉션: "auto_channels"
// firebase-admin(Node 전용) → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { resolveYoutubeChannel } from "@/lib/liveChannelUtils";
import { scanChannels } from "@/lib/autoMarkerScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "auto_channels";

function toPlain(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}
function serialize(id, data) {
  const out = { id };
  for (const [k, v] of Object.entries(data || {})) out[k] = toPlain(v);
  return out;
}

// ─── GET: 채널 목록 ──────────────────────────────────────────
export async function GET() {
  try {
    const snapshot = await adminDb.collection(COLLECTION).get();
    const channels = snapshot.docs.map((d) => serialize(d.id, d.data()));
    channels.sort((a, b) =>
      String(a.channel_name || "").localeCompare(String(b.channel_name || ""), "ko")
    );
    return Response.json({ ok: true, channels }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, channels: [], error: "조회 실패" },
      { status: 200 }
    );
  }
}

// ─── POST: 채널 등록 ─────────────────────────────────────────
//   body: { channel_input, channel_name? }
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

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(
        { ok: false, error: "요청 본문이 올바르지 않습니다" },
        { status: 400 }
      );
    }
    const { channel_input } = body || {};
    if (!channel_input || !String(channel_input).trim()) {
      return Response.json(
        { ok: false, error: "채널(URL/@핸들/채널ID/영상링크)을 입력하세요" },
        { status: 400 }
      );
    }

    // 채널 해석 (URL/@핸들/UC-id/영상링크 → channelId·handle·channelName)
    const resolved = await resolveYoutubeChannel(channel_input);
    if (!resolved.ok) {
      return Response.json(
        { ok: false, error: resolved.error || "채널 해석 실패" },
        { status: 400 }
      );
    }

    // 중복 방지 (같은 channel_id 가 이미 있으면 거부)
    try {
      const dup = await adminDb
        .collection(COLLECTION)
        .where("channel_id", "==", resolved.channelId)
        .limit(1)
        .get();
      if (!dup.empty) {
        return Response.json(
          { ok: false, error: "이미 등록된 채널입니다" },
          { status: 409 }
        );
      }
    } catch (dupErr) {
      console.error("[api/auto-channels][POST] 중복확인 실패:", dupErr); // TODO: 배포 전 제거
    }

    // 저장
    const now = FieldValue.serverTimestamp();
    const data = {
      channel_id: resolved.channelId,
      handle: resolved.handle || "",
      channel_name:
        String(body.channel_name || "").trim() ||
        resolved.channelName ||
        resolved.handle ||
        resolved.channelId,
      is_active: true,
      source: "manual",
      last_seen_video_at: null, // 스캔에서 라이브 감지 시 채워짐(90일 자동삭제 기준)
      created_at: now,
      updated_at: now,
    };
    const docRef = await adminDb.collection(COLLECTION).add(data);

    // 등록 즉시 이 채널만 스캔 → 첫 영상 AI 채우기 + 마커 생성 (관리자 즉시 확인용)
    let scanReport = null;
    try {
      scanReport = await scanChannels([{ id: docRef.id, ...data }]);
    } catch (scanErr) {
      console.error("[api/auto-channels][POST] 초기 스캔 실패:", scanErr); // TODO: 배포 전 제거
    }

    // 공개 캐시 무효화 (채널 목록 + 자동 마커)
    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels][POST] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json(
      {
        ok: true,
        id: docRef.id,
        channel: {
          channel_id: data.channel_id,
          handle: data.handle,
          channel_name: data.channel_name,
        },
        scan: scanReport,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/auto-channels][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
