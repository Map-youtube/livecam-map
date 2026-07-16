// ─────────────────────────────────────────────────────────────
// cityUtils — 도시명 표준화 (트리/번역에서 같은 도시가 대소문자·언어로
//   갈라지지 않게 저장·그룹핑 시 하나의 표준형으로 맞춘다).
//
// 사이트 표준: '영어'. (저장된 도시명의 98%가 영어, 자동 마커 AI(Gemini)도 영어 출력,
//   한국어 UI 도 이미 대부분 도시를 영어로 표시하므로 영어로 통일한다.)
//
// ⚠️ 설계 원칙: '보수적으로'. 실제 문제(한글/영어 혼재, 소문자 시작)만 고치고
//    그 외 표기는 건드리지 않는다. (과거에 전 단어 Title Case 로 바꿨더니
//    'Rio de Janeiro'→'Rio De Janeiro', 미국 주 약자 'FL'→'Fl' 처럼 오히려 망가졌음.)
//   - 한글 주요 도시 → 영어 매핑(서울→Seoul 등).
//   - 2글자 코드(미국 주 약자 FL/CA/NY 등)는 대문자로 유지.
//   - 첫 글자가 소문자면 그 글자만 대문자로(seoul→Seoul). 내부 단어 casing 은 보존.
//   - 그 외(이미 정상인 영어, 매핑 없는 한글 등)는 그대로 둔다.
//
// 어디서 쓰나:
//   - 저장 시: 자동 마커 스캔(autoMarkerScan), 수동 마커 등록/수정(markers route),
//     자동 마커 수정(auto-channels/markers) → stored city 를 표준형으로. (재발 방지)
//   - 그룹핑 시: 카테고리 트리에서 도시 묶을 때. (저장된 변형도 화면에서 합쳐지도록)
// ─────────────────────────────────────────────────────────────

// 자주 쓰이는 한글 도시명 → 영어(통용 표기). 과거 데이터 정리 + 관리자 한글 입력 대비.
const KO_TO_EN_CITY = {
  서울: "Seoul",
  부산: "Busan",
  인천: "Incheon",
  대구: "Daegu",
  대전: "Daejeon",
  광주: "Gwangju",
  울산: "Ulsan",
  세종: "Sejong",
  제주: "Jeju",
  수원: "Suwon",
  성남: "Seongnam",
  용인: "Yongin",
  고양: "Goyang",
  창원: "Changwon",
  청주: "Cheongju",
  전주: "Jeonju",
  천안: "Cheonan",
  포항: "Pohang",
  속초: "Sokcho",
  강릉: "Gangneung",
  경주: "Gyeongju",
  여수: "Yeosu",
  // 해외 주요(관리자 한글 입력 대비)
  도쿄: "Tokyo",
  오사카: "Osaka",
  교토: "Kyoto",
  삿포로: "Sapporo",
  파리: "Paris",
  런던: "London",
  뉴욕: "New York",
  방콕: "Bangkok",
  타이베이: "Taipei",
  홍콩: "Hong Kong",
  싱가포르: "Singapore",
};

// 도시명 표준형 반환 (보수적).
export function normalizeCityName(city) {
  const s = String(city || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  // 1) 한글 주요 도시 → 영어 매핑
  if (KO_TO_EN_CITY[s]) return KO_TO_EN_CITY[s];
  // 2) 2글자 코드(미국 주 약자 등)는 대문자 유지: FL, CA, NY
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  // 3) 한글이 아니고 첫 글자가 소문자면 → 첫 글자만 대문자(seoul→Seoul, av.pucara→Av.pucara).
  //    내부 단어 casing 은 건드리지 않는다(Rio de Janeiro, New York, McCity 보존 → 오변환 방지).
  const hasHangul = /[ㄱ-힣]/.test(s);
  if (!hasHangul && /^[a-z]/.test(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // 4) 그 외는 그대로 둔다
  return s;
}
