// ─────────────────────────────────────────────────────────────
// 서버 전용 인증 검증 도우미
//
// verifyAdminRequest(request):
//   - 요청 Authorization 헤더에서 "Bearer {토큰}" 을 파싱
//   - firebaseAdmin(getAuth().verifyIdToken)으로 토큰 검증
//   - 성공: { valid: true, uid, email }
//   - 실패: { valid: false, error: "..." }  (구체적 에러 코드는 노출하지 않음)
//
// ⚠️ 서버 전용. firebase-admin 을 사용하므로 클라이언트에서 import 금지.
// ⚠️ 토큰 값 자체는 절대 로그에 남기지 않는다.
// ─────────────────────────────────────────────────────────────

import { getAuth } from "firebase-admin/auth";
import { adminApp } from "@/lib/firebaseAdmin";

export async function verifyAdminRequest(request) {
  try {
    // Authorization 헤더 추출
    const authHeader =
      request && request.headers ? request.headers.get("authorization") : null;

    // 헤더가 없거나 "Bearer " 형식이 아니면 거부
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { valid: false, error: "인증 토큰이 없습니다" };
    }

    // "Bearer " 접두사 이후의 토큰만 취함
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return { valid: false, error: "인증 토큰이 없습니다" };
    }

    // ID 토큰 검증 (만료/위조 등은 예외로 던져진다)
    let decoded;
    try {
      decoded = await getAuth(adminApp).verifyIdToken(token);
    } catch (verifyError) {
      // 구체적 에러 코드는 노출하지 않는다. 토큰 값도 로그하지 않는다.
      console.error(
        "[authUtils] 토큰 검증 실패:",
        verifyError && verifyError.code ? verifyError.code : "verify_failed"
      ); // TODO: 배포 전 제거
      return { valid: false, error: "인증에 실패했습니다" };
    }

    // 검증 성공
    return {
      valid: true,
      uid: decoded.uid,
      email: decoded.email || "",
    };
  } catch (error) {
    // 예기치 못한 오류도 인증 실패로 처리 (토큰 값은 로그하지 않음)
    console.error("[authUtils] verifyAdminRequest 예외:", error && error.message); // TODO: 배포 전 제거
    return { valid: false, error: "인증에 실패했습니다" };
  }
}
