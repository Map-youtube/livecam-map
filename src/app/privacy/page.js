// ─────────────────────────────────────────────────────────────
// 개인정보처리방침 페이지 — /privacy
//
// 서버 컴포넌트(메타데이터 담당) → 다국어 본문은 클라이언트 컴포넌트 PrivacyArticle 가
// 현재 언어(한국어/영어)에 맞춰 렌더한다.
// ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(레이아웃 하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import PrivacyArticle from "@/components/legal/PrivacyArticle";

export const metadata = {
  title: "개인정보처리방침 · Privacy Policy | TripByClip",
  description: "TripByClip 개인정보처리방침 / Privacy Policy",
};

export default function PrivacyPage() {
  return <PrivacyArticle />;
}
