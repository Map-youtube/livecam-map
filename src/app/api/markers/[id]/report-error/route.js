// ─────────────────────────────────────────────────────────────
// 마커 영상 재생불가 신고 API (공개 — 로그인 불필요)
//
// POST /api/markers/[id]/report-error
//   - 손님 브라우저가 "이 마커 영상이 재생 안 됨"을 신고하는 용도.
//   - ⚠️ 일반 방문자가 호출하므로 인증(verifyAdminRequest)을 절대 넣지 않는다.
//   - body: { reason: "embed_blocked" | "video_error" | "unknown" } (없으면 "unknown")
//
// 동작:
//   - 이미 auto_disabled === true 이면 아무것도 하지 않고 { ok:true, already:true } 반환
//     (중복 신고 무시 → 불필요한 쓰기 방지).
//   - 아니면 auto_disabled:true, is_active:false, disabled_reason:reason,
//     last_checked_at:서버타임스탬프 로 갱신 → 손님 화면에서 제외되도록 함.
//   - 공개 마커 캐시(tag: 'public-markers')를 revalidateTag 로 즉시 무효화(5분 대기 없이 반영).
//
// ⚠️ 유튜브 API 를 호출하지 않는다(플레이어 에러 신호를 기록만 함) → 완전 무료.
// firebase-admin(Node 전용) → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "markers";
// 허용되는 신고 사유 (그 외 값은 unknown 으로 정규화)
const ALLOWED_REASONS = ["embed_blocked", "video_error", "unknown"];

export async function POST(request, context) {
  try {
    // Next.js 16 App Router: 동적 세그먼트 params 는 비동기이므로 await 한다.
    const { id } = await context.params;
    if (!id) {
      return Response.json(
        { ok: false, error: "마커 id가 필요합니다." },
        { status: 400 }
      );
    }

    // body 파싱 (없어도 unknown 으로 진행)
    let reason = "unknown";
    try {
      const body = await request.json();
      if (body && typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch (parseError) {
      // body 가 없거나 JSON 이 아니어도 신고는 unknown 으로 처리
      reason = "unknown";
    }
    // 허용되지 않은 값은 unknown 으로 정규화
    if (!ALLOWED_REASONS.includes(reason)) {
      reason = "unknown";
    }

    // 대상 문서 조회
    const docRef = adminDb.collection(COLLECTION).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "해당 id의 마커를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const data = snap.data() || {};

    // 이미 재생불가로 처리된 경우 → 중복 신고 무시 (쓰기 안 함)
    if (data.auto_disabled === true) {
      return Response.json({ ok: true, already: true }, { status: 200 });
    }

    // 자동 비활성화 처리
    await docRef.update({
      auto_disabled: true,
      is_active: false,
      disabled_reason: reason,
      last_checked_at: FieldValue.serverTimestamp(),
    });

    // 공개 마커 캐시 즉시 무효화 → 손님 화면에서 바로 제외
    try {
      revalidateTag("public-markers");
    } catch (revalidateError) {
      console.error(
        "[api/markers/[id]/report-error] 캐시 무효화 실패:",
        revalidateError
      ); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, already: false }, { status: 200 });
  } catch (error) {
    console.error("[api/markers/[id]/report-error][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "신고 처리 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
