"use client";

// ─────────────────────────────────────────────────────────────
// 관리자 로그인 페이지 (/admin/login)
//
// - Firebase Authentication(이메일/비밀번호)로 로그인.
// - 성공 시 /admin 으로 이동.
// - 이미 로그인된 상태로 접근하면 자동으로 /admin 으로 보냄.
// - 실패 시 Firebase 에러 코드를 그대로 노출하지 않고 한국어로 번역해 표시.
//
// ⚠️ 비밀번호/토큰은 절대 콘솔에 로그로 남기지 않는다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// ─── Firebase 에러 코드 → 사용자용 한국어 메시지 ──────────────
function translateAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/user-disabled":
      return "비활성화된 계정입니다.";
    case "auth/too-many-requests":
      return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "auth/network-request-failed":
      return "네트워크 오류가 발생했습니다. 연결을 확인해주세요.";
    default:
      return "로그인에 실패했습니다. 다시 시도해주세요.";
  }
}

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // 초기 로그인 상태 확인 중 여부 (이미 로그인돼 있으면 폼 대신 이동)
  const [checking, setChecking] = useState(true);

  // ─── 이미 로그인돼 있으면 /admin 으로 자동 이동 ──────────────
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          router.replace("/admin");
        } else {
          setChecking(false);
        }
      });
    } catch (error) {
      // 인증 상태 확인 자체가 실패하면 그냥 로그인 폼을 보여준다.
      console.error("[admin/login] 인증 상태 확인 실패:", error.code || ""); // TODO: 배포 전 제거
      setChecking(false);
    }
    return () => unsubscribe();
  }, [router]);

  // ─── 로그인 처리 ─────────────────────────────────────────────
  async function handleLogin(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMsg("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // 성공 → 관리자 페이지로 이동
      router.replace("/admin");
    } catch (error) {
      // ⚠️ 비밀번호/토큰은 로그하지 않는다. 에러 코드만 참고용으로 남긴다.
      console.error("[admin/login] 로그인 실패 코드:", error.code || "unknown"); // TODO: 배포 전 제거
      setErrorMsg(translateAuthError(error.code));
      setSubmitting(false);
    }
  }

  // ─── 초기 확인 중에는 로딩 화면만 ───────────────────────────
  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-sm text-gray-500">확인 중...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-ink">관리자 로그인</h1>
        <p className="mb-5 text-xs text-gray-500">
          등록된 관리자 계정으로만 로그인할 수 있습니다.
        </p>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3">
          {/* 이메일 */}
          <div>
            <label className="block text-xs text-gray-600">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="admin@example.com"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-xs text-gray-600">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={submitting}
            className={
              "w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition " +
              (submitting
                ? "cursor-not-allowed bg-gray-300"
                : "bg-brand hover:bg-brand-hover")
            }
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}
