// ─────────────────────────────────────────────────────────────
// 마커 재생 확인/복원 API (관리자 전용)
//
// POST /api/markers/[id]/verify
//   - verifyAdminRequest 로 보호 (관리자만 호출).
//   - 해당 마커의 youtube_video_id 로 getYoutubeInfo 를 1회 호출해 정상 조회되는지 확인.
//     · 정상: auto_disabled:false, is_active:true, disabled_reason:null,
//       last_checked_at:서버타임스탬프 로 갱신 + 최신 제목/썸네일 업데이트.
//       revalidateTag('public-markers') 로 손님 화면에 즉시 반영.
//     · 실패(영상 없음/접근 불가): 상태 그대로 두고
//       { ok:false, error:"아직 재생할 수 없는 영상입니다" } 반환 (강제 복원 안 함).
//
// ⚠️ 이 API 를 눌렀을 때만 videos.list 1회 호출(재검증 비용). 그 외에는 유튜브 API 호출 없음.
// firebase-admin(Node 전용) → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { getYoutubeInfo } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "markers";

export async function POST(request, context) {
  try {
    // ─── 로그인 관리자 검증 ────────────────────────────────────
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json(
        { ok: false, error: "마커 id가 필요합니다." },
        { status: 400 }
      );
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
    const videoId = data.youtube_video_id;

    // video_id 가 없으면 재생 확인 자체가 불가능 → 복원하지 않음
    if (!videoId) {
      return Response.json(
        { ok: false, error: "아직 재생할 수 없는 영상입니다" },
        { status: 200 }
      );
    }

    // ─── videos.list 1회 호출로 재검증 ────────────────────────
    let ytInfo;
    try {
      ytInfo = await getYoutubeInfo(videoId);
    } catch (ytError) {
      // 영상이 실제로 존재하지 않거나 접근 불가 → 상태 유지, 복원하지 않음
      console.error("[api/markers/[id]/verify] 재검증 실패:", ytError.message); // TODO: 배포 전 제거
      return Response.json(
        { ok: false, error: "아직 재생할 수 없는 영상입니다" },
        { status: 200 }
      );
    }

    // ─── 라이브 방송이 종료된 영상은 복원하지 않는다 ───────────
    // (영상 ID 는 남아있어 조회는 되지만 실제로는 재생 불가/라이브 아님 → 재활성 시 재발 방지)
    if (ytInfo.streamEnded) {
      await docRef.update({
        auto_disabled: true,
        is_active: false,
        disabled_reason: "stream_ended",
        last_checked_at: FieldValue.serverTimestamp(),
      });
      // 손님 화면에서 확실히 제외되도록 캐시 무효화
      try {
        revalidateTag("public-markers");
      } catch (revalidateError) {
        console.error(
          "[api/markers/[id]/verify] 캐시 무효화 실패:",
          revalidateError
        ); // TODO: 배포 전 제거
      }
      return Response.json(
        {
          ok: false,
          error: "라이브 방송이 종료된 영상입니다 (재생 불가)",
        },
        { status: 200 }
      );
    }

    // ─── 정상(현재 라이브/재생 가능) → 복원 + 최신 제목/썸네일 갱신 ─
    await docRef.update({
      auto_disabled: false,
      is_active: true,
      disabled_reason: null,
      last_checked_at: FieldValue.serverTimestamp(),
      youtube_title: ytInfo.title,
      youtube_thumbnail_url: ytInfo.thumbnailUrl,
    });

    // 공개 마커 캐시 즉시 무효화 → 손님 화면에 바로 복원
    try {
      revalidateTag("public-markers");
    } catch (revalidateError) {
      console.error(
        "[api/markers/[id]/verify] 캐시 무효화 실패:",
        revalidateError
      ); // TODO: 배포 전 제거
    }

    return Response.json(
      {
        ok: true,
        id,
        message: "재생이 확인되어 다시 노출됩니다.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers/[id]/verify][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "재생 확인 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
