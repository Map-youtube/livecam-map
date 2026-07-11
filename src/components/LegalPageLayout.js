// ─────────────────────────────────────────────────────────────
// LegalPageLayout — 법적 필수 페이지(이용약관/개인정보처리방침/제휴고지) 공통 레이아웃
//
// - 상단: "홈으로" 링크 + 페이지 제목 + (선택) 시행일/최종 개정일
// - 본문: children (각 페이지가 <section> 들로 전달)
// - 하단: 세 페이지 공통 면책 문구(작은 글씨) — 변호사 검토를 거치지 않은 일반 템플릿 안내
//
// 서버 컴포넌트(정적 콘텐츠). 스타일은 앱 토큰(text-ink/ink-muted/border-border)을 사용한다.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import Footer from "@/components/Footer";

export default function LegalPageLayout({
  title,
  effectiveDate,
  lastUpdated,
  children,
}) {
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
      {/* 홈으로 돌아가기 */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        ← TripByClip 홈으로
      </Link>

      {/* 제목 */}
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">{title}</h1>

      {/* 시행일 / 최종 개정일 */}
      {(effectiveDate || lastUpdated) && (
        <p className="mt-1 text-xs text-ink-muted">
          {effectiveDate ? `시행일: ${effectiveDate}` : ""}
          {effectiveDate && lastUpdated ? " · " : ""}
          {lastUpdated ? `최종 개정일: ${lastUpdated}` : ""}
        </p>
      )}

      {/* 본문 */}
      <div className="mt-6 space-y-6">{children}</div>

      {/* 공통 하단 면책 문구 (작은 글씨) */}
      <div className="mt-12 border-t border-border pt-4">
        <p className="text-xs leading-relaxed text-ink-muted">
          본 문서는 일반적인 웹서비스 운영 기준을 참고하여 작성된 안내이며, 법률
          전문가의 검토를 거치지 않았습니다. 법적 효력이 중요한 사안은 관련
          기관(개인정보보호위원회, 법률구조공단 등)의 안내를 참고하시기 바랍니다.
        </p>
      </div>
      </main>

      {/* 공통 푸터 */}
      <Footer />
    </>
  );
}
