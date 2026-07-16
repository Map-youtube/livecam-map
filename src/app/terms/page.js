// ─────────────────────────────────────────────────────────────
// 이용약관 페이지 — /terms
//
// 서버 컴포넌트(메타데이터 담당) → 다국어 본문은 클라이언트 컴포넌트 TermsArticle 가
// 현재 언어(한국어/영어)에 맞춰 렌더한다.
// ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(레이아웃 하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import TermsArticle from "@/components/legal/TermsArticle";

export const metadata = {
  title: "이용약관 · Terms of Service | TripByClip",
  description: "TripByClip 서비스 이용약관 / Terms of Service",
};

export default function TermsPage() {
  return <TermsArticle />;
}
