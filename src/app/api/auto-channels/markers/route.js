// ─────────────────────────────────────────────────────────────
// 자동 마커 목록 API (관리자 목록용) — /api/auto-channels/markers
//
// auto_markers 전체를 반환한다(관리자 목록에서 채널별로 묶어 보여주기 위함).
//   - is_live 여부와 무관하게 모두 반환하되, 관리 화면에서 상태 배지로 구분한다.
//   - 읽기 공개(민감정보 없음). 수정/삭제는 [id] 라우트에서 관리자 검증.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";

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

export async function GET() {
  try {
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
