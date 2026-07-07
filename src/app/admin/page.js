"use client";

// ─────────────────────────────────────────────────────────────
// 관리자 페이지 — 마커 등록 + 등록된 마커 목록 (로그인 보호 적용)
//
// 로그인 보호: 전체 내용을 AdminGuard 로 감싼다.
//   - 로그인 안 된 상태로 접근하면 AdminGuard 가 /admin/login 으로 보냄.
// 상단에 로그인된 관리자 이메일 표시 + 로그아웃 버튼 제공.
//
// 구성: 위쪽 "마커 등록" 폼 → 구분선 → 아래쪽 "등록된 마커 목록".
// 등록 폼에서 등록 성공 시 refreshSignal 을 증가시켜 목록이 자동 갱신되도록 연동한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import MarkerForm from "@/components/MarkerForm";
import MarkerList from "@/components/MarkerList";

export default function AdminPage() {
  const router = useRouter();

  // 값이 바뀌면 MarkerList 가 목록을 다시 불러온다 (등록 성공 시 +1).
  const [refreshSignal, setRefreshSignal] = useState(0);
  // 로그인된 관리자 이메일 (상단 표시용)
  const [adminEmail, setAdminEmail] = useState("");

  // ─── 로그인된 사용자 이메일 읽기 ─────────────────────────────
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setAdminEmail(user && user.email ? user.email : "");
      });
    } catch (error) {
      console.error("[admin] 사용자 정보 확인 실패:", error.code || ""); // TODO: 배포 전 제거
    }
    return () => unsubscribe();
  }, []);

  // ─── 로그아웃 처리 ───────────────────────────────────────────
  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/admin/login");
    } catch (error) {
      console.error("[admin] 로그아웃 실패:", error.code || ""); // TODO: 배포 전 제거
      // 로그아웃 실패 시에도 로그인 페이지로 유도
      router.replace("/admin/login");
    }
  }

  return (
    <AdminGuard>
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {/* 상단 바: 관리자 이메일 + 로그아웃 */}
          <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-3">
            <span className="text-xs text-gray-500">
              {adminEmail ? `로그인: ${adminEmail}` : "로그인됨"}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              로그아웃
            </button>
          </div>

          {/* 등록 영역 */}
          <h1 className="mb-6 text-2xl font-bold text-gray-900">
            관리자 - 마커 등록
          </h1>
          <MarkerForm onRegistered={() => setRefreshSignal((n) => n + 1)} />

          {/* 구분선 */}
          <hr className="my-10 border-gray-300" />

          {/* 목록 영역 */}
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            등록된 마커 목록
          </h2>
          <MarkerList refreshSignal={refreshSignal} />
        </div>
      </main>
    </AdminGuard>
  );
}
