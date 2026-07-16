"use client";

// ─────────────────────────────────────────────────────────────
// VisitorTracker — 방문 1회를 /api/track 에 조용히 보고하는 비콘 (렌더 없음)
//
// - 세션(브라우저 탭)당 + 날짜당 1회만 보고 → sessionStorage 플래그로 중복 방지.
//   (같은 세션에서 페이지를 여러 번 봐도 방문자 1로 집계 — 대략적 "방문 세션" 수)
// - 관리자 페이지(/admin*)는 집계에서 제외.
// - 실패해도 무시(사용자 화면 영향 없음).
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";

export default function VisitorTracker() {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      // 관리자 화면은 방문자 집계에서 제외
      if (window.location.pathname.startsWith("/admin")) return;

      const date = new Date().toISOString().slice(0, 10);
      const key = `lv_visit_${date}`;
      if (window.sessionStorage.getItem(key)) return; // 이미 이 세션에서 보고함
      window.sessionStorage.setItem(key, "1");

      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "visit" }),
        keepalive: true, // 페이지 이탈 중에도 전송 시도
      }).catch(() => {});
    } catch (error) {
      // 무시
    }
  }, []);

  return null;
}
