// ─────────────────────────────────────────────────────────────
// ⚠️ 임시 파일 — Firebase Admin 실제 연결 확인용 헬스체크 라우트.
//    연결 검증이 끝나면 삭제 예정. (프로덕션에 남겨두지 말 것)
//
// GET /api/health
//   - adminDb.collection('markers').limit(1).get() 를 실제로 호출하여
//     Firestore 서비스 계정 인증 및 연결이 정상인지 확인한다.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";

// firebase-admin(Node 전용) 사용 → Node.js 런타임 명시
export const runtime = "nodejs";
// 매 요청마다 실제 연결을 확인해야 하므로 캐시하지 않는다
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Firestore에 실제 쿼리를 날려 연결/인증을 검증한다 (1건만 조회)
    const snapshot = await adminDb.collection("markers").limit(1).get();

    // 성공: 연결됨. 샘플로 조회된 문서 수(0 또는 1)를 함께 반환.
    return Response.json(
      {
        ok: true,
        firebase: "connected",
        marker_count_sample: snapshot.size,
      },
      { status: 200 }
    );
  } catch (error) {
    // 실패: 서비스 계정/네트워크/권한 문제 등
    console.error("[api/health][GET] Firebase 연결 실패:", error); // TODO: 배포 전 제거
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
