// ─────────────────────────────────────────────────────────────
// robots.js — 크롤러 접근 규칙 (Next.js 메타데이터 파일 컨벤션)
//
// - 관리자 페이지(/admin)와 API 라우트(/api)는 색인 차단
// - 그 외 전체 허용 + sitemap.xml 위치 안내
// - /robots.txt 경로로 자동 노출됨(Next.js 컨벤션)
//
// ⚠️ Firestore 읽기 절감(2026-07-30 전수조사): 검색 노출과 무관한 AI 학습/SEO 분석용
//    크롤러(GPTBot, CCBot, ClaudeBot, PerplexityBot, Bytespider, Google-Extended,
//    Applebot-Extended, Meta-ExternalAgent, AhrefsBot, SemrushBot, MJ12bot 등)는
//    수백 개(마커/도시/채널 상세) 페이지를 짧은 시간에 훑을 수 있는데, 검색 유입에는
//    기여하지 않는다. 완전 차단은 하지 않고(추후 AI 검색 노출 가능성 등 정책 판단은
//    별도) crawl-delay 로 속도만 늦춘다 — 실제 방문자(사람)·구글/빙 검색 크롤러는
//    이 규칙의 영향을 받지 않는다(화면·SEO 노출 100% 동일 유지).
// ─────────────────────────────────────────────────────────────

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// 검색 유입과 무관한 AI 학습/SEO 분석용 크롤러 (구글/빙 등 실제 검색엔진은 포함하지 않음)
const THROTTLED_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Bytespider",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "Amazonbot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
];

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api"],
      },
      ...THROTTLED_BOTS.map((ua) => ({
        userAgent: ua,
        allow: "/",
        disallow: ["/admin", "/api"],
        crawlDelay: 10,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
