// ─────────────────────────────────────────────────────────────
// 제휴 링크 고지 페이지 — /affiliate-disclosure (정적 서버 컴포넌트)
//
// 공정거래위원회 "추천·보증 등에 관한 표시·광고 심사지침"의 취지(경제적 대가를
// 받는 관계의 명확한 고지)를 반영해 작성한다.
// ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata = {
  title: "제휴 링크 고지 | TripByClip",
  description: "TripByClip 제휴 마케팅(어필리에이트) 링크 고지",
};

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";

export default function AffiliateDisclosurePage() {
  return (
    <LegalPageLayout
      title="제휴 링크 고지"
      effectiveDate="2026년 7월 11일"
      lastUpdated="2026년 7월 11일"
    >
      {/* 1. 고지 목적 */}
      <section>
        <h2 className={H2}>1. 고지 목적</h2>
        <p className={P}>
          본 고지는 공정거래위원회의 「추천·보증 등에 관한 표시·광고 심사지침」의
          취지에 따라, 사이트와 광고주 사이에 경제적 대가를 받는 관계가 있음을
          이용자에게 명확히 알리기 위한 것입니다.
        </p>
      </section>

      {/* 2. 제휴 링크 안내 */}
      <section>
        <h2 className={H2}>2. 제휴 링크 안내</h2>
        <p className={P}>
          본 사이트에 노출되는 Klook, Booking.com 등 일부 배너는 제휴 마케팅
          링크입니다. 이용자가 해당 링크를 통해 예약·구매를 진행하는 경우, 사이트
          운영자가 광고주로부터 일정 수수료를 받을 수 있습니다.{" "}
          <strong className="text-ink">
            이는 이용자가 지불하는 가격에 영향을 미치지 않습니다.
          </strong>
        </p>
      </section>

      {/* 3. 추천의 독립성 */}
      <section>
        <h2 className={H2}>3. 상품·서비스 추천의 독립성</h2>
        <p className={P}>
          사이트에 노출되는 제휴 배너는 특정 업체로부터 후원을 받고 개별적으로 작성된
          리뷰나 추천이 아니라, 제휴 프로그램을 통해 자동으로 노출되는 광고 형태입니다.
          사이트는 이용자에게 유용할 수 있는 여행 관련 서비스를 안내할 뿐이며, 이용
          여부는 전적으로 이용자의 판단과 선택에 따릅니다.
        </p>
        <p className={`${P} mt-3`}>
          제휴 및 광고와 관련한 사항은{" "}
          <Link href="/terms" className="text-brand hover:underline">
            이용약관
          </Link>
          에도 함께 고지되어 있습니다.
        </p>
      </section>
    </LegalPageLayout>
  );
}
