// ─────────────────────────────────────────────────────────────
// 마커 상태 확인 API — videos.list(배치) 기반 (관리자 전용)
//
// POST /api/markers/check-status
//   - verifyAdminRequest 로 보호.
//   - body: { markerIds?: string[] }
//       · markerIds 가 있으면 그 마커들만 확인.
//       · 없으면 is_active !== false 인 전체 마커를 확인.
//   - 각 대상의 youtube_video_id 를 videos.list 로 "한 번에 50개씩" 조회(getVideosLiveStatus):
//       · 응답에 없음(삭제/비공개) → disabled_reason:"video_unavailable"
//       · liveStreamingDetails.actualEndTime 있음(라이브 종료) → disabled_reason:"stream_ended"
//         (영상 ID 는 남아있어 oEmbed 로는 못 잡지만 실제로는 재생 불가/라이브 아님)
//       · 정상(현재 라이브/재생 가능) → 그대로 둠(복원은 "재생 확인" 역할).
//   - 이미 auto_disabled 인 마커는 재처리하지 않음(중복 방지).
//   - 하나라도 바뀌면 revalidateTag('public-markers') 로 손님 화면 캐시 무효화.
//   - 응답: { ok:true, checked, disabled }
//
// ⚠️ 비용: videos.list 는 id 50개당 1유닛. 예) 활성 246개 → 약 5유닛(매우 저렴).
//    "라이브 방송 종료"는 oEmbed(무료)로는 감지 불가라 videos.list 가 필요하다.
// firebase-admin(Node 전용) → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { getVideosLiveStatus } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "markers";

export async function POST(request) {
  try {
    // ─── 로그인 관리자 검증 ────────────────────────────────────
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
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

    // ─── 검사 대상 추리기 (이미 재생불가/video_id 없음 제외) ───
    const targets = [];
    for (const doc of docs) {
      const data = doc.data() || {};
      if (data.auto_disabled === true) continue; // 이미 재생불가 → 재처리 안 함
      if (!data.youtube_video_id) continue; // video_id 없으면 확인 불가
      targets.push({ ref: doc.ref, videoId: data.youtube_video_id });
    }

    // ─── videos.list 로 일괄 상태 조회 (50개당 1유닛) ─────────
    const videoIds = targets.map((t) => t.videoId);
    const statusMap = await getVideosLiveStatus(videoIds);

    let checked = 0;

    // 비활성화할 대상만 모은다 (쓰기는 아래에서 배치로 한 번에 처리 → 속도 개선)
    const toDisable = [];
    for (const t of targets) {
      const status = statusMap.get(t.videoId);
      // 조회 실패(응답 자체가 없던 배치 등)면 판단 보류(오탐 방지) → 건너뜀
      if (!status) continue;
      checked += 1;

      let reason = null;
      if (status.exists === false) {
        // 삭제/비공개 등
        reason = "video_unavailable";
      } else if (status.streamEnded === true) {
        // 라이브 방송 종료(영상은 남아있으나 재생 불가/라이브 아님)
        reason = "stream_ended";
      } else if (status.liveBroadcastContent !== "live") {
        // 현재 라이브 방송이 아님(일반 영상 또는 예정) → 이 서비스는 라이브 전용이라 제외.
        // (등록은 막지만, 이전에 잘못 등록됐거나 라이브가 내려간 경우를 여기서 정리한다)
        reason = "not_live";
      }

      if (reason) toDisable.push({ ref: t.ref, reason });
      // 정상(현재 라이브/재생 가능) → 그대로 둠 (복원하지 않음)
    }

    // ─── Firestore 배치 쓰기 (400개씩) ────────────────────────
    for (let i = 0; i < toDisable.length; i += 400) {
      const batch = adminDb.batch();
      for (const item of toDisable.slice(i, i + 400)) {
        batch.update(item.ref, {
          auto_disabled: true,
          is_active: false,
          disabled_reason: item.reason,
          last_checked_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    const disabled = toDisable.length;

    // 점검 후에는 항상 공개 마커 캐시를 무효화한다.
    // (이번에 바뀐 게 없어도, 이전에 다른 경로로 비활성화된 마커가 손님 화면 캐시에
    //  남아있을 수 있으므로 관리자 점검 시점에 손님 화면을 최신 상태로 맞춘다.)
    try {
      revalidateTag("public-markers");
    } catch (revalidateError) {
      console.error(
        "[api/markers/check-status] 캐시 무효화 실패:",
        revalidateError
      ); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, checked, disabled }, { status: 200 });
  } catch (error) {
    console.error("[api/markers/check-status][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "상태 확인 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
