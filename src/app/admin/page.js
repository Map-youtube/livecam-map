// ─────────────────────────────────────────────────────────────
// 관리자 페이지 — 마커 등록
//
// TODO: 다음 작업에서 로그인 보호 추가 예정.
//       (현재는 누구나 /admin 에 접근 가능한 상태 — 인증 미적용)
// ─────────────────────────────────────────────────────────────

import MarkerForm from "@/components/MarkerForm";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          관리자 - 마커 등록
        </h1>
        <MarkerForm />
      </div>
    </main>
  );
}
