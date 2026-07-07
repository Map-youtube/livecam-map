// ─────────────────────────────────────────────────────────────
// 로딩 화면 (Next.js loading.js 컨벤션)
//
// 서버 컴포넌트(page.js)에서 마커/태그를 불러오는 동안 이 화면이 자동으로 표시된다.
// 사용자가 빈 화면을 보지 않도록 간단한 안내만 보여준다.
// ─────────────────────────────────────────────────────────────

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">지도를 불러오는 중...</p>
    </div>
  );
}
