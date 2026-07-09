// ─────────────────────────────────────────────────────────────
// continentGeo — 대륙별 중심좌표 + 줌 (2D/3D 포커싱 공용)
//
// 카테고리 트리에서 대륙을 클릭했을 때 지도/지구본을 그 대륙으로 이동시키는 데 쓴다.
// 대략적인 중심점이면 충분하다(정밀할 필요 없음). zoom 은 Leaflet 기준 값이며,
// 3D(Cesium)에서는 MapView 에서 카메라 높이로 환산해 사용한다.
//
// 대륙 코드: asia | europe | americas | africa | oceania | middleeast
//   (continentUtils / Firestore 의 continent 필드와 동일한 키)
// ─────────────────────────────────────────────────────────────

export const CONTINENT_GEO = {
  asia: { lat: 34, lng: 100, zoom: 3 },
  europe: { lat: 54, lng: 15, zoom: 4 },
  americas: { lat: 12, lng: -80, zoom: 3 },
  africa: { lat: 2, lng: 20, zoom: 3 },
  oceania: { lat: -25, lng: 140, zoom: 4 },
  middleeast: { lat: 29, lng: 45, zoom: 4 },
};
