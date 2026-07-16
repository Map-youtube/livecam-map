// ─────────────────────────────────────────────────────────────
// 문의 페이지 — /contact
//
// 서버 컴포넌트(메타데이터 담당) → 다국어 본문은 클라이언트 컴포넌트 ContactArticle 가
// 현재 언어(한국어/영어)에 맞춰 렌더한다.
// ─────────────────────────────────────────────────────────────

import ContactArticle from "@/components/info/ContactArticle";

export const metadata = {
  title: "Contact · 문의 | TripByClip",
  description:
    "Contact TripByClip by email for questions, broken-stream reports, place suggestions, and partnership inquiries.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactArticle />;
}
