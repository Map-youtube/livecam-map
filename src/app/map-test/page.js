"use client";

// ─────────────────────────────────────────────────────────────
// ⚠️ 임시 테스트 페이지 — LeafletMap 동작 확인용. 검증이 끝나면 삭제 예정.
//
// 확인 항목:
//   1) 지도가 회색 없이 정상 표시되는지
//   2) 샘플 마커가 표시되는지
//   3) 지도 클릭 시 좌표가 표시되는지 (onMapClick)
//   4) 마커 클릭 시 장소명이 표시되는지 (onMarkerClick)
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";

// 샘플 마커 (도쿄 / 오사카 / 서울) — 테스트용 하드코딩
const SAMPLE_MARKERS = [
  { id: "tokyo", lat: 35.6595, lng: 139.7004, location: "도쿄 시부야 교차로" },
  { id: "osaka", lat: 34.6687, lng: 135.5013, location: "오사카 도톤보리" },
  { id: "seoul", lat: 37.5665, lng: 126.978, location: "서울 시청" },
];

export default function MapTestPage() {
  // 지도 클릭으로 얻은 좌표
  const [clickedCoord, setClickedCoord] = useState(null);
  // 마커 클릭으로 선택된 마커
  const [selectedMarker, setSelectedMarker] = useState(null);

  // ─── 지도 빈 곳 클릭 → 좌표 저장 ─────────────────────────────
  function handleMapClick(coord) {
    try {
      setClickedCoord(coord);
    } catch (error) {
      console.error("[map-test] 지도 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 마커 클릭 → 선택 마커 저장 ──────────────────────────────
  function handleMarkerClick(marker) {
    try {
      setSelectedMarker(marker);
    } catch (error) {
      console.error("[map-test] 마커 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* 제목 */}
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "12px" }}>
        지도 테스트
      </h1>

      {/* 동작 확인용 상태 표시 (제목 아래) */}
      <div style={{ marginBottom: "12px", fontSize: "14px", lineHeight: 1.7 }}>
        <div>
          🖱️ 지도 클릭 좌표:{" "}
          {clickedCoord
            ? `위도 ${clickedCoord.lat.toFixed(5)}, 경도 ${clickedCoord.lng.toFixed(5)}`
            : "(지도를 클릭해 보세요)"}
        </div>
        <div>
          📍 선택된 마커:{" "}
          {selectedMarker
            ? selectedMarker.location
            : "(마커를 클릭해 보세요)"}
        </div>
      </div>

      {/* 지도 영역 — 높이를 부모(여기)에서 600px로 지정 */}
      <div
        style={{
          height: "600px",
          width: "100%",
          border: "1px solid #ddd",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <LeafletMapWrapper
          markers={SAMPLE_MARKERS}
          center={{ lat: 35.68, lng: 139.76 }}
          zoom={5}
          onMapClick={handleMapClick}
          onMarkerClick={handleMarkerClick}
          selectedMarkerId={selectedMarker ? selectedMarker.id : null}
        />
      </div>
    </main>
  );
}
