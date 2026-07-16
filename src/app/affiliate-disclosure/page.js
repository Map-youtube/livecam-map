// ─────────────────────────────────────────────────────────────
// 제휴 링크 고지 페이지 — /affiliate-disclosure
//
// 서버 컴포넌트(메타데이터 담당) → 다국어 본문은 클라이언트 컴포넌트 AffiliateArticle 가
// 현재 언어(한국어/영어)에 맞춰 렌더한다.
// ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(레이아웃 하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import AffiliateArticle from "@/components/legal/AffiliateArticle";

export const metadata = {
  title: "제휴 링크 고지 · Affiliate Disclosure | TripByClip",
  description: "TripByClip 제휴 마케팅(어필리에이트) 링크 고지 / Affiliate Disclosure",
};

export default function AffiliateDisclosurePage() {
  return <AffiliateArticle />;
}
