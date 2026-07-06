// ─────────────────────────────────────────────────────────────
// Firebase 클라이언트 초기화 (브라우저/클라이언트 컴포넌트용)
//
// Firebase v9 모듈식(modular) SDK를 사용한다.
// 이 파일은 클라이언트에서 안전하게 노출 가능한 NEXT_PUBLIC_* 환경변수만 사용한다.
// (Firebase 웹 API 키는 공개되어도 되는 값이며, 실제 보안은 Firestore 보안 규칙으로 처리한다.)
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ─── Firebase 설정값 ───────────────────────────────────────────
// 모든 값은 환경변수(.env.local)에서 가져온다. 하드코딩 금지.
// NEXT_PUBLIC_ 접두사가 붙은 변수는 클라이언트 번들에 포함되어 브라우저에서 접근 가능하다.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ─── 앱 초기화 (중복 초기화 방지) ──────────────────────────────
// Next.js 개발 모드에서는 핫 리로드(HMR)로 인해 이 모듈이 여러 번 평가될 수 있다.
// initializeApp을 그때마다 호출하면 "Firebase App named '[DEFAULT]' already exists" 에러가 발생한다.
// 따라서 이미 초기화된 앱이 있으면 getApp()으로 기존 앱을 재사용한다.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ─── Firestore / Auth 인스턴스 생성 ────────────────────────────
// db: Firestore 데이터베이스 (마커 데이터 등 읽기/쓰기)
// auth: Firebase Authentication (관리자 로그인 등)
const db = getFirestore(app);
const auth = getAuth(app);

// ─── export ────────────────────────────────────────────────────
// 클라이언트 컴포넌트에서 { db, auth } 형태로 가져다 사용한다.
export { app, db, auth };
