"use client";

// ─────────────────────────────────────────────────────────────
// DefaultThumbnail / Thumbnail — 썸네일 기본 이미지 대체 처리
//
// - DefaultThumbnail : 썸네일이 없거나 로딩 실패 시 보여줄 회색 배경 + "썸네일 없음" 인라인 SVG.
//                      외부 이미지 파일에 의존하지 않는다(별도 public 파일 불필요).
// - Thumbnail        : 썸네일을 그리는 공용 컴포넌트. 아래 규칙으로 기본 이미지를 대체한다.
//     · src 가 비어있으면(null/undefined/"") → 곧바로 DefaultThumbnail 렌더.
//     · src 는 있으나 로딩 실패(깨진 URL 등) → onError 에서 "실패" 상태로 기록 후 DefaultThumbnail 렌더.
//       실패 상태는 한 번만 바뀌므로(<img> 자체가 사라짐) onError 무한 반복이 일어나지 않는다.
//
// className 은 <img> 와 대체 SVG 양쪽에 동일하게 적용해 레이아웃(크기/모서리 등)을 맞춘다.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

// ─── 기본 대체 이미지 (회색 배경 + 텍스트, 인라인 SVG) ────────
export function DefaultThumbnail({ className = "", label = "썸네일 없음" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 180"
      // 이미지의 object-cover 처럼 비율 유지하며 영역을 채운다
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="320" height="180" fill="#e5e7eb" />
      <text
        x="160"
        y="96"
        fill="#9ca3af"
        fontSize="16"
        fontFamily="sans-serif"
        textAnchor="middle"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── 공용 썸네일 컴포넌트 (기본 이미지 대체 포함) ─────────────
export default function Thumbnail({ src, alt = "", className = "", label }) {
  // 로딩 실패 여부 (한 번 true 가 되면 다시 <img> 를 그리지 않아 무한 루프 방지)
  const [failed, setFailed] = useState(false);

  // src 가 없거나 이미 로딩에 실패했으면 기본 이미지를 렌더
  if (!src || failed) {
    return <DefaultThumbnail className={className} label={label} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        try {
          // 깨진 URL 등 로딩 실패 → 기본 이미지로 대체 (상태로 1회만 전환)
          setFailed(true);
        } catch (error) {
          console.error("[Thumbnail] onError 처리 실패:", error); // TODO: 배포 전 제거
        }
      }}
    />
  );
}
