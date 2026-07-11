// ─────────────────────────────────────────────────────────────
// GET /api/diag/auth — (임시 진단) jose 기반 토큰 검증 파이프라인 점검
//
//   - jose 동적 import 성공 여부 (ERR_REQUIRE_ESM 회피 확인)
//   - project_id 확인 여부
//   - 더미 토큰으로 jwtVerify 시도 → 정상 파이프라인이면 "JWS/서명/형식" 류 에러가 나야 함
//     (여기서 "모듈 로드 실패" 류가 나오면 아직 문제)
//
// ⚠️ 비밀값 없음. 원인 확인 후 이 파일은 삭제한다.
// ─────────────────────────────────────────────────────────────

import { adminProjectId } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export async function GET() {
  const out = {
    joseImportOk: null,
    projectIdPresent: !!adminProjectId,
    verifyResult: null,
  };
  try {
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    out.joseImportOk = typeof jwtVerify === "function";
    try {
      const jwks = createRemoteJWKSet(new URL(FIREBASE_JWK_URL));
      try {
        await jwtVerify("dummy.invalid.token", jwks, {
          issuer: `https://securetoken.google.com/${adminProjectId}`,
          audience: adminProjectId,
          algorithms: ["RS256"],
        });
        out.verifyResult = "unexpected-ok";
      } catch (verifyErr) {
        out.verifyResult =
          (verifyErr && verifyErr.code) ||
          (verifyErr && String(verifyErr.message || "").slice(0, 100)) ||
          "verify-threw";
      }
    } catch (jwksErr) {
      out.verifyResult =
        "jwks-err:" + String((jwksErr && jwksErr.message) || "").slice(0, 100);
    }
  } catch (importErr) {
    out.joseImportOk =
      "err:" + String((importErr && importErr.message) || "").slice(0, 150);
  }
  return Response.json(out, { status: 200 });
}
