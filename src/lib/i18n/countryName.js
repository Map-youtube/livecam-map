// ─────────────────────────────────────────────────────────────
// 국가명 다국어 변환 — 브라우저 내장 Intl.DisplayNames 사용 (무료, 사전 불필요)
//
// getCountryName("JP", "ja") → "日本",  getCountryName("JP", "en") → "Japan"
// ISO 3166-1 alpha-2 코드를 현재 언어의 국가명으로 변환한다.
// 실패(구형 브라우저/미지원 코드) 시 한국어 사전(COUNTRY_NAME_BY_CODE) → 코드 순으로 폴백.
// ─────────────────────────────────────────────────────────────

import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";

// locale 별 DisplayNames 인스턴스 캐시 (매번 생성 비용 방지)
const displayNamesCache = {};

function getDisplayNames(locale) {
  try {
    if (typeof Intl === "undefined" || !Intl.DisplayNames) return null;
    if (!displayNamesCache[locale]) {
      displayNamesCache[locale] = new Intl.DisplayNames([locale], {
        type: "region",
      });
    }
    return displayNamesCache[locale];
  } catch (error) {
    console.error("[i18n] DisplayNames 생성 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

export function getCountryName(code, locale) {
  try {
    if (!code || typeof code !== "string") return "";
    const upper = code.trim().toUpperCase();
    const dn = getDisplayNames(locale);
    if (dn) {
      const name = dn.of(upper);
      // DisplayNames 는 미지원 코드에 대해 코드 자체를 돌려주기도 하므로 그대로 사용해도 안전
      if (name) return name;
    }
    // 폴백: 한국어 사전 → 코드
    return COUNTRY_NAME_BY_CODE[upper] || upper;
  } catch (error) {
    console.error("[i18n] 국가명 변환 실패:", error); // TODO: 배포 전 제거
    return COUNTRY_NAME_BY_CODE[code] || code;
  }
}
