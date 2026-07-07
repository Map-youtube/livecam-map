// ─────────────────────────────────────────────────────────────
// 마커 중복 확인 API (서버 전용 Route Handler)
//
// GET /api/markers/check-duplicate?video_id=XXXX
//   - markers 컬렉션에서 youtube_video_id 가 일치하는 문서를 검색(limit 1).
//   - 있으면  { exists: true, marker: { id, location, city, country, youtube_title } }
//   - 없으면  { exists: false }
//   - video_id 파라미터가 없으면 400.
//
// firebase-admin(Node 전용) 사용 → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
// 실시간 중복 여부를 확인해야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const COLLECTION = "markers";

export async function GET(request) {
  try {
    // 쿼리 파라미터에서 video_id 추출
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");

    // 필수 파라미터 검증
    if (!videoId) {
      return Response.json(
        { ok: false, error: "video_id 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    // youtube_video_id 가 일치하는 문서 1건만 조회
    const snapshot = await adminDb
      .collection(COLLECTION)
      .where("youtube_video_id", "==", videoId)
      .limit(1)
      .get();

    // 중복 없음
    if (snapshot.empty) {
      return Response.json({ exists: false }, { status: 200 });
    }

    // 중복 있음 → 기존 마커의 요약 정보 반환
    const doc = snapshot.docs[0];
    const data = doc.data() || {};

    return Response.json(
      {
        exists: true,
        marker: {
          id: doc.id,
          location: data.location || "",
          city: data.city || "",
          country: data.country || "",
          youtube_title: data.youtube_title || "",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers/check-duplicate][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "중복 확인 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
