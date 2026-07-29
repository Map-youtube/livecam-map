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

    // 대상 문서 조회.
    //   먼저 수동 마커(markers)에서 찾고, 없으면 자동 마커(auto_markers)에서 찾는다.
    //   (자동 마커는 문서 id = youtube_video_id. 클라이언트는 같은 신고 URL 을 쓴다.)
    let docRef = adminDb.collection(COLLECTION).doc(id);
    let snap = await docRef.get();
    let isAuto = false;
    if (!snap.exists) {
      docRef = adminDb.collection("auto_markers").doc(id);
      snap = await docRef.get();
      isAuto = true;
    }
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

    // 자동 비활성화 처리 (auto_disabled:true 라 다음 스캔에서도 다시 켜지지 않는다)
    //
    // ⚠️ updated_at 을 반드시 함께 갱신한다(2026-07-30 버그 수정). 손님 화면이 실제로 읽는
    //    청크 인덱스(marker_index)는 "updated_at 이 바뀐 문서만" 변경된 것으로 감지해
    //    반영한다(markerIndex.js syncMarkerIndex 의 where("updated_at", ">", since) 참고).
    //    이 필드를 안 쓰면 여기서 auto_disabled/is_active 를 아무리 바꿔도 인덱스가 절대
    //    감지하지 못해, 손님 화면엔 재생불가로 신고된 영상이 "영구히" 재생 가능한 것처럼
    //    계속 보인다(관리자 목록은 Firestore 를 직접 읽어 정상으로 보이므로 눈치채기 어려웠다).
    //    실제 증상: 방문자가 눌러 신고 → 그 세션에선 사라짐(클라이언트 상태) → 재접속/다른
    //    방문자에게는 그대로 다시 뜸 → 또 눌러야 사라짐, 무한 반복.
    await docRef.update({
      auto_disabled: true,
      is_active: false,
      disabled_reason: reason,
      last_checked_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // 공개 캐시 즉시 무효화 → 손님 화면에서 바로 제외
    //   자동 마커면 auto-markers 태그도 함께 무효화한다.
    try {
      revalidateTag("public-markers");
      if (isAuto) revalidateTag("auto-markers");
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
