// ─────────────────────────────────────────────────────────────
// 국가 목록 (공용)
//
// value(code) = ISO 3166-1 alpha-2 국가코드(대문자), name = 한국어 국가명.
// ⚠️ 여기 코드들은 continentUtils 의 매핑에 존재해야 대륙 자동 계산이 동작한다.
//
// 관리자 등록 폼(MarkerForm)과 메인 화면 카테고리 트리(MainCategoryTree) 등에서 공용으로 사용한다.
// ─────────────────────────────────────────────────────────────

export const COUNTRIES = [
  { code: "KR", name: "대한민국" },
  { code: "JP", name: "일본" },
  { code: "CN", name: "중국" },
  { code: "TW", name: "대만" },
  { code: "HK", name: "홍콩" },
  { code: "TH", name: "태국" },
  { code: "VN", name: "베트남" },
  { code: "SG", name: "싱가포르" },
  { code: "ID", name: "인도네시아" },
  { code: "PH", name: "필리핀" },
  { code: "MY", name: "말레이시아" },
  { code: "IN", name: "인도" },
  { code: "US", name: "미국" },
  { code: "CA", name: "캐나다" },
  { code: "MX", name: "멕시코" },
  { code: "BR", name: "브라질" },
  { code: "AR", name: "아르헨티나" },
  { code: "GB", name: "영국" },
  { code: "FR", name: "프랑스" },
  { code: "DE", name: "독일" },
  { code: "IT", name: "이탈리아" },
  { code: "ES", name: "스페인" },
  { code: "NL", name: "네덜란드" },
  { code: "CH", name: "스위스" },
  { code: "AU", name: "호주" },
  { code: "NZ", name: "뉴질랜드" },
  { code: "AE", name: "아랍에미리트" },
  { code: "TR", name: "튀르키예" },
  { code: "EG", name: "이집트" },
  { code: "ZA", name: "남아프리카공화국" },
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
// ⚠️ COUNTRIES 의 모든 코드가 여기 포함되어야 국가 선택 시 항상 지도가 이동한다.
// ─────────────────────────────────────────────────────────────
export const COUNTRY_GEO = {
  KR: { lat: 36.5, lng: 127.9, zoom: 7 }, // 대한민국
  JP: { lat: 37.5, lng: 138.0, zoom: 5 }, // 일본
  CN: { lat: 35.0, lng: 104.0, zoom: 4 }, // 중국
  TW: { lat: 23.7, lng: 121.0, zoom: 7 }, // 대만
  HK: { lat: 22.32, lng: 114.17, zoom: 10 }, // 홍콩
  TH: { lat: 15.0, lng: 101.0, zoom: 6 }, // 태국
  VN: { lat: 16.0, lng: 106.0, zoom: 6 }, // 베트남
  SG: { lat: 1.35, lng: 103.82, zoom: 11 }, // 싱가포르
  ID: { lat: -2.5, lng: 118.0, zoom: 5 }, // 인도네시아
  PH: { lat: 12.8, lng: 122.0, zoom: 6 }, // 필리핀
  MY: { lat: 4.2, lng: 101.9, zoom: 6 }, // 말레이시아
  IN: { lat: 22.0, lng: 79.0, zoom: 5 }, // 인도
  US: { lat: 39.5, lng: -98.35, zoom: 4 }, // 미국
  CA: { lat: 56.0, lng: -106.0, zoom: 4 }, // 캐나다
  MX: { lat: 23.6, lng: -102.5, zoom: 5 }, // 멕시코
  BR: { lat: -14.2, lng: -51.9, zoom: 4 }, // 브라질
  AR: { lat: -38.4, lng: -63.6, zoom: 4 }, // 아르헨티나
  GB: { lat: 54.0, lng: -2.0, zoom: 6 }, // 영국
  FR: { lat: 46.6, lng: 2.2, zoom: 6 }, // 프랑스
  DE: { lat: 51.2, lng: 10.4, zoom: 6 }, // 독일
  IT: { lat: 42.5, lng: 12.5, zoom: 6 }, // 이탈리아
  ES: { lat: 40.0, lng: -3.7, zoom: 6 }, // 스페인
  NL: { lat: 52.2, lng: 5.3, zoom: 7 }, // 네덜란드
  CH: { lat: 46.8, lng: 8.2, zoom: 8 }, // 스위스
  AU: { lat: -25.3, lng: 133.8, zoom: 4 }, // 호주
  NZ: { lat: -41.0, lng: 174.0, zoom: 5 }, // 뉴질랜드
  AE: { lat: 24.0, lng: 54.0, zoom: 7 }, // 아랍에미리트
  TR: { lat: 39.0, lng: 35.0, zoom: 6 }, // 튀르키예
  EG: { lat: 26.8, lng: 30.8, zoom: 6 }, // 이집트
  ZA: { lat: -30.6, lng: 22.9, zoom: 5 }, // 남아프리카공화국
};
