"use client";

// ─────────────────────────────────────────────────────────────
// Footer — 모든 페이지 하단 공통 푸터
//
// - 저작권 표기: © 2026 TripByClip. All rights reserved.
// - 법적 페이지 링크 3종: 이용약관 / 개인정보처리방침 / 제휴 링크 고지 (다국어 라벨)
// - 지도 데이터 출처(OpenStreetMap) 표기
//
// 다국어 라벨(t)을 쓰기 위해 클라이언트 컴포넌트로 둔다. layout.js 에서 공통 적용.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className="flex-shrink-0 border-t border-border bg-surface px-4 py-1.5 text-ink-muted">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-x-2 gap-y-0.5 text-center text-[11px] leading-tight sm:flex-row sm:justify-between sm:text-left">
        {/* 저작권 + 지도 데이터 출처 (한 줄로 합침) */}
        <span>
          © 2026 TripByClip. All rights reserved.
          <span className="mx-1.5 text-border" aria-hidden="true">
            ·
          </span>
          지도 데이터 © OpenStreetMap contributors
        </span>

        {/* 사이트 안내 + 법적 페이지 링크 */}
        <nav className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
          <Link href="/about" className="hover:text-brand hover:underline">
            {t("footerAbout")}
          </Link>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <Link href="/contact" className="hover:text-brand hover:underline">
            {t("footerContact")}
          </Link>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <Link href="/terms" className="hover:text-brand hover:underline">
            {t("footerTerms")}
          </Link>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <Link href="/privacy" className="hover:text-brand hover:underline">
            {t("footerPrivacy")}
          </Link>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <Link
            href="/affiliate-disclosure"
            className="hover:text-brand hover:underline"
          >
            {t("footerAffiliate")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
