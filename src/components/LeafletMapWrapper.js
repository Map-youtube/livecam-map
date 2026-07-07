"use client";

// ─────────────────────────────────────────────────────────────
// LeafletMapWrapper — LeafletMap 을 SSR 없이(next/dynamic + ssr:false) 감싸는 래퍼
//
// Leaflet 은 브라우저 전용이라 서버 렌더링 시 "window is not defined" 오류가 난다.
// 따라서 지도 본체(LeafletMap)는 클라이언트에서만 로드해야 하며,
// 다른 페이지/컴포넌트에서는 이 Wrapper 를 import 해서 사용한다.
//
// ⚠️ next/dynamic 의 { ssr: false } 옵션은 Next.js 16에서 서버 컴포넌트에서는 쓸 수 없고
//    반드시 클라이언트 컴포넌트 안에서만 사용해야 한다. 그래서 이 파일 최상단에 'use client' 를 둔다.
// ─────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";

// LeafletMap 을 클라이언트 전용으로 동적 로드.
// 로딩 중에는 "지도를 불러오는 중..." 표시를 보여준다.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f0f0",
        color: "#555",
        fontSize: "14px",
      }}
    >
      지도를 불러오는 중...
    </div>
  ),
});

// 전달받은 props 를 그대로 LeafletMap 에 넘긴다 (markers, center, zoom, 콜백 등).
export default function LeafletMapWrapper(props) {
  return <LeafletMap {...props} />;
}
