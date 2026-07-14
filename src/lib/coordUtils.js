// ─────────────────────────────────────────────────────────────
// coordUtils — 2D(Leaflet)/3D(Cesium) 좌표 변환 공용 유틸
//
// 지도 종류(2D/3D)와 무관하게 좌표를 "한 곳"에서 변환하도록 모은다.
// 직접 [lat,lng] 배열이나 fromDegrees(lng,lat) 를 여기저기서 조합하면
// 경도/위도 순서를 헷갈리기 쉬우므로(라이브러리마다 반대), 반드시 이 함수를 거친다.
//
//   - Leaflet: [위도(lat), 경도(lng)]
//   - Cesium : Cartesian3.fromDegrees(경도(lng), 위도(lat), 높이(m))  ← 순서 반대 + 높이(m)
//
// Raw 계열: 위도/경도(숫자)를 인자로 직접 받는다.
// 비-Raw 계열: { lat, lng, (altKm) } 형태의 객체를 받는다.
// ─────────────────────────────────────────────────────────────

// ─── Leaflet 좌표 ─────────────────────────────────────────────
// 위도/경도(숫자) → Leaflet [lat, lng]
export function toLeafletCoordRaw(lat, lng) {
  try {
    return [Number(lat), Number(lng)];
  } catch (error) {
    console.error("[coordUtils] toLeafletCoordRaw 실패:", error); // TODO: 배포 전 제거
    return [0, 0];
  }
}

// { lat, lng } 객체 → Leaflet [lat, lng]
export function toLeafletCoord(point) {
  try {
    if (!point) return [0, 0];
    return toLeafletCoordRaw(point.lat, point.lng);
  } catch (error) {
    console.error("[coordUtils] toLeafletCoord 실패:", error); // TODO: 배포 전 제거
    return [0, 0];
  }
}

// ─── Cesium 좌표 (Cesium 은 인자로 주입 — 번들 결합 방지) ──────
// 위도/경도(숫자) + 고도(km) → Cesium.Cartesian3.fromDegrees(lng, lat, m)
export function toCesiumCoordRaw(Cesium, lat, lng, altKm = 0) {
  try {
    if (!Cesium || !Cesium.Cartesian3) return null;
    const heightM = (Number(altKm) || 0) * 1000;
    return Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat), heightM);
  } catch (error) {
    console.error("[coordUtils] toCesiumCoordRaw 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// { lat, lng, altKm? } 객체 → Cesium.Cartesian3
export function toCesiumCoord(Cesium, point) {
  try {
    if (!point) return null;
    return toCesiumCoordRaw(Cesium, point.lat, point.lng, point.altKm || 0);
  } catch (error) {
    console.error("[coordUtils] toCesiumCoord 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 경계 사각형 → Cesium.Rectangle (Cesium 은 인자로 주입) ──
// { west, south, east, north }(도 단위) → Cesium.Rectangle.fromDegrees(west, south, east, north)
// 대륙/국가 이동 시 이 사각형을 카메라 destination 으로 주면 영역이 화면에 꽉 차게 자동 계산된다.
export function toCesiumRectangle(Cesium, bounds) {
  try {
    if (!Cesium || !Cesium.Rectangle || !bounds) return null;
    const { west, south, east, north } = bounds;
    if (
      typeof west !== "number" ||
      typeof south !== "number" ||
      typeof east !== "number" ||
      typeof north !== "number"
    ) {
      return null;
    }
    return Cesium.Rectangle.fromDegrees(west, south, east, north);
  } catch (error) {
    console.error("[coordUtils] toCesiumRectangle 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── Leaflet 줌 → Cesium 카메라 고도(m) 표준 변환 ─────────────
// Web Mercator 타일 체계에서 널리 쓰이는 상수(적도 둘레/256 기준)로,
// 대륙/국가의 { zoom } 값을 3D 카메라 높이로 일관되게 환산한다.
//   예) zoom 3 ≈ 7,395만 m(대륙 전체), zoom 5 ≈ 1,849만 m, zoom 10 ≈ 57.8만 m
// zoom 이 숫자가 아니면 기본 고도(1,000만 m)를 반환한다.
export function zoomToCesiumHeight(zoom) {
  try {
    if (typeof zoom !== "number" || Number.isNaN(zoom)) {
      return 10000000; // 기본 고도 1,000만 m
    }
    return 591657527.591555 / Math.pow(2, zoom);
  } catch (error) {
    console.error("[coordUtils] zoomToCesiumHeight 실패:", error); // TODO: 배포 전 제거
    return 10000000;
  }
}

// ─── 도시 중심 좌표 (그 도시 마커들의 평균) ───────────────────
// markersInCity: [{ lat, lng }, ...]. 1개뿐이면 그 좌표 그대로.
// 반환: { lat, lng } (유효 마커 없으면 null)
export function getCityCenter(markersInCity) {
  try {
    const list = Array.isArray(markersInCity) ? markersInCity : [];
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    for (const m of list) {
      if (!m) continue;
      const lat = Number(m.lat);
      const lng = Number(m.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      sumLat += lat;
      sumLng += lng;
      count += 1;
    }
    if (count === 0) return null;
    return { lat: sumLat / count, lng: sumLng / count };
  } catch (error) {
    console.error("[coordUtils] getCityCenter 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 영상 목록 패널이 지도 왼쪽을 덮는 폭(px) ─────────────────
// 메인 화면에서 영상 목록 패널은 지도 위에 왼쪽 오버레이로 겹친다.
// 그 폭은 MainMapView 의 CSS(w-[36%] min-w-[420px])와 동일하게 계산한다.
// mapWidthPx: 지도(=main) 픽셀 폭. 반환: 패널이 가리는 폭(px). 열려있지 않으면 호출부에서 0 처리.
// (마커 중심 보정 + 지도 컨트롤 위치 이동에 공용으로 쓴다)
export function panelOverlayWidth(mapWidthPx) {
  try {
    const w = Number(mapWidthPx) || 0;
    if (w <= 0) return 0;
    // 모바일/태블릿(뷰포트 < 1024px = Tailwind lg 미만)에서는 영상 패널이
    // 지도 왼쪽이 아니라 "하단 바텀시트"로 뜨므로, 지도를 가로로 덮지 않는다 → 보정 0.
    // (이 기준은 MainMapView 의 lg: 반응형 클래스와 반드시 일치해야 한다)
    if (typeof window !== "undefined" && window.innerWidth < 1024) return 0;
    return Math.max(420, Math.round(w * 0.36));
  } catch (error) {
    return 0;
  }
}
