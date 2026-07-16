// ─────────────────────────────────────────────────────────────
// 사이트 소개 페이지 — /about
//
// 서버 컴포넌트(메타데이터 담당) → 다국어 본문은 클라이언트 컴포넌트 AboutArticle 가
// 현재 언어(한국어/영어)에 맞춰 렌더한다.
// ─────────────────────────────────────────────────────────────

import AboutArticle from "@/components/info/AboutArticle";

export const metadata = {
  title: "About · 소개 | TripByClip",
  description:
    "TripByClip is a map-based service to travel the world from home through live web cam clips. Learn what it is, how it works, and what you can watch.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <AboutArticle />;
}
