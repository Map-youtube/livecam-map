// ─────────────────────────────────────────────────────────────
// robots.js — 크롤러 접근 규칙 (Next.js 메타데이터 파일 컨벤션)
//
// - 관리자 페이지(/admin)와 API 라우트(/api)는 색인 차단
// - 그 외 전체 허용 + sitemap.xml 위치 안내
// - /robots.txt 경로로 자동 노출됨(Next.js 컨벤션)
// ─────────────────────────────────────────────────────────────

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
