"use client";

// ─────────────────────────────────────────────────────────────
// LanguageSelector — 상단 배너 우측 언어 선택 드롭다운
//
// - 지원 언어를 "그 언어의 자기 이름"으로 나열 (예: 한국어, English, 日本語 …)
// - 선택 시 useI18n().setLocale 로 전역 언어 변경 + localStorage 저장
// - 접근성: 네이티브 <select> 사용 (모바일에서도 OS 기본 피커로 편함)
// ─────────────────────────────────────────────────────────────

import { LANGUAGES } from "@/lib/i18n/languages";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-1">
      {/* 지구본 아이콘 (언어 선택 시각적 힌트) */}
      <span aria-hidden="true" className="text-sm">
        🌐
      </span>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        aria-label={t("language")}
        className="max-w-[8.5rem] cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink transition hover:bg-bg focus:border-brand focus:outline-none"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
