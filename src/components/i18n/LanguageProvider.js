"use client";

// ─────────────────────────────────────────────────────────────
// LanguageProvider — 전역 언어 상태 (React Context)
//
// 제공 값:
//   - locale      : 현재 언어 코드 (예: "ko", "en", "ar")
//   - setLocale   : 언어 변경 (localStorage 저장 + <html lang/dir> 갱신)
//   - t(key)      : UI 문자열 번역 (messages 사전, 폴백 en → key)
//   - tContinent(key): 대륙 라벨 번역
//   - countryName(code): 국가명 번역 (Intl.DisplayNames)
//   - dir         : "ltr" | "rtl" (아랍어/페르시아어는 rtl)
//
// 기본 언어 결정 (요구사항 3):
//   1) 사용자가 이전에 고른 언어(localStorage) 있으면 그것
//   2) 없으면 브라우저/모바일 언어 설정(navigator.languages)에서 지원 언어 자동 선택
//   3) 그래도 없으면 영어
//
// SSR 안전: 서버 렌더는 항상 DEFAULT_LOCALE 로 하고, 마운트 후 useEffect 에서
//   실제 언어로 보정한다(하이드레이션 불일치 방지). 첫 페인트가 잠깐 기본어일 수 있음.
// ─────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { messages } from "@/lib/i18n/messages";
import { getContinentLabel } from "@/lib/i18n/continents";
import { getCountryName } from "@/lib/i18n/countryName";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LANGUAGE_BY_CODE,
  detectBrowserLocale,
  normalizeLocale,
} from "@/lib/i18n/languages";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // 서버/첫 클라이언트 렌더는 기본어로 통일(하이드레이션 안전)
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  // 마운트 후: 저장된 언어 또는 브라우저 언어로 보정
  useEffect(() => {
    try {
      let next = null;
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      next = normalizeLocale(saved);
      if (!next) next = detectBrowserLocale();
      if (next && next !== locale) setLocaleState(next);
    } catch (error) {
      console.error("[i18n] 초기 언어 결정 실패:", error); // TODO: 배포 전 제거
    }
    // 최초 1회만 실행 (locale 은 의도적으로 의존성에서 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // locale 이 바뀔 때마다 <html lang/dir> 갱신 (RTL 포함)
  useEffect(() => {
    try {
      const info = LANGUAGE_BY_CODE[locale];
      const dir = info && info.rtl ? "rtl" : "ltr";
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    } catch (error) {
      console.error("[i18n] html lang/dir 갱신 실패:", error); // TODO: 배포 전 제거
    }
  }, [locale]);

  // 언어 변경 (드롭다운에서 호출) — 저장 + 상태 갱신
  const setLocale = useCallback((code) => {
    try {
      const next = normalizeLocale(code) || DEFAULT_LOCALE;
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      setLocaleState(next);
    } catch (error) {
      console.error("[i18n] 언어 변경 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  // UI 문자열 번역 (현재어 → en → key)
  const t = useCallback(
    (key) => {
      const cur = messages[locale];
      if (cur && cur[key] != null) return cur[key];
      if (messages.en && messages.en[key] != null) return messages.en[key];
      return key;
    },
    [locale]
  );

  // 대륙 라벨 번역
  const tContinent = useCallback(
    (key) => getContinentLabel(key, locale),
    [locale]
  );

  // 국가명 번역 (Intl.DisplayNames)
  const countryName = useCallback((code) => getCountryName(code, locale), [
    locale,
  ]);

  const dir = useMemo(() => {
    const info = LANGUAGE_BY_CODE[locale];
    return info && info.rtl ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, tContinent, countryName, dir }),
    [locale, setLocale, t, tContinent, countryName, dir]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// 훅: 컴포넌트에서 번역/언어 상태 사용
export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Provider 밖에서 호출 시 안전한 기본값(영어) 반환 — 앱이 죽지 않게
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key) => (messages.en && messages.en[key]) || key,
      tContinent: (key) => getContinentLabel(key, DEFAULT_LOCALE),
      countryName: (code) => getCountryName(code, DEFAULT_LOCALE),
      dir: "ltr",
    };
  }
  return ctx;
}
