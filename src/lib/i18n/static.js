// ─────────────────────────────────────────────────────────────
// 정적(비-훅) 번역 헬퍼 — Leaflet/Cesium 팝업처럼 React 컨텍스트를 쓸 수 없는
// 명령형(imperative) DOM 코드에서 사용한다.
//
// 현재 언어는 LanguageProvider 가 <html lang> 에 항상 반영해 두므로 거기서 읽는다.
// ts(key): 현재 언어의 UI 문자열 (없으면 en → key).
//
// ⚠️ 팝업은 데이터 로드 시점에 만들어지므로, 이미 열린 팝업은 언어를 바꿔도 즉시
//    바뀌지 않는다(다시 열면 새 언어로 표시됨). 이 컴포넌트들은 데이터 갱신 시 재생성된다.
// ─────────────────────────────────────────────────────────────

import { messages } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/languages";

// <html lang> 에서 현재 언어를 읽어 지원 코드로 정규화
export function activeLocale() {
  try {
    if (typeof document === "undefined") return DEFAULT_LOCALE;
    return normalizeLocale(document.documentElement.lang) || DEFAULT_LOCALE;
  } catch (error) {
    return DEFAULT_LOCALE;
  }
}

export function ts(key) {
  try {
    const loc = activeLocale();
    const cur = messages[loc];
    if (cur && cur[key] != null) return cur[key];
    return (messages.en && messages.en[key]) || key;
  } catch (error) {
    return (messages.en && messages.en[key]) || key;
  }
}
