"use client";

// ─────────────────────────────────────────────────────────────
// LanguageSelector — 상단 배너 우측 언어 선택 드롭다운
//
// - 지원 언어를 "그 언어의 자기 이름"으로 나열 (예: 한국어, English, 日本語 …)
// - 선택 시 useI18n().setLocale 로 전역 언어 변경 + localStorage 저장
//
// ⚠️ 2026-07-30: 예전엔 네이티브 <select> 를 썼는데, 모바일(특히 안드로이드)에서
//    OS 가 그리는 큼직한 회색 리스트가 뜨면서 사이트 디자인과 완전히 동떨어져 보였다
//    ("촌스럽다" 사용자 피드백). 그래서 브랜드 톤(둥근 알약 트리거 + 카드형 목록)에
//    맞춘 커스텀 드롭다운으로 교체했다. 접근성을 위해 role="listbox"/"option" +
//    바깥 클릭/Esc 닫기는 직접 구현한다(네이티브 select 가 공짜로 주던 것들).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useI18n } from "@/components/i18n/LanguageProvider";
import CountryFlag from "@/components/CountryFlag";

export default function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = LANGUAGES.find((lang) => lang.code === locale) || LANGUAGES[0];

  // 바깥 클릭 또는 Esc 로 닫기
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (code) => {
    setLocale(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        // ⚠️ 모바일(좁은 폭)에서는 이 버튼이 먼저 줄어들어야 로고·LIVE 배지가
        //    줄바꿈되지 않는다(2026-07-29 실측). 최대폭을 화면 크기별로 다르게 둔다.
        className={
          "flex max-w-[6.5rem] cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition sm:max-w-[8.5rem] " +
          (open
            ? "border-brand bg-brand-light text-brand"
            : "border-border bg-surface/90 text-ink hover:bg-white")
        }
      >
        <CountryFlag code={current.country} />
        <span className="truncate">{current.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={"flex-shrink-0 transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("language")}
          className="absolute right-0 top-full z-[1200] mt-1.5 max-h-[60vh] w-44 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-card"
        >
          {LANGUAGES.map((lang) => {
            const selected = lang.code === locale;
            return (
              <li key={lang.code} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(lang.code)}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition " +
                    (selected
                      ? "bg-brand-light font-semibold text-brand"
                      : "text-ink hover:bg-bg")
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CountryFlag code={lang.country} />
                    <span className="truncate">{lang.label}</span>
                  </span>
                  {selected && (
                    <Check size={15} strokeWidth={2.5} className="flex-shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
