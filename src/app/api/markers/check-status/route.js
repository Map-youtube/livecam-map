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
//       · 정상(현재 라이브/재생 가능) → 상태는 그대로 두고(복원은 "재생 확인" 역할),
//         last_checked_at 만 갱신한다. 확인은 했는데 기록이 안 남으면 관리자 목록의
//         '마지막 확인' 이 비어 있어 "점검이 안 된 것"처럼 보이기 때문.
//   - 이미 auto_disabled 인 마커는 재처리하지 않음(중복 방지) → 그래서 '마지막 확인' 이 갱신되지 않는다.
//     (복원하려면 관리자가 URL 수정 후 "재생 확인" 버튼을 눌러야 한다)
//   - 하나라도 바뀌면 revalidateTag('public-markers') 로 손님 화면 캐시 무효화.
//   - 응답: { ok:true, checked, disabled, stamped }
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

// 정상(라이브) 마커의 last_checked_at 을 다시 기록하기까지의 최소 간격.
// 관리자 페이지가 열려 있으면 이 점검이 10분마다 자동 실행되므로(MarkerList 의 SCAN_COOLDOWN_MS),
// 매번 전 마커에 쓰면 Firestore 쓰기가 폭증한다.
//   예) 활성 300개 × 6회/시간 × 24시간 = 43,200 writes/일 → 무료 한도(20,000/일) 초과
// 1시간에 한 번만 기록하면 300 × 24 = 7,200 writes/일 로 한도 안에 들어온다.
// (재생불가로 "판정이 바뀌는" 마커는 이 제한과 무관하게 즉시 기록된다 — 아래 toDisable)
const STAMP_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1시간

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
    // 각 마커의 기존 last_checked_at(ms)도 함께 들고 온다 → 정상 마커의 시각 갱신 주기 제한에 사용.
    const targets = [];
    for (const doc of docs) {
      const data = doc.data() || {};
      if (data.auto_disabled === true) continue; // 이미 재생불가 → 재처리 안 함
      if (!data.youtube_video_id) continue; // video_id 없으면 확인 불가

      // Firestore Timestamp → ms (없으면 0 = "한 번도 확인 안 됨")
      const prev = data.last_checked_at;
      const prevMs =
        prev && typeof prev.toMillis === "function" ? prev.toMillis() : 0;

      // ⚠️ 각 마커의 고유 ref/videoId/이전 확인시각을 담는다 (반복문 밖 고정값 참조 금지)
      targets.push({
        ref: doc.ref,
        videoId: data.youtube_video_id,
        lastCheckedMs: prevMs,
      });
    }

    // ─── videos.list 로 일괄 상태 조회 (50개당 1유닛) ─────────
    const videoIds = targets.map((t) => t.videoId);
    const statusMap = await getVideosLiveStatus(videoIds);

    let checked = 0;
    const now = Date.now();

    // 비활성화할 대상(toDisable) 과 "정상이라 그대로 둘 대상"(toStamp) 을 모은다.
    //   - toStamp: 확인 결과 정상(현재 라이브)인 마커. 상태는 그대로지만 "언제 확인했는지"는 기록해야
    //     관리자 목록의 '마지막 확인' 이 채워진다.
    //     (예전엔 비활성화되는 마커에만 last_checked_at 을 써서, 정상 라이브 마커는 확인을 하고도
    //      날짜가 비어 있었다 — 마치 점검을 안 한 것처럼 보이던 문제)
    // 쓰기는 아래에서 배치로 한 번에 처리 → 속도 개선
    const toDisable = [];
    const toStamp = [];
    for (const t of targets) {
      const status = statusMap.get(t.videoId);
      // 조회 실패(응답 자체가 없던 배치 등)면 판단 보류(오탐 방지) → 건너뜀
      if (!status) continue;
      checked += 1;

      let reason = null;
      if (status.exists === false) {
        // 삭제/비공개 등
        reason = "video_unavailable";
      } else if (status.embeddable === false) {
        // 퍼가기(임베드) 차단 → 사이트 iframe 에서 재생 불가. 라이브여도 제외한다.
        reason = "embed_blocked";
      } else if (status.streamEnded === true) {
        // 라이브 방송 종료(영상은 남아있으나 재생 불가/라이브 아님)
        reason = "stream_ended";
      } else if (status.liveBroadcastContent !== "live") {
        // 현재 라이브 방송이 아님(일반 영상 또는 예정) → 이 서비스는 라이브 전용이라 제외.
        // (등록은 막지만, 이전에 잘못 등록됐거나 라이브가 내려간 경우를 여기서 정리한다)
        reason = "not_live";
      }

      // ⚠️ 각 항목은 자기 자신의 ref/사유/이전 확인시각으로만 처리한다 (반복문 밖 고정값 참조 금지)
      if (reason) {
        toDisable.push({ ref: t.ref, reason });
      } else if (now - t.lastCheckedMs >= STAMP_MIN_INTERVAL_MS) {
        // 정상(현재 라이브) → 상태는 그대로 두고 확인 시각만 갱신.
        // 단, 최근(1시간 이내)에 이미 기록했다면 건너뛴다 → 불필요한 Firestore 쓰기 방지.
        toStamp.push({ ref: t.ref });
      }
      // 정상이고 최근에 기록도 했다면: 아무것도 쓰지 않음 (검사는 이미 끝났고 결과는 '정상')
    }

    // ─── Firestore 배치 쓰기 (400개씩) ────────────────────────
    // 1) 재생 불가로 판정된 마커: 비활성화 + 사유 + 확인 시각
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

    // 2) 정상(라이브) 마커: 확인 시각만 갱신 (상태 필드는 건드리지 않음)
    //    위 STAMP_MIN_INTERVAL_MS(1시간) 제한 덕분에 10분마다 자동 점검이 돌아도
    //    마커당 하루 최대 24회만 기록된다. YouTube 유닛은 이미 조회한 결과를 재사용 → 추가 비용 없음.
    for (let i = 0; i < toStamp.length; i += 400) {
      const batch = adminDb.batch();
      for (const item of toStamp.slice(i, i + 400)) {
        batch.update(item.ref, {
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

    return Response.json(
      { ok: true, checked, disabled, stamped: toStamp.length },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers/check-status][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "상태 확인 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
