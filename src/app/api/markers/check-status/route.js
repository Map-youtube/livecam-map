// ─────────────────────────────────────────────────────────────
// 마커 링크(존재) 확인 API — oEmbed 기반 (관리자 전용)
//
// POST /api/markers/check-status
//   - verifyAdminRequest 로 보호.
//   - body: { markerIds?: string[] }
//       · markerIds 가 있으면 그 마커들만 확인.
//       · 없으면 is_active !== false 인 전체 마커를 확인.
//   - 각 대상의 youtube_video_id 로 checkVideoExists(oEmbed) 호출:
//       · exists:false → (이미 auto_disabled 면 건너뜀) auto_disabled:true, is_active:false,
//         disabled_reason:"video_unavailable", last_checked_at 갱신.
//       · exists:true → 그대로 둠(복원은 하지 않음 — 복원은 "재생 확인"(videos.list) 역할).
//   - 유튜브 서버에 과도한 연속 요청을 피하려 호출 사이 약 200ms 지연(순차 처리).
//   - 하나라도 바뀌면 revalidateTag('public-markers') 로 손님 화면 캐시 무효화.
//   - 응답: { ok:true, checked, disabled }
//
// ⚠️ oEmbed 는 무료 공개 프로토콜 — YOUTUBE_API_KEY / Data API 유닛과 무관.
//    "재생 확인"(videos.list 기반 복원)과 역할이 분리되어 있다(여기서는 복원하지 않음).
// firebase-admin(Node 전용) → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { checkVideoExists } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "markers";
// 연속 요청 사이 지연(ms) — 과도한 연속 호출로 인한 일시 차단 방지 (비용과 무관)
const DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request) {
  try {
    // ─── 로그인 관리자 검증 ────────────────────────────────────
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    // ─── body 파싱 (markerIds 는 선택적) ──────────────────────
    let markerIds = null;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.markerIds)) {
        markerIds = body.markerIds.filter(
          (v) => typeof v === "string" && v.trim()
        );
      }
    } catch (parseError) {
      markerIds = null;
    }

    // ─── 대상 마커 문서 목록 구성 ─────────────────────────────
    let docs = [];
    if (markerIds && markerIds.length > 0) {
      // 개별 지정: 각 id 문서 조회
      for (const id of markerIds) {
        const snap = await adminDb.collection(COLLECTION).doc(id).get();
        if (snap.exists) docs.push(snap);
      }
    } else {
      // 전체: is_active !== false 인 마커
      const snapshot = await adminDb
        .collection(COLLECTION)
        .where("is_active", "!=", false)
        .get();
      docs = snapshot.docs;
    }

    let checked = 0;
    let disabled = 0;
    let anyChanged = false;

    // ─── 순차 처리 (호출 사이 지연) ───────────────────────────
    for (const doc of docs) {
      const data = doc.data() || {};
      const videoId = data.youtube_video_id;

      // video_id 가 없으면 확인 불가 → 건너뜀
      if (!videoId) continue;
      // 이미 재생불가 상태면 재처리하지 않음 (중복 방지)
      if (data.auto_disabled === true) continue;

      // 첫 호출 이후에는 약간의 지연을 둔다
      if (checked > 0) {
        await sleep(DELAY_MS);
      }

      const result = await checkVideoExists(videoId);
      checked += 1;

      // 네트워크 오류 등(error:true)이면 "존재 안 함"으로 단정하지 않고 건너뜀
      // (일시적 실패로 정상 영상을 비활성화하는 오탐 방지)
      if (result.error) continue;

      if (result.exists === false) {
        // 존재하지 않음(삭제/비공개/지역제한) → 비활성화
        await doc.ref.update({
          auto_disabled: true,
          is_active: false,
          disabled_reason: "video_unavailable",
          last_checked_at: FieldValue.serverTimestamp(),
        });
        disabled += 1;
        anyChanged = true;
      }
      // exists:true → 그대로 둠 (복원하지 않음)
    }

    // 하나라도 바뀌었으면 공개 마커 캐시 즉시 무효화
    if (anyChanged) {
      try {
        revalidateTag("public-markers");
      } catch (revalidateError) {
        console.error(
          "[api/markers/check-status] 캐시 무효화 실패:",
          revalidateError
        ); // TODO: 배포 전 제거
      }
    }

    return Response.json({ ok: true, checked, disabled }, { status: 200 });
  } catch (error) {
    console.error("[api/markers/check-status][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "링크 확인 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
