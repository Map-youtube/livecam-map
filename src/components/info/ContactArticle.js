"use client";

// ─────────────────────────────────────────────────────────────
// ContactArticle — 문의(Contact) 본문 (한국어/영어). 현재 언어에 따라 렌더.
//   연락 수단(이메일)과 어떤 문의를 받는지 안내. (개인정보처리방침의 문의처와 동일)
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import InfoPageLayout from "@/components/InfoPageLayout";
import { useI18n } from "@/components/i18n/LanguageProvider";

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";
const UL = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-muted";

// 공개 연락 이메일 (개인정보처리방침의 문의처와 동일하게 유지)
const CONTACT_EMAIL = "TripByClip@gmail.com";

export default function ContactArticle() {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  if (isKo) {
    return (
      <InfoPageLayout
        title="문의하기"
        subtitle="궁금한 점, 제보, 제휴 문의를 이메일로 받습니다."
      >
        <section>
          <h2 className={H2}>연락처</h2>
          <p className={P}>
            아래 이메일로 연락 주시면 확인 후 답변드립니다.
          </p>
          <p className="mt-2 text-sm">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-brand hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <section>
          <h2 className={H2}>이런 내용을 보내주세요</h2>
          <ul className={UL}>
            <li>재생되지 않는 영상, 잘못된 위치·정보 제보</li>
            <li>새로운 라이브캠 장소·채널 추천</li>
            <li>제휴·광고 및 비즈니스 관련 제안</li>
            <li>
              개인정보 관련 요청(열람·정정·삭제 등) —{" "}
              <Link href="/privacy" className="text-brand hover:underline">
                개인정보처리방침
              </Link>{" "}
              참고
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>답변 안내</h2>
          <p className={P}>
            개인이 운영하는 서비스라 답변까지 며칠이 걸릴 수 있는 점 양해 부탁드립니다.
            보내주신 제보는 마커 품질을 개선하는 데 큰 도움이 됩니다. 감사합니다.
          </p>
        </section>
      </InfoPageLayout>
    );
  }

  // ─── 영어(기본) ───────────────────────────────────────────
  return (
    <InfoPageLayout
      title="Contact"
      subtitle="Questions, tips, and partnership inquiries are welcome by email."
    >
      <section>
        <h2 className={H2}>Get in touch</h2>
        <p className={P}>
          Send us an email at the address below and we will get back to you after
          reviewing your message.
        </p>
        <p className="mt-2 text-sm">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold text-brand hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <section>
        <h2 className={H2}>What to write about</h2>
        <ul className={UL}>
          <li>Reports of streams that do not play, or wrong locations/information</li>
          <li>Suggestions for new webcam places or channels</li>
          <li>Affiliate, advertising, and business proposals</li>
          <li>
            Privacy requests (access, correction, deletion, etc.) — see our{" "}
            <Link href="/privacy" className="text-brand hover:underline">
              Privacy Policy
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>Response note</h2>
        <p className={P}>
          As an independently run service, replies may take a few days — thank you for
          your patience. Your reports genuinely help us improve the quality of the
          markers. Thank you.
        </p>
      </section>
    </InfoPageLayout>
  );
}
