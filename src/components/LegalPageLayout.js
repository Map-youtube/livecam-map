"use client";

// ─────────────────────────────────────────────────────────────
// LegalPageLayout — 법적 필수 페이지(이용약관/개인정보처리방침/제휴고지) 공통 레이아웃
//
// - 상단: "홈으로" 링크 + 페이지 제목 + (선택) 시행일/최종 개정일
// - 본문: children (각 페이지가 <section> 들로 전달)
// - 하단: 세 페이지 공통 면책 문구(작은 글씨)
//
// 다국어: 현재 언어(useI18n)가 한국어면 한국어 chrome, 그 외에는 영어 chrome 을 쓴다.
//   본문(children)·제목·날짜는 각 페이지가 언어에 맞춰 넘겨준다.
//   (SSR 은 기본어=영어로 렌더 → 크롤러엔 영어, 마운트 후 사용자 언어로 보정)
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import Footer from "@/components/Footer";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function LegalPageLayout({
  title,
  effectiveDate,
  lastUpdated,
  children,
}) {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  const homeLabel = isKo ? "← TripByClip 홈으로" : "← Back to TripByClip home";
  const effectiveLabel = isKo ? "시행일" : "Effective date";
  const updatedLabel = isKo ? "최종 개정일" : "Last updated";
  const disclaimer = isKo
    ? "본 문서는 일반적인 웹서비스 운영 기준을 참고하여 작성된 안내이며, 법률 전문가의 검토를 거치지 않았습니다. 법적 효력이 중요한 사안은 관련 기관의 안내를 참고하시기 바랍니다."
    : "This document is provided for general informational purposes based on common web service practices and has not been reviewed by a legal professional. For matters where legal effect is important, please consult the relevant authorities.";

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

        {/* 제목 */}
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">{title}</h1>

        {/* 시행일 / 최종 개정일 */}
        {(effectiveDate || lastUpdated) && (
          <p className="mt-1 text-xs text-ink-muted">
            {effectiveDate ? `${effectiveLabel}: ${effectiveDate}` : ""}
            {effectiveDate && lastUpdated ? " · " : ""}
            {lastUpdated ? `${updatedLabel}: ${lastUpdated}` : ""}
          </p>
        )}

        {/* 본문 */}
        <div className="mt-6 space-y-6">{children}</div>

        {/* 공통 하단 면책 문구 (작은 글씨) */}
        <div className="mt-12 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-ink-muted">{disclaimer}</p>
        </div>
      </main>

      {/* 공통 푸터 */}
      <Footer />
    </>
  );
}
