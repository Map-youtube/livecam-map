// ─────────────────────────────────────────────────────────────
// SeoPageShell — SEO 정적 페이지 공통 껍데기 (컨테이너 + 하단 푸터)
//
// 법적 페이지(LegalPageLayout)와 마찬가지로, 페이지 콘텐츠를 가운데 정렬 컨테이너에
// 담고 맨 아래에 공통 Footer 를 렌더한다. (Footer 는 각 페이지가 렌더하는 구조)
// ─────────────────────────────────────────────────────────────

import Footer from "@/components/Footer";

export default function SeoPageShell({ children }) {
  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
