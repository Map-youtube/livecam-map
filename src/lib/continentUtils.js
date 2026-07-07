// ─────────────────────────────────────────────────────────────
// 국가 → 대륙 자동 매핑 유틸리티
//
// getContinentByCountry(countryCode):
//   ISO 3166-1 alpha-2 국가코드(예: "JP", "FR", "US")를 받아
//   대륙 문자열(asia | europe | americas | africa | oceania | middleeast)을 반환한다.
//   매핑에 없는 코드는 null 반환.
//
// ⚠️ 대륙 값은 프로젝트 전역 규칙(Firestore continent 필드)과 정확히 일치해야 한다:
//    asia | europe | americas | africa | oceania | middleeast
//    (중동은 지리적으로 아시아에 속하지만, 본 서비스는 별도 대륙으로 분류한다.)
// ─────────────────────────────────────────────────────────────

// ─── 국가코드 → 대륙 매핑 테이블 ───────────────────────────────
// 대문자 alpha-2 코드를 키로 사용한다. 주요국 위주로 충분히 포함.
const COUNTRY_TO_CONTINENT = {
  // ─── 아시아 (asia) ───────────────────────────────────────────
  JP: "asia", // 일본
  KR: "asia", // 대한민국
  KP: "asia", // 북한
  CN: "asia", // 중국
  HK: "asia", // 홍콩
  MO: "asia", // 마카오
  TW: "asia", // 대만
  MN: "asia", // 몽골
  TH: "asia", // 태국
  VN: "asia", // 베트남
  LA: "asia", // 라오스
  KH: "asia", // 캄보디아
  MM: "asia", // 미얀마
  MY: "asia", // 말레이시아
  SG: "asia", // 싱가포르
  ID: "asia", // 인도네시아
  PH: "asia", // 필리핀
  BN: "asia", // 브루나이
  TL: "asia", // 동티모르
  IN: "asia", // 인도
  PK: "asia", // 파키스탄
  BD: "asia", // 방글라데시
  LK: "asia", // 스리랑카
  NP: "asia", // 네팔
  BT: "asia", // 부탄
  MV: "asia", // 몰디브
  AF: "asia", // 아프가니스탄
  KZ: "asia", // 카자흐스탄
  UZ: "asia", // 우즈베키스탄
  TM: "asia", // 투르크메니스탄
  KG: "asia", // 키르기스스탄
  TJ: "asia", // 타지키스탄

  // ─── 유럽 (europe) ───────────────────────────────────────────
  GB: "europe", // 영국
  IE: "europe", // 아일랜드
  FR: "europe", // 프랑스
  DE: "europe", // 독일
  IT: "europe", // 이탈리아
  ES: "europe", // 스페인
  PT: "europe", // 포르투갈
  NL: "europe", // 네덜란드
  BE: "europe", // 벨기에
  LU: "europe", // 룩셈부르크
  CH: "europe", // 스위스
  AT: "europe", // 오스트리아
  DK: "europe", // 덴마크
  SE: "europe", // 스웨덴
  NO: "europe", // 노르웨이
  FI: "europe", // 핀란드
  IS: "europe", // 아이슬란드
  PL: "europe", // 폴란드
  CZ: "europe", // 체코
  SK: "europe", // 슬로바키아
  HU: "europe", // 헝가리
  RO: "europe", // 루마니아
  BG: "europe", // 불가리아
  GR: "europe", // 그리스
  HR: "europe", // 크로아티아
  SI: "europe", // 슬로베니아
  RS: "europe", // 세르비아
  BA: "europe", // 보스니아 헤르체고비나
  ME: "europe", // 몬테네그로
  MK: "europe", // 북마케도니아
  AL: "europe", // 알바니아
  UA: "europe", // 우크라이나
  BY: "europe", // 벨라루스
  RU: "europe", // 러시아 (본 서비스는 유럽으로 분류)
  LT: "europe", // 리투아니아
  LV: "europe", // 라트비아
  EE: "europe", // 에스토니아
  MD: "europe", // 몰도바
  MT: "europe", // 몰타
  CY: "europe", // 키프로스
  GE: "europe", // 조지아
  AM: "europe", // 아르메니아
  AZ: "europe", // 아제르바이잔

  // ─── 아메리카 (americas) ─────────────────────────────────────
  US: "americas", // 미국
  CA: "americas", // 캐나다
  MX: "americas", // 멕시코
  GT: "americas", // 과테말라
  BZ: "americas", // 벨리즈
  SV: "americas", // 엘살바도르
  HN: "americas", // 온두라스
  NI: "americas", // 니카라과
  CR: "americas", // 코스타리카
  PA: "americas", // 파나마
  CU: "americas", // 쿠바
  DO: "americas", // 도미니카공화국
  HT: "americas", // 아이티
  JM: "americas", // 자메이카
  BS: "americas", // 바하마
  PR: "americas", // 푸에르토리코
  BR: "americas", // 브라질
  AR: "americas", // 아르헨티나
  CL: "americas", // 칠레
  CO: "americas", // 콜롬비아
  PE: "americas", // 페루
  VE: "americas", // 베네수엘라
  EC: "americas", // 에콰도르
  BO: "americas", // 볼리비아
  PY: "americas", // 파라과이
  UY: "americas", // 우루과이
  GY: "americas", // 가이아나
  SR: "americas", // 수리남

  // ─── 아프리카 (africa) ───────────────────────────────────────
  EG: "africa", // 이집트
  MA: "africa", // 모로코
  DZ: "africa", // 알제리
  TN: "africa", // 튀니지
  LY: "africa", // 리비아
  SD: "africa", // 수단
  ET: "africa", // 에티오피아
  KE: "africa", // 케냐
  TZ: "africa", // 탄자니아
  UG: "africa", // 우간다
  RW: "africa", // 르완다
  NG: "africa", // 나이지리아
  GH: "africa", // 가나
  CI: "africa", // 코트디부아르
  SN: "africa", // 세네갈
  ML: "africa", // 말리
  CM: "africa", // 카메룬
  CD: "africa", // 콩고민주공화국
  CG: "africa", // 콩고공화국
  AO: "africa", // 앙골라
  ZM: "africa", // 잠비아
  ZW: "africa", // 짐바브웨
  MZ: "africa", // 모잠비크
  BW: "africa", // 보츠와나
  NA: "africa", // 나미비아
  ZA: "africa", // 남아프리카공화국
  MG: "africa", // 마다가스카르
  MU: "africa", // 모리셔스
  SC: "africa", // 세이셸

  // ─── 오세아니아 (oceania) ────────────────────────────────────
  AU: "oceania", // 호주
  NZ: "oceania", // 뉴질랜드
  FJ: "oceania", // 피지
  PG: "oceania", // 파푸아뉴기니
  SB: "oceania", // 솔로몬제도
  VU: "oceania", // 바누아투
  NC: "oceania", // 뉴칼레도니아
  PF: "oceania", // 프랑스령 폴리네시아
  WS: "oceania", // 사모아
  TO: "oceania", // 통가
  KI: "oceania", // 키리바시
  FM: "oceania", // 미크로네시아
  PW: "oceania", // 팔라우
  MH: "oceania", // 마셜제도
  GU: "oceania", // 괌

  // ─── 중동 (middleeast) ───────────────────────────────────────
  // 지리적으로는 아시아지만 본 서비스에서는 별도 대륙으로 분류
  TR: "middleeast", // 튀르키예
  SA: "middleeast", // 사우디아라비아
  AE: "middleeast", // 아랍에미리트
  QA: "middleeast", // 카타르
  KW: "middleeast", // 쿠웨이트
  BH: "middleeast", // 바레인
  OM: "middleeast", // 오만
  YE: "middleeast", // 예멘
  IQ: "middleeast", // 이라크
  IR: "middleeast", // 이란
  SY: "middleeast", // 시리아
  JO: "middleeast", // 요르단
  LB: "middleeast", // 레바논
  IL: "middleeast", // 이스라엘
  PS: "middleeast", // 팔레스타인
};

// ─── 국가코드 → 대륙 조회 함수 ─────────────────────────────────
// countryCode: alpha-2 문자열 (대소문자 무관). 매핑 없으면 null.
export function getContinentByCountry(countryCode) {
  try {
    if (!countryCode || typeof countryCode !== "string") {
      return null;
    }

    // 대문자로 정규화하여 조회 (입력이 "jp"든 "JP"든 동일 처리)
    const code = countryCode.trim().toUpperCase();

    // 매핑에 존재하면 대륙 반환, 없으면 null
    return COUNTRY_TO_CONTINENT[code] || null;
  } catch (error) {
    // 예기치 못한 에러 시에도 안전하게 null 반환
    console.error("[continentUtils] getContinentByCountry 에러:", error); // TODO: 배포 전 제거
    return null;
  }
}
