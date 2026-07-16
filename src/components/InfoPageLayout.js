"use client";

// ─────────────────────────────────────────────────────────────
// InfoPageLayout — 정보성 페이지(소개/문의) 공통 레이아웃
//
// LegalPageLayout 과 거의 같은 chrome(홈 링크 + 제목 + 본문 + 푸터)이지만,
// 법적 면책 문구는 넣지 않는다(소개/문의는 약관·정책 문서가 아니므로).
//
// 다국어: 현재 언어(useI18n)가 한국어면 한국어 chrome, 그 외에는 영어 chrome.
//   본문(children)·제목·부제는 각 페이지가 언어에 맞춰 넘겨준다.
//   (SSR 은 기본어=영어로 렌더 → 크롤러엔 영어, 마운트 후 사용자 언어로 보정)
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import Footer from "@/components/Footer";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function InfoPageLayout({ title, subtitle, children }) {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  const homeLabel = isKo ? "← TripByClip 홈으로" : "← Back to TripByClip home";

  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        {/* 홈으로 돌아가기 */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
        >
          {homeLabel}
        </Link>

        {/* 제목 + (선택) 부제 */}
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}

        {/* 본문 */}
        <div className="mt-6 space-y-6">{children}</div>
      </main>

      {/* 공통 푸터 */}
      <Footer />
    </>
  );
}
