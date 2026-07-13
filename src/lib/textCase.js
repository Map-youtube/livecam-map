// ─────────────────────────────────────────────────────────────
// textCase — 표시용 대소문자 서식 유틸 (클라이언트/서버 공용, API 비용 없음)
//
// capitalizeWords: 각 "단어"의 첫 글자만 대문자로 만든다.
//   - 라틴/키릴 등 대소문자가 있는 알파벳 문자에만 실제로 적용된다.
//   - 이미 대문자인 글자나 나머지 글자는 건드리지 않는다 → "ISS", "NASA" 같은 약어는 그대로 유지.
//   - 한글/한자/가나 등 대소문자가 없는 문자는 변화 없음(그대로).
//
// 용도: 자동번역(Google Translate)이 일반명사를 소문자로 돌려줄 때
//       (예: 방송→"broadcast") 카테고리/이름을 도시명처럼 첫 글자 대문자로 보이게 한다.
// ─────────────────────────────────────────────────────────────

export function capitalizeWords(text) {
  try {
    if (typeof text !== "string" || !text) return text;
    // 문자열 시작 또는 공백 뒤의 "첫 글자(letter)"만 대문자로. 나머지는 원본 그대로.
    // \p{L} = 유니코드 글자, u 플래그로 유니코드 처리. CJK 는 toUpperCase 가 no-op 이라 안전.
    return text.replace(
      /(^|\s)(\p{L})/gu,
      (m, sep, ch) => sep + ch.toUpperCase()
    );
  } catch (error) {
    // 정규식/유니코드 지원 문제 등 예외 시 원본 그대로 반환
    return text;
  }
}
