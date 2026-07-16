// ─────────────────────────────────────────────────────────────
// 로딩 화면 (Next.js loading.js 컨벤션)
//
// 서버 컴포넌트(page.js)에서 마커/태그를 불러오는 동안 이 화면이 자동으로 표시된다.
// 사용자가 빈 화면을 보지 않도록 간단한 안내만 보여준다.
// ─────────────────────────────────────────────────────────────

export default function Loading() {
  // 서버 컴포넌트라 접속자 언어를 알 수 없으므로, 특정 언어 문구 대신
  // 언어 중립적인 스피너 + 브랜드명만 표시한다(어느 언어권에서도 자연스럽게 보이도록).
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-gray-50">
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand"
        aria-hidden="true"
      />
      <p className="font-display text-sm font-semibold tracking-tight text-gray-600">
        Trip <span className="font-normal text-gray-400">by</span>{" "}
        <span className="text-brand">Clip</span>
      </p>
    </div>
  );
}
