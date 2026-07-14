"use client";

// ─────────────────────────────────────────────────────────────
// 관리자 페이지 — 마커 등록 + 등록된 마커 목록 (로그인 보호 적용)
//
// 로그인 보호: 전체 내용을 AdminGuard 로 감싼다.
//   - 로그인 안 된 상태로 접근하면 AdminGuard 가 /admin/login 으로 보냄.
// 상단에 로그인된 관리자 이메일 표시 + 로그아웃 버튼 제공.
//
// 구성(2단 레이아웃):
//   - 왼쪽 절반 : "마커 등록" 폼 → 구분선 → "자동 라이브 채널 관리"
//   - 오른쪽 절반 : "등록된 마커 목록"(양이 많아 별도 컬럼으로 분리, 한눈에 보기 쉽게)
// (구 "측정 지표" 영역은 제거 — 접속자수/API 소비량 통계는 추후 별도 반영 예정)
// 등록 폼에서 등록 성공 시 refreshSignal 을 증가시켜 목록이 자동 갱신되도록 연동한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import MarkerForm from "@/components/MarkerForm";
import MarkerList from "@/components/MarkerList";
import LiveChannelSection from "@/components/LiveChannelSection";

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
      {/* 왼쪽 절반: 등록 폼 + 자동 라이브 채널 관리 / 오른쪽 절반: 등록된 마커 목록 */}
      {/* 작은 화면에선 세로로 쌓임(flex-col), lg 이상에서 좌우 2단(flex-row) */}
      <main className="flex min-h-screen flex-col bg-bg lg:flex-row">
        {/* 왼쪽 절반 (min-w-0 : 내부 표/지도가 넘칠 때 가로 스크롤되게 함. 작은 화면에선 전체폭) */}
        <div className="w-full min-w-0 px-4 py-8 lg:w-1/2">
          {/* 상단 바: 관리자 이메일 + 로그아웃 */}
          <div className="mb-6 flex items-center justify-between border-b border-border pb-3">
            <span className="text-xs text-gray-500">
              {adminEmail ? `로그인: ${adminEmail}` : "로그인됨"}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              로그아웃
            </button>
          </div>

          {/* 등록 영역 (폼이 왼쪽 절반 폭을 넓게 사용 — 지도/태그가 넓어짐) */}
          <div>
            <h1 className="mb-6 font-display text-2xl font-bold text-ink">
              관리자 - 마커 등록
            </h1>
            <MarkerForm onRegistered={() => setRefreshSignal((n) => n + 1)} />
          </div>

          {/* 구분선 */}
          <hr className="my-10 border-border" />

          {/* 자동 라이브 채널 관리 (방송국 등 24/7 채널 — 대분류/소분류로 묶음). 현위치(왼쪽) 유지 */}
          <h2 className="mb-2 font-display text-xl font-bold text-ink">
            자동 라이브 채널 관리
          </h2>
          <p className="mb-6 text-sm text-ink-muted">
            NASA처럼 24/7 라이브만 하는 유튜브 채널을 대분류/소분류로 묶어 등록합니다.
            영상은 자동으로 수집되며, 채널과 지도 위치만 지정하면 됩니다.
          </p>
          <LiveChannelSection />
        </div>

        {/* 오른쪽 절반: 등록된 마커 목록 (양이 많아 별도 컬럼으로 분리) */}
        {/* min-w-0 : 표가 넘칠 때 이 컬럼 안에서 가로 스크롤되게 함 */}
        <section className="w-full min-w-0 border-t border-border bg-surface px-4 py-8 lg:w-1/2 lg:border-l lg:border-t-0">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">
            등록된 마커 목록
          </h2>
          <MarkerList refreshSignal={refreshSignal} />
        </section>
      </main>
    </AdminGuard>
  );
}
