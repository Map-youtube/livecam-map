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

        {/* 영상 게시 중단 요청 — 채널 운영자/권리자가 바로 찾을 수 있도록 별도 섹션으로 강조.
            (이용약관 제3조의 "권리자 요청 시 조치" 조항과 내용을 일치시킨다) */}
        <section>
          <h2 className={H2}>영상 게시 중단(삭제) 요청</h2>
          <p className={P}>
            본 사이트는 유튜브가 제공하는 임베드(iframe) 기능으로 공개 라이브 스트림을
            지도 위에 안내할 뿐이며, 영상의 모든 권리는 각 유튜브 채널 운영자에게 있습니다.
            <strong className="text-ink">
              {" "}
              채널 운영자 또는 정당한 권리자께서 자신의 영상이 본 사이트에 표시되는 것을
              원하지 않으시면, 아래 이메일로 해당 영상 링크(또는 채널 주소)와 함께 요청해
              주시기 바랍니다. 확인 후 신속히 목록에서 제외하겠습니다.
            </strong>{" "}
            별도의 사유 설명은 필요하지 않습니다.
          </p>
          <p className="mt-2 text-sm">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                "[영상 게시 중단 요청] TripByClip"
              )}`}
              className="font-semibold text-brand hover:underline"
            >
              {CONTACT_EMAIL} 로 게시 중단 요청하기
            </a>
          </p>
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

      {/* Takedown request — 채널 운영자/권리자가 바로 찾을 수 있도록 별도 섹션으로 강조.
          (이용약관 제3조의 "권리자 요청 시 조치" 조항과 내용을 일치시킨다) */}
      <section>
        <h2 className={H2}>Removal (takedown) requests</h2>
        <p className={P}>
          This site only embeds publicly available YouTube live streams via YouTube&rsquo;s
          official iframe player and maps them by location. All rights in the footage
          belong to the respective YouTube channel owners.
          <strong className="text-ink">
            {" "}
            If you are the channel owner or rights holder and you do not want your stream
            to appear on this site, please email us the video link (or channel URL) and we
            will remove it from our listings promptly.
          </strong>{" "}
          No explanation is required.
        </p>
        <p className="mt-2 text-sm">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              "[Takedown request] TripByClip"
            )}`}
            className="font-semibold text-brand hover:underline"
          >
            Send a removal request to {CONTACT_EMAIL}
          </a>
        </p>
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
