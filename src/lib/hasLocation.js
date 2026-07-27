// ─────────────────────────────────────────────────────────────
// hasLocation — 마커가 "지역을 특정할 수 있는" 상태인지 판정 (서버 전용, 공용)
//
// 왜 필요한가 (2026-07-28):
//   자동 채널 스캔(Gemini)이 영상의 촬영 장소를 특정하지 못하면 continent/country 를
//   비워야 하는데(autoMarkerAi.js 규칙 6), 가끔 country 에 "XX" 같은 실존하지 않는
//   코드를 넣거나 엉뚱한 좌표를 지어내는 경우가 있다(예: ISS 라이브 채널이 country:"XX",
//   city:"Space" 로 저장돼 카테고리 트리에 "unknown ▸ XX ▸ Space" 로 노출된 사례).
//   이런 마커는 카테고리 트리(대륙→국가→도시)에서 "unknown" 가지를 만들어 혼란을 준다.
//
// 판정 기준: continent 가 비어있지 않은지만 확인한다.
//   - autoMarkerAi.js 는 country 가 getContinentByCountry() 로 실제 대륙에 매핑될 때만
//     continent 를 채운다(country:"XX" 처럼 매핑 안 되는 값이면 continent 는 이미 빈 문자열).
//     즉 continent 존재 여부가 곧 "장소를 실제로 특정했는지"의 신호다.
//   - 레거시 수동 마커의 continent:"americas"(북/남미 분리 전 값)도 "비어있지 않음"이라
//     정상적으로 통과한다(정규화는 별도 소비처(normalizeContinent)에서 처리).
//
// 공개 마커를 걸러내는 모든 지점(마커 인덱스·타겟 쿼리 폴백·단일 문서 조회)에서
// 이 함수 하나를 공유해서 써야 한다 — 한 곳만 고치면 다른 경로에서 재발한다
// (2026-07-16~21 Firestore 읽기 사고에서 반복된 패턴과 동일한 교훈).
// ─────────────────────────────────────────────────────────────

export function hasLocation(m) {
  return !!m && typeof m.continent === "string" && m.continent.trim() !== "";
}
