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
