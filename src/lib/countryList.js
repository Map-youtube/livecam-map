// ─────────────────────────────────────────────────────────────
// 국가 목록 (공용)
//
// value(code) = ISO 3166-1 alpha-2 국가코드(대문자), name = 한국어 국가명.
// ⚠️ 여기 코드들은 continentUtils 의 매핑에 존재해야 대륙 자동 계산이 동작한다.
//
// 관리자 등록 폼(MarkerForm)과 메인 화면 카테고리 트리(MainCategoryTree) 등에서 공용으로 사용한다.
// ─────────────────────────────────────────────────────────────

// ⚠️ 아래 목록의 국가코드는 continentUtils 의 COUNTRY_TO_CONTINENT 매핑과 1:1로 일치한다.
//    (대륙 선택 시 "해당 대륙에 포함되는 모든 국가"가 등록 폼 드롭다운에 표시되도록,
//     continentUtils 에 매핑된 모든 국가를 여기에 이름과 함께 등록해 둔다.)
export const COUNTRIES = [
  // ─── 아시아 (asia) ───────────────────────────────────────────
  { code: "KR", name: "대한민국" },
  { code: "JP", name: "일본" },
  { code: "KP", name: "북한" },
  { code: "CN", name: "중국" },
  { code: "HK", name: "홍콩" },
  { code: "MO", name: "마카오" },
  { code: "TW", name: "대만" },
  { code: "MN", name: "몽골" },
  { code: "TH", name: "태국" },
  { code: "VN", name: "베트남" },
  { code: "LA", name: "라오스" },
  { code: "KH", name: "캄보디아" },
  { code: "MM", name: "미얀마" },
  { code: "MY", name: "말레이시아" },
  { code: "SG", name: "싱가포르" },
  { code: "ID", name: "인도네시아" },
  { code: "PH", name: "필리핀" },
  { code: "BN", name: "브루나이" },
  { code: "TL", name: "동티모르" },
  { code: "IN", name: "인도" },
  { code: "PK", name: "파키스탄" },
  { code: "BD", name: "방글라데시" },
  { code: "LK", name: "스리랑카" },
  { code: "NP", name: "네팔" },
  { code: "BT", name: "부탄" },
  { code: "MV", name: "몰디브" },
  { code: "AF", name: "아프가니스탄" },
  { code: "KZ", name: "카자흐스탄" },
  { code: "UZ", name: "우즈베키스탄" },
  { code: "TM", name: "투르크메니스탄" },
  { code: "KG", name: "키르기스스탄" },
  { code: "TJ", name: "타지키스탄" },

  // ─── 유럽 (europe) ───────────────────────────────────────────
  { code: "GB", name: "영국" },
  { code: "IE", name: "아일랜드" },
  { code: "FR", name: "프랑스" },
  { code: "DE", name: "독일" },
  { code: "IT", name: "이탈리아" },
  { code: "ES", name: "스페인" },
  { code: "PT", name: "포르투갈" },
  { code: "NL", name: "네덜란드" },
  { code: "BE", name: "벨기에" },
  { code: "LU", name: "룩셈부르크" },
  { code: "CH", name: "스위스" },
  { code: "AT", name: "오스트리아" },
  { code: "DK", name: "덴마크" },
  { code: "SE", name: "스웨덴" },
  { code: "NO", name: "노르웨이" },
  { code: "FI", name: "핀란드" },
  { code: "IS", name: "아이슬란드" },
  { code: "PL", name: "폴란드" },
  { code: "CZ", name: "체코" },
  { code: "SK", name: "슬로바키아" },
  { code: "HU", name: "헝가리" },
  { code: "RO", name: "루마니아" },
  { code: "BG", name: "불가리아" },
  { code: "GR", name: "그리스" },
  { code: "HR", name: "크로아티아" },
  { code: "SI", name: "슬로베니아" },
  { code: "RS", name: "세르비아" },
  { code: "BA", name: "보스니아 헤르체고비나" },
  { code: "ME", name: "몬테네그로" },
  { code: "MK", name: "북마케도니아" },
  { code: "AL", name: "알바니아" },
  { code: "UA", name: "우크라이나" },
  { code: "BY", name: "벨라루스" },
  { code: "RU", name: "러시아" },
  { code: "LT", name: "리투아니아" },
  { code: "LV", name: "라트비아" },
  { code: "EE", name: "에스토니아" },
  { code: "MD", name: "몰도바" },
  { code: "MT", name: "몰타" },
  { code: "CY", name: "키프로스" },
  { code: "GE", name: "조지아" },
  { code: "AM", name: "아르메니아" },
  { code: "AZ", name: "아제르바이잔" },

  // ─── 북아메리카 (north_america) ──────────────────────────────
  { code: "US", name: "미국" },
  { code: "CA", name: "캐나다" },
  { code: "MX", name: "멕시코" },
  { code: "GT", name: "과테말라" },
  { code: "BZ", name: "벨리즈" },
  { code: "SV", name: "엘살바도르" },
  { code: "HN", name: "온두라스" },
  { code: "NI", name: "니카라과" },
  { code: "CR", name: "코스타리카" },
  { code: "PA", name: "파나마" },
  { code: "CU", name: "쿠바" },
  { code: "DO", name: "도미니카공화국" },
  { code: "HT", name: "아이티" },
  { code: "JM", name: "자메이카" },
  { code: "BS", name: "바하마" },
  { code: "PR", name: "푸에르토리코" },

  // ─── 남아메리카 (south_america) ──────────────────────────────
  { code: "BR", name: "브라질" },
  { code: "AR", name: "아르헨티나" },
  { code: "CL", name: "칠레" },
  { code: "CO", name: "콜롬비아" },
  { code: "PE", name: "페루" },
  { code: "VE", name: "베네수엘라" },
  { code: "EC", name: "에콰도르" },
  { code: "BO", name: "볼리비아" },
  { code: "PY", name: "파라과이" },
  { code: "UY", name: "우루과이" },
  { code: "GY", name: "가이아나" },
  { code: "SR", name: "수리남" },

  // ─── 아프리카 (africa) ───────────────────────────────────────
  { code: "EG", name: "이집트" },
  { code: "MA", name: "모로코" },
  { code: "DZ", name: "알제리" },
  { code: "TN", name: "튀니지" },
  { code: "LY", name: "리비아" },
  { code: "SD", name: "수단" },
  { code: "ET", name: "에티오피아" },
  { code: "KE", name: "케냐" },
  { code: "TZ", name: "탄자니아" },
  { code: "UG", name: "우간다" },
  { code: "RW", name: "르완다" },
  { code: "NG", name: "나이지리아" },
  { code: "GH", name: "가나" },
  { code: "CI", name: "코트디부아르" },
  { code: "SN", name: "세네갈" },
  { code: "ML", name: "말리" },
  { code: "CM", name: "카메룬" },
  { code: "CD", name: "콩고민주공화국" },
  { code: "CG", name: "콩고공화국" },
  { code: "AO", name: "앙골라" },
  { code: "ZM", name: "잠비아" },
  { code: "ZW", name: "짐바브웨" },
  { code: "MZ", name: "모잠비크" },
  { code: "BW", name: "보츠와나" },
  { code: "NA", name: "나미비아" },
  { code: "ZA", name: "남아프리카공화국" },
  { code: "MG", name: "마다가스카르" },
  { code: "MU", name: "모리셔스" },
  { code: "SC", name: "세이셸" },

  // ─── 오세아니아 (oceania) ────────────────────────────────────
  { code: "AU", name: "호주" },
  { code: "NZ", name: "뉴질랜드" },
  { code: "FJ", name: "피지" },
  { code: "PG", name: "파푸아뉴기니" },
  { code: "SB", name: "솔로몬제도" },
  { code: "VU", name: "바누아투" },
  { code: "NC", name: "뉴칼레도니아" },
  { code: "PF", name: "프랑스령 폴리네시아" },
  { code: "WS", name: "사모아" },
  { code: "TO", name: "통가" },
  { code: "KI", name: "키리바시" },
  { code: "FM", name: "미크로네시아" },
  { code: "PW", name: "팔라우" },
  { code: "MH", name: "마셜제도" },
  { code: "GU", name: "괌" },

  // ─── 중동 (middleeast) ───────────────────────────────────────
  { code: "TR", name: "튀르키예" },
  { code: "SA", name: "사우디아라비아" },
  { code: "AE", name: "아랍에미리트" },
  { code: "QA", name: "카타르" },
  { code: "KW", name: "쿠웨이트" },
  { code: "BH", name: "바레인" },
  { code: "OM", name: "오만" },
  { code: "YE", name: "예멘" },
  { code: "IQ", name: "이라크" },
  { code: "IR", name: "이란" },
  { code: "SY", name: "시리아" },
  { code: "JO", name: "요르단" },
  { code: "LB", name: "레바논" },
  { code: "IL", name: "이스라엘" },
  { code: "PS", name: "팔레스타인" },
];

// 코드 → 한국어명 빠른 조회 맵
export const COUNTRY_NAME_BY_CODE = COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c.name;
  return acc;
}, {});

// ─────────────────────────────────────────────────────────────
// 국가코드 → 지도 포커싱 좌표/줌
//
// 관리자 등록 폼에서 국가를 선택하면 "그 국가 전체가 보이도록" 지도를 이동/확대하는 데 쓴다.
// (마커 위치를 클릭하기 전, 해당 국가 근처로 빠르게 이동시켜 등록 시간을 줄인다)
// lat/lng = 국가 대략 중심, zoom = 국가 전체가 보이는 정도(큰 나라일수록 작게).
// ℹ️ 주요국 위주로만 좌표를 두었다. 여기 없는 국가를 선택하면 지도 자동 이동만 생략되고
//    (MarkerForm 이 geo 존재 여부를 확인 후 이동) 국가 선택/등록 자체는 정상 동작한다.
// ─────────────────────────────────────────────────────────────
// lat/lng/zoom = (폴백용) 중심좌표+줌. west/south/east/north = 대략적인 국경 경계 사각형.
// 3D/2D 모두 경계 사각형이 있으면 그 나라가 화면에 꽉 차도록 이동한다(정밀 측량 불필요).
export const COUNTRY_GEO = {
  KR: { lat: 36.5, lng: 127.9, zoom: 7, west: 124.5, south: 33, east: 131, north: 39 }, // 대한민국
  JP: { lat: 37.5, lng: 138.0, zoom: 5, west: 129, south: 30, east: 146, north: 46 }, // 일본
  CN: { lat: 35.0, lng: 104.0, zoom: 4, west: 73, south: 18, east: 135, north: 54 }, // 중국
  TW: { lat: 23.7, lng: 121.0, zoom: 7, west: 119.5, south: 21.5, east: 122.5, north: 25.5 }, // 대만
  HK: { lat: 22.32, lng: 114.17, zoom: 10, west: 113.8, south: 22.1, east: 114.5, north: 22.6 }, // 홍콩
  TH: { lat: 15.0, lng: 101.0, zoom: 6, west: 97, south: 5.5, east: 106, north: 20.5 }, // 태국
  VN: { lat: 16.0, lng: 106.0, zoom: 6, west: 102, south: 8, east: 110, north: 23.5 }, // 베트남
  SG: { lat: 1.35, lng: 103.82, zoom: 11, west: 103.6, south: 1.2, east: 104.1, north: 1.5 }, // 싱가포르
  ID: { lat: -2.5, lng: 118.0, zoom: 5, west: 95, south: -11, east: 141, north: 6 }, // 인도네시아
  PH: { lat: 12.8, lng: 122.0, zoom: 6, west: 117, south: 5, east: 127, north: 19 }, // 필리핀
  MY: { lat: 4.2, lng: 101.9, zoom: 6, west: 99, south: 0.8, east: 119.5, north: 7.5 }, // 말레이시아
  IN: { lat: 22.0, lng: 79.0, zoom: 5, west: 68, south: 6, east: 97.5, north: 35.5 }, // 인도
  US: { lat: 39.5, lng: -98.35, zoom: 4, west: -125, south: 24, east: -66, north: 49 }, // 미국(본토)
  CA: { lat: 56.0, lng: -106.0, zoom: 4, west: -141, south: 42, east: -52, north: 70 }, // 캐나다
  MX: { lat: 23.6, lng: -102.5, zoom: 5, west: -118, south: 14, east: -86, north: 33 }, // 멕시코
  BR: { lat: -14.2, lng: -51.9, zoom: 4, west: -74, south: -34, east: -34, north: 5.5 }, // 브라질
  AR: { lat: -38.4, lng: -63.6, zoom: 4, west: -74, south: -55, east: -53, north: -21 }, // 아르헨티나
  GB: { lat: 54.0, lng: -2.0, zoom: 6, west: -8.5, south: 49.8, east: 2, north: 59 }, // 영국
  FR: { lat: 46.6, lng: 2.2, zoom: 6, west: -5, south: 41, east: 10, north: 51.5 }, // 프랑스
  DE: { lat: 51.2, lng: 10.4, zoom: 6, west: 5.8, south: 47, east: 15.1, north: 55.1 }, // 독일
  IT: { lat: 42.5, lng: 12.5, zoom: 6, west: 6.6, south: 36.5, east: 18.6, north: 47.1 }, // 이탈리아
  ES: { lat: 40.0, lng: -3.7, zoom: 6, west: -9.5, south: 36, east: 3.5, north: 44 }, // 스페인
  NL: { lat: 52.2, lng: 5.3, zoom: 7, west: 3.3, south: 50.7, east: 7.3, north: 53.6 }, // 네덜란드
  CH: { lat: 46.8, lng: 8.2, zoom: 8, west: 5.9, south: 45.8, east: 10.5, north: 47.9 }, // 스위스
  AU: { lat: -25.3, lng: 133.8, zoom: 4, west: 113, south: -44, east: 154, north: -10 }, // 호주
  NZ: { lat: -41.0, lng: 174.0, zoom: 5, west: 166, south: -47.5, east: 179, north: -34 }, // 뉴질랜드
  AE: { lat: 24.0, lng: 54.0, zoom: 7, west: 51, south: 22.5, east: 56.5, north: 26.2 }, // 아랍에미리트
  TR: { lat: 39.0, lng: 35.0, zoom: 6, west: 26, south: 36, east: 45, north: 42 }, // 튀르키예
  EG: { lat: 26.8, lng: 30.8, zoom: 6, west: 25, south: 22, east: 37, north: 32 }, // 이집트
  ZA: { lat: -30.6, lng: 22.9, zoom: 5, west: 16, south: -35, east: 33, north: -22 }, // 남아프리카공화국
};
