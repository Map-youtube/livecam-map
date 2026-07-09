"use client";

// ─────────────────────────────────────────────────────────────
// /space-map — CesiumJS 기반 2D/3D/2.5D 우주 지도 페이지
//
// CesiumSpaceMapView 는 Cesium(브라우저 전용)을 직접 사용하므로
// next/dynamic { ssr:false } 로 로드한다(SSR 시 window 오류 방지).
// ─────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";

const CesiumSpaceMapView = dynamic(
  () => import("@/components/CesiumSpaceMapView"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#fff",
          fontSize: "14px",
        }}
      >
        3D 우주 지도를 불러오는 중...
      </div>
    ),
  }
);

export default function SpaceMapPage() {
  return <CesiumSpaceMapView />;
}
