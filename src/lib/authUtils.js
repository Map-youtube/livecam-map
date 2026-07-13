// ─────────────────────────────────────────────────────────────
// 서버 전용 인증 검증 도우미
//
// verifyAdminRequest(request):
//   - 요청 Authorization 헤더에서 "Bearer {토큰}" 을 파싱
//   - Firebase ID 토큰을 jose 로 직접 검증(서명/발급자/대상/만료)
//   - 성공: { valid: true, uid, email }
//   - 실패: { valid: false, error: "..." }  (구체적 에러 코드는 노출하지 않음)
//
// ★ firebase-admin/auth 를 쓰지 않는 이유:
//   firebase-admin/auth 는 내부적으로 ESM 전용 패키지 jose 를 require() 하는데,
//   Vercel 서버리스(외부 모듈 require) 환경에서 ERR_REQUIRE_ESM 으로 로딩이 실패한다.
//   → 그 결과 관리자 API 가 500(모듈 로드) 또는 401(토큰 검증 불가)로 깨졌다.
//   그래서 firebase-admin/auth 대신, Firebase 공개키(JWK)로 ID 토큰을 직접 검증한다.
//   jose 는 ESM 전용이므로 "동적 import" 로 불러온다(정적/require 로는 실패).
//
// ⚠️ 서버 전용. 클라이언트에서 import 금지. 토큰 값 자체는 절대 로그에 남기지 않는다.
// ─────────────────────────────────────────────────────────────

import { adminProjectId } from "@/lib/firebaseAdmin";

// Firebase ID 토큰 공개키(JWK) 엔드포인트 (securetoken 서명자)
const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// createRemoteJWKSet 결과 캐시 (내부적으로 공개키를 캐싱/자동 갱신한다)
let jwksCache = null;

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

    // 프로젝트 ID 가 없으면 issuer/audience 를 검증할 수 없다.
    if (!adminProjectId) {
      console.error(
        "[authUtils] project_id 를 확인할 수 없어 토큰 검증을 진행할 수 없습니다."
      ); // TODO: 배포 전 제거
      return { valid: false, error: "인증에 실패했습니다" };
    }

    // jose 는 ESM 전용 → 동적 import 로 불러온다.
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    if (!jwksCache) {
      jwksCache = createRemoteJWKSet(new URL(FIREBASE_JWK_URL));
    }

    // Firebase ID 토큰 검증:
    //   - 서명: securetoken 공개키(JWK), 알고리즘 RS256
    //   - issuer: https://securetoken.google.com/{projectId}
    //   - audience: {projectId}
    //   - 만료(exp)/발효(nbf) 는 jose 가 자동 검증
    let payload;
    try {
      const result = await jwtVerify(token, jwksCache, {
        issuer: `https://securetoken.google.com/${adminProjectId}`,
        audience: adminProjectId,
        algorithms: ["RS256"],
      });
      payload = result.payload;
    } catch (verifyError) {
      // 구체적 에러 코드는 노출하지 않는다. 토큰 값도 로그하지 않는다.
      console.error(
        "[authUtils] 토큰 검증 실패:",
        verifyError && verifyError.code ? verifyError.code : "verify_failed"
      ); // TODO: 배포 전 제거
      return { valid: false, error: "인증에 실패했습니다" };
    }

    // sub(uid) 가 있어야 유효한 사용자 토큰
    if (!payload || !payload.sub) {
      return { valid: false, error: "인증에 실패했습니다" };
    }

    const email = typeof payload.email === "string" ? payload.email : "";

    // ★ 관리자 화이트리스트 검증
    //   Firebase 프로젝트의 NEXT_PUBLIC_FIREBASE_API_KEY 는 클라이언트에 공개되므로,
    //   토큰이 "유효한 Firebase 사용자"임을 증명할 뿐 "관리자"임을 보장하지 않는다
    //   (Identity Toolkit REST API로 누구나 자체 계정을 만들 수 있음).
    //   → ADMIN_EMAIL 환경변수와 정확히 일치하는 이메일만 관리자로 인정한다.
    //   ⚠️ 환경변수에 눈에 안 보이는 공백/개행이 붙는 경우가 많아 양쪽 모두 trim + 소문자 비교.
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
    if (!adminEmail) {
      // ADMIN_EMAIL 미설정: 관리가 통째로 잠기지 않도록, 예전처럼 "유효한 로그인 토큰"이면 통과시킨다.
      //   (보안은 약해지므로 경고만 남긴다. Vercel 환경변수에 ADMIN_EMAIL 을 넣으면
      //    아래 화이트리스트 검증이 자동으로 켜져 그 계정만 관리자로 인정된다.)
      console.warn(
        "[authUtils] ADMIN_EMAIL 미설정 — 관리자 이메일 화이트리스트 없이 동작 중(보안 약화). 배포 환경변수에 ADMIN_EMAIL 설정 권장."
      ); // TODO: 배포 전 제거
      return { valid: true, uid: payload.sub, email };
    }
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
      // 로그인은 됐지만 ADMIN_EMAIL 과 다른 계정 → 명확히 구분해 알린다.
      return {
        valid: false,
        error: "이 계정은 관리자로 등록되어 있지 않습니다",
        reason: "not_admin",
        email,
      };
    }

    // 검증 성공
    return {
      valid: true,
      uid: payload.sub,
      email,
    };
  } catch (error) {
    // 예기치 못한 오류도 인증 실패로 처리 (토큰 값은 로그하지 않음)
    console.error("[authUtils] verifyAdminRequest 예외:", error && error.message); // TODO: 배포 전 제거
    return { valid: false, error: "인증에 실패했습니다" };
  }
}
