// ─────────────────────────────────────────────────────────────
// 지원 언어 정의 + 브라우저 언어 감지
//
// - LANGUAGES: 드롭다운에 표시할 언어 목록 (code, 각 언어의 "자기 언어 이름", RTL 여부)
// - DEFAULT_LOCALE: 감지 실패 시 최종 폴백 (영어)
// - detectBrowserLocale(): navigator.language(예: "ko-KR", "zh-CN")를 지원 코드로 매핑
//
// ⚠️ 여기 code 는 messages/continents 사전의 키와 정확히 일치해야 한다.
// ⚠️ RTL(오른쪽→왼쪽) 언어: 아랍어(ar), 페르시아어(fa) → <html dir="rtl">
// ─────────────────────────────────────────────────────────────

// 지원 언어 목록 (표시 순서 = 배열 순서). label 은 "그 언어로 쓴 자기 이름".
// flag 는 국기 이모지 — 여러 나라가 함께 쓰는 언어(영어/스페인어/포르투갈어/벵골어 등)는
// 업계 관행대로 화자 수가 가장 많거나 대표성이 큰 나라 하나를 임의로 골랐다(2026-07-30).
//   ⚠️ 중국어(zh)=중국, 아랍어(ar)=사우디아라비아 는 국가간 민감성이 있어 사용자에게
//      직접 확인 후 결정한 값이다(다른 선택지: 대만/중립 아이콘, UAE/중립 아이콘).
export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸", rtl: false },
  { code: "ko", label: "한국어", flag: "🇰🇷", rtl: false },
  { code: "ja", label: "日本語", flag: "🇯🇵", rtl: false },
  { code: "zh", label: "中文", flag: "🇨🇳", rtl: false },
  { code: "es", label: "Español", flag: "🇪🇸", rtl: false },
  { code: "fr", label: "Français", flag: "🇫🇷", rtl: false },
  { code: "de", label: "Deutsch", flag: "🇩🇪", rtl: false },
  { code: "it", label: "Italiano", flag: "🇮🇹", rtl: false },
  { code: "pt", label: "Português", flag: "🇧🇷", rtl: false },
  { code: "ru", label: "Русский", flag: "🇷🇺", rtl: false },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳", rtl: false },
  { code: "bn", label: "বাংলা", flag: "🇧🇩", rtl: false },
  { code: "th", label: "ไทย", flag: "🇹🇭", rtl: false },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳", rtl: false },
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩", rtl: false },
  { code: "ar", label: "العربية", flag: "🇸🇦", rtl: true },
  { code: "fa", label: "فارسی", flag: "🇮🇷", rtl: true },
];

// 빠른 조회용 코드 집합/맵
export const SUPPORTED_CODES = LANGUAGES.map((l) => l.code);
export const LANGUAGE_BY_CODE = LANGUAGES.reduce((acc, l) => {
  acc[l.code] = l;
  return acc;
}, {});

// 최종 폴백 언어 (지원하지 않는 브라우저 언어일 때)
export const DEFAULT_LOCALE = "en";
// localStorage 저장 키
export const LOCALE_STORAGE_KEY = "livecam_lang";

// 지원 코드로 정규화 (지원하면 그대로, 아니면 null)
export function normalizeLocale(code) {
  if (!code || typeof code !== "string") return null;
  const lower = code.trim().toLowerCase();
  // 정확히 일치
  if (SUPPORTED_CODES.includes(lower)) return lower;
  // "ko-KR" → "ko" 처럼 지역코드 앞부분만 사용
  const base = lower.split(/[-_]/)[0];
  if (SUPPORTED_CODES.includes(base)) return base;
  return null;
}

// ─── 브라우저/모바일 언어 설정 → 지원 언어 코드 ────────────────
// navigator.languages(선호 순서)를 앞에서부터 확인해 첫 지원 언어를 사용.
// 하나도 없으면 DEFAULT_LOCALE(영어).
export function detectBrowserLocale() {
  try {
    if (typeof navigator === "undefined") return DEFAULT_LOCALE;
    const candidates =
      Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
    for (const c of candidates) {
      const norm = normalizeLocale(c);
      if (norm) return norm;
    }
    return DEFAULT_LOCALE;
  } catch (error) {
    console.error("[i18n] 브라우저 언어 감지 실패:", error); // TODO: 배포 전 제거
    return DEFAULT_LOCALE;
  }
}
