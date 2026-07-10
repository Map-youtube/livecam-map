// ─────────────────────────────────────────────────────────────
// continentGeo — 대륙별 중심좌표 + 줌 (2D/3D 포커싱 공용)
//
// 카테고리 트리에서 대륙을 클릭했을 때 지도/지구본을 그 대륙으로 이동시키는 데 쓴다.
// 대략적인 중심점이면 충분하다(정밀할 필요 없음). zoom 은 Leaflet 기준 값이며,
// 3D(Cesium)에서는 MapView 에서 카메라 높이로 환산해 사용한다.
//
// 대륙 코드: asia | europe | americas | africa | oceania | middleeast
//   (continentUtils / Firestore 의 continent 필드와 동일한 키)
//
// lat/lng/zoom = (폴백용) 중심좌표+줌.  west/south/east/north = 경계 사각형(대략).
// 3D/2D 모두 경계 사각형이 있으면 "영역 전체가 화면에 맞게" 보이도록 이동한다(정밀할 필요 없음).
// ─────────────────────────────────────────────────────────────

export const CONTINENT_GEO = {
  asia: { lat: 34, lng: 100, zoom: 3, west: 25, south: -11, east: 180, north: 78 },
  europe: { lat: 54, lng: 15, zoom: 4, west: -25, south: 34, east: 45, north: 72 },
  americas: { lat: 12, lng: -80, zoom: 3, west: -170, south: -56, east: -34, north: 72 },
  africa: { lat: 2, lng: 20, zoom: 3, west: -18, south: -35, east: 52, north: 38 },
  oceania: { lat: -25, lng: 140, zoom: 4, west: 110, south: -50, east: 179, north: 0 },
  middleeast: { lat: 29, lng: 45, zoom: 4, west: 25, south: 12, east: 63, north: 42 },
};
