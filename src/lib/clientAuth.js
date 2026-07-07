// ─────────────────────────────────────────────────────────────
// 클라이언트 인증 도우미
//
// getAdminIdToken():
//   - 현재 로그인한 Firebase 사용자의 ID 토큰을 반환한다.
//   - 로그인 세션이 없으면(만료 포함) null 을 반환한다.
//
// 보호된 API(POST/PATCH/DELETE) 호출 시, 이 토큰을 Authorization: Bearer {토큰} 으로 첨부한다.
// ⚠️ 토큰 값 자체는 로그로 남기지 않는다.
// ─────────────────────────────────────────────────────────────

import { auth } from "@/lib/firebase";

export async function getAdminIdToken() {
  try {
    const user = auth.currentUser;
    if (!user) return null; // 로그인 세션 없음
    const token = await user.getIdToken();
    return token || null;
  } catch (error) {
    // 토큰 값은 로그하지 않는다.
    console.error("[clientAuth] ID 토큰 획득 실패:", error && error.message); // TODO: 배포 전 제거
    return null;
  }
}
