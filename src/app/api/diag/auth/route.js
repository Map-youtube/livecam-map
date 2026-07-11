// ─────────────────────────────────────────────────────────────
// GET /api/diag/auth — (임시 진단) firebase-admin/auth 로딩·검증 파이프라인 점검
//
// Vercel 운영에서 관리자 인증(verifyIdToken)이 왜 실패하는지 원인 격리용.
//   - firebase-admin/auth 동적 import 성공 여부
//   - getAuth(adminApp) 호출 가능 여부
//   - 더미 토큰으로 verifyIdToken 시도 → 정상 파이프라인이면 "인자/토큰 형식" 류 에러가 나야 함
//     (여기서 "모듈 로드 실패" 류가 나오면 = 동적 import 문제)
//
// ⚠️ 비밀값 없음. 원인 확인 후 이 파일은 삭제한다.
// ─────────────────────────────────────────────────────────────

import { adminApp } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out = {
    importOk: null,
    getAuthOk: null,
    verifyResult: null,
  };
  try {
    const mod = await import("firebase-admin/auth");
    out.importOk = typeof mod.getAuth === "function";
    try {
      const auth = mod.getAuth(adminApp);
      out.getAuthOk = !!auth;
      try {
        await auth.verifyIdToken("dummy-invalid-token");
        out.verifyResult = "unexpected-ok";
      } catch (verifyErr) {
        // 정상 파이프라인이면 auth/argument-error 등 "토큰이 잘못됨" 류가 나온다.
        out.verifyResult =
          (verifyErr && verifyErr.code) ||
          (verifyErr && String(verifyErr.message || "").slice(0, 100)) ||
          "verify-threw";
      }
    } catch (getAuthErr) {
      out.getAuthOk =
        "err:" + String((getAuthErr && getAuthErr.message) || "").slice(0, 100);
    }
  } catch (importErr) {
    out.importOk =
      "err:" + String((importErr && importErr.message) || "").slice(0, 150);
  }
  return Response.json(out, { status: 200 });
}
