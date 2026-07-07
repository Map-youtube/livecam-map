"use client";

// ─────────────────────────────────────────────────────────────
// 관리자 페이지 — 마커 등록 + 등록된 마커 목록
//
// TODO: 다음 작업에서 로그인 보호 추가 예정.
//       (현재는 누구나 /admin 에 접근 가능한 상태 — 인증 미적용)
//
// 구성: 위쪽 "마커 등록" 폼 → 구분선 → 아래쪽 "등록된 마커 목록" 트리.
// 등록 폼에서 등록 성공 시 refreshSignal 을 증가시켜 목록이 자동 갱신되도록 연동한다.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import MarkerForm from "@/components/MarkerForm";
import MarkerTree from "@/components/MarkerTree";

export default function AdminPage() {
  // 값이 바뀌면 MarkerTree 가 목록을 다시 불러온다 (등록 성공 시 +1).
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
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
        <MarkerTree refreshSignal={refreshSignal} />
      </div>
    </main>
  );
}
