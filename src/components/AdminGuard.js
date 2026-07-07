"use client";

// ─────────────────────────────────────────────────────────────
// AdminGuard — 관리자 페이지 로그인 보호 래퍼
//
// - children 을 감싸서, 로그인된 경우에만 children 을 렌더링한다.
// - 로그인 안 된 상태면 /admin/login 으로 이동시키고 로딩 화면만 보여준다.
// - 로그인 상태 확인이 끝나기 전(초기 로딩)에는 깜빡임 없이 로딩 화면만 표시.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AdminGuard({ children }) {
  const router = useRouter();
  // checking: 최초 인증 상태 확인 중, authed: 로그인 여부
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          // 로그인됨 → children 렌더 허용
          setAuthed(true);
          setChecking(false);
        } else {
          // 로그인 안 됨 → 로그인 페이지로 이동 (children 렌더 안 함)
          setAuthed(false);
          setChecking(false);
          router.replace("/admin/login");
        }
      });
    } catch (error) {
      // 인증 감시 자체가 실패하면 안전하게 로그인 페이지로 보낸다.
      console.error("[AdminGuard] 인증 상태 감시 실패:", error.code || ""); // TODO: 배포 전 제거
      setAuthed(false);
      setChecking(false);
      router.replace("/admin/login");
    }
    return () => unsubscribe();
  }, [router]);

  // ─── 초기 확인 중 또는 미인증(이동 중) → 로딩 화면만 ────────
  if (checking || !authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">확인 중...</p>
      </main>
    );
  }

  // ─── 로그인됨 → 보호된 내용 렌더 ────────────────────────────
  return <>{children}</>;
}
