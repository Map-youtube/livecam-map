// ─────────────────────────────────────────────────────────────
// Firebase Admin 초기화 (서버 전용 — API Route 등 서버 사이드에서만 import)
//
// 이 파일은 절대 클라이언트 컴포넌트에서 import 하면 안 된다.
// 서비스 계정(Service Account) 비밀 키를 다루므로 서버 환경에서만 실행되어야 한다.
//
// 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 에는 서비스 계정 JSON 전체가
// "한 줄짜리 문자열" 형태로 저장되어 있다. 이를 JSON.parse 하여 사용한다.
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ─── 서비스 계정 파싱 ──────────────────────────────────────────
// FIREBASE_SERVICE_ACCOUNT_KEY(JSON 문자열)를 파싱한다.
// 파싱 실패는 앱이 정상 동작할 수 없는 치명적 상황이므로 try-catch로 감싸
// 원인을 명확히 알 수 있는 에러 메시지를 던진다.
function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  // 환경변수 자체가 없는 경우 (설정 누락)
  if (!raw) {
    throw new Error(
      "[firebaseAdmin] 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY 가 설정되지 않았습니다. " +
        ".env.local 또는 배포 환경변수에 서비스 계정 JSON을 등록하세요."
    );
  }

  let serviceAccount;
  try {
    // JSON 문자열 → 객체로 변환
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    // JSON 형식이 깨진 경우 (따옴표 누락, 잘림 등)
    throw new Error(
      "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY 를 JSON으로 파싱하지 못했습니다. " +
        "값이 올바른 JSON 문자열인지(따옴표/중괄호 누락 여부) 확인하세요. " +
        "원본 에러: " +
        error.message
    );
  }

  // ─── private_key 줄바꿈 복원 (매우 중요) ─────────────────────
  // 환경변수에 저장된 private_key는 실제 줄바꿈이 "\n"(역슬래시 + n) 형태의
  // 두 글자 문자열로 저장되어 있는 경우가 많다.
  // 이 상태 그대로 cert()에 넘기면 서비스 계정 인증에 실패한다.
  // 따라서 리터럴 "\n" 을 실제 줄바꿈 문자(\n)로 치환해야 한다.
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  } else {
    throw new Error(
      "[firebaseAdmin] 서비스 계정 JSON에 private_key 필드가 없습니다. " +
        "올바른 서비스 계정 키인지 확인하세요."
    );
  }

  return serviceAccount;
}

// ─── Admin 앱 초기화 (중복 초기화 방지) ────────────────────────
// 서버에서도 모듈이 여러 번 평가될 수 있으므로 getApps().length로 중복을 막는다.
// 이미 초기화된 앱이 있으면 기존 앱(getApp())을 재사용한다.
const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: cert(parseServiceAccount()),
      });

// ─── Firestore(Admin) 인스턴스 ─────────────────────────────────
// adminDb: 서버 사이드에서 보안 규칙을 우회하여 Firestore에 접근하는 관리자 권한 인스턴스.
const adminDb = getFirestore(adminApp);

// ─── 프로젝트 ID (토큰 검증용) ─────────────────────────────────
// Firebase ID 토큰의 issuer/audience 가 이 project_id 와 일치해야 한다(authUtils 에서 사용).
// 서비스 계정 JSON 의 project_id 를 우선 사용하고, 없으면 공개 환경변수로 폴백한다.
let adminProjectId = null;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const parsed = JSON.parse(raw);
    adminProjectId = parsed && parsed.project_id ? parsed.project_id : null;
  }
} catch (error) {
  // 파싱 실패는 아래 폴백으로 처리
}
if (!adminProjectId) {
  adminProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
}

// ─── export ────────────────────────────────────────────────────
// 서버(API Route)에서 { adminDb } 형태로 가져다 사용한다.
export { adminApp, adminDb, adminProjectId };
