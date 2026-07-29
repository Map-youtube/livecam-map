"use client";

// ─────────────────────────────────────────────────────────────
// ScrollFadeRow — 가로로 밀어서 보는 행에 "더 있다" 힌트를 주는 래퍼
//
// 왜 필요한가 (2026-07-29 실측):
//   모바일(390px)에서 지도 위 토글 칩 행은 필요 너비 513px / 보이는 너비 374px 로
//   자연재해 버튼이 화면 밖에 있었다. 가로 스크롤은 되지만 "잘렸다/더 있다"는 신호가
//   전혀 없어서, 사용자는 버튼이 그것뿐이라고 생각하게 된다.
//   → 스크롤 위치에 따라 양 끝을 서서히 투명하게(mask) 만들어 이어짐을 알린다.
//
// ⚠️ 배경이 지도(사진)이므로 불투명 그라디언트를 덮으면 지도가 가려진다.
//    그래서 색을 덮지 않고 mask 로 "칩 자체"를 페이드시킨다(globals.css .scroll-fade-x).
// ⚠️ 데스크톱에서는 줄바꿈 배치라 스크롤이 없으므로 자동으로 페이드가 꺼진다
//    (scrollWidth <= clientWidth → data-edge="none").
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

export default function ScrollFadeRow({ className = "", children, ...rest }) {
  const ref = useRef(null);
  // "none" | "start" | "end" | "both"
  const [edge, setEdge] = useState("none");

  const update = useCallback(() => {
    try {
      const el = ref.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      // 1px 미만 차이는 반올림 오차로 본다
      if (max <= 1) {
        setEdge("none");
        return;
      }
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= max - 1;
      if (atStart) setEdge("end");
      else if (atEnd) setEdge("start");
      else setEdge("both");
    } catch (error) {
      console.error("[ScrollFadeRow] 상태 계산 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    try {
      // 창 크기 변경(데스크톱↔모바일 전환)과 내용 변경에 모두 반응
      const ro =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
      if (ro) ro.observe(el);
      window.addEventListener("resize", update);
      return () => {
        if (ro) ro.disconnect();
        window.removeEventListener("resize", update);
      };
    } catch (error) {
      console.error("[ScrollFadeRow] 옵저버 등록 실패:", error); // TODO: 배포 전 제거
      return undefined;
    }
  }, [update]);

  return (
    <div
      ref={ref}
      onScroll={update}
      data-edge={edge}
      className={"scroll-fade-x " + className}
      {...rest}
    >
      {children}
    </div>
  );
}
