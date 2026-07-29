// ─────────────────────────────────────────────────────────────
// 자동 마커 목록 API (관리자 목록용) — /api/auto-channels/markers
//
// auto_markers 전체를 반환한다(관리자 목록에서 채널별로 묶어 보여주기 위함).
//   - is_live 여부와 무관하게 모두 반환하되, 관리 화면에서 상태 배지로 구분한다.
//
// ⚠️ 2026-07-29 인증 추가 (Firestore 읽기 초과 전수조사에서 발견 — 최대 구멍):
//    예전 주석은 "읽기 공개(민감정보 없음)"였지만, 문제는 민감도가 아니라 **비용**이었다.
//    이 라우트는 인증도 캐시도 없이(force-dynamic) 호출 1회마다 auto_markers 컬렉션
//    "전체"를 읽는다(실측 958개). 봇/스캐너가 시간당 한 번만 두드려도 하루 23,000 읽기가
//    되어 무료 한도(5만/일)의 절반을 혼자 소모한다. 같은 화면이 함께 부르는
//    /api/auto-channels(241개)까지 더하면 호출 1회당 1,199 읽기.
//    → 관리자 화면(AutoChannelList)에서만 쓰이므로 다른 관리자 라우트와 동일하게
//      verifyAdminRequest 로 보호한다. 관리자 기능은 그대로다.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPlain(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

export async function GET(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, markers: [], error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const snap = await adminDb.collection("auto_markers").get();
    const markers = snap.docs.map((d) => {
      const data = d.data() || {};
      const out = { id: d.id };
      for (const [k, v] of Object.entries(data)) out[k] = toPlain(v);
      return out;
    });
    return Response.json({ ok: true, markers }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/markers][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, markers: [], error: "조회 실패" },
      { status: 200 }
    );
  }
}
