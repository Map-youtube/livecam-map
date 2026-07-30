"use client";

// ─────────────────────────────────────────────────────────────
// CountryFlag — 국기 SVG(flagcdn, 무료 CDN) 공용 컴포넌트
//
// ⚠️ 이모지 국기와 달리 Windows 를 포함한 모든 기기에서 실제 국기 그림으로 렌더된다.
//    (2026-07-30: 언어 선택 드롭다운에 이모지 국기를 썼더니 PC에서 "KR", "US" 같은
//     텍스트 코드로만 보인다는 신고 — 카테고리 트리가 이미 쓰던 이 방식으로 통일했다)
//    - 유효한 ISO alpha-2 코드면 SVG 국기, 로딩 실패/유효하지 않으면 대체 깃발(🏳️, 이모지).
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

export default function CountryFlag({ code, className = "" }) {
  const cc = String(code || "").trim().toLowerCase();
  const valid = /^[a-z]{2}$/.test(cc);
  const [failed, setFailed] = useState(false);

  if (!valid || failed) {
    return (
      <span className={"text-[13px] " + className} aria-hidden="true">
        🏳️
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${cc}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className={
        "inline-block h-[13px] w-[18px] flex-none rounded-[2px] object-cover align-[-1px] ring-1 ring-black/5 " +
        className
      }
    />
  );
}
