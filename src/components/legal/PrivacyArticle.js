"use client";

// ─────────────────────────────────────────────────────────────
// PrivacyArticle — 개인정보처리방침 본문 (한국어/영어). 현재 언어에 따라 렌더.
//   ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(레이아웃 하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import LegalPageLayout from "@/components/LegalPageLayout";
import { useI18n } from "@/components/i18n/LanguageProvider";

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";
const UL = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-muted";
const A = "text-brand hover:underline";

export default function PrivacyArticle() {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  if (isKo) {
    return (
      <LegalPageLayout
        title="개인정보처리방침"
        effectiveDate="2026년 7월 11일"
        lastUpdated="2026년 7월 11일"
      >
        <section>
          <p className={P}>
            TripByClip(이하 “사이트”)은 이용자의 개인정보를 중요하게 생각하며, 관련
            법령(개인정보보호법 등)을 준수합니다. 본 방침은 사이트가 어떤 정보를 어떻게
            수집·이용하고 보호하는지를 안내합니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>1. 수집하는 개인정보 항목</h2>
          <p className={P}>
            사이트는 일반 방문자에게 별도의 회원가입을 요구하지 않으며, 서비스 이용을
            위해 이름·전화번호 등 식별 개인정보를 직접 입력받지 않습니다.
          </p>
          <ul className={UL}>
            <li>
              <strong className="text-ink">관리자(운영자)</strong>: 이메일 주소
              (Firebase Authentication 로그인·인증 목적)
            </li>
            <li>
              <strong className="text-ink">일반 방문자(자동 수집)</strong>: 접속 IP
              주소, 쿠키, 브라우저·기기 정보, 방문 일시 및 이용 기록 등 방문 통계 정보.
              별도의 회원가입 절차는 없습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>2. 개인정보의 수집 및 이용 목적</h2>
          <ul className={UL}>
            <li>관리자 인증 및 사이트 운영·관리</li>
            <li>방문 통계 분석을 통한 서비스 개선</li>
            <li>광고(제휴 배너 등) 게재 및 성과 측정</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>3. 개인정보의 보유 및 이용 기간</h2>
          <ul className={UL}>
            <li>
              관리자 계정 정보: 계정 탈퇴 또는 운영자의 직무 종료 시까지 보유하며, 그
              이후 지체 없이 파기합니다.
            </li>
            <li>
              방문 통계 정보: 수집 목적 달성에 필요한 기간 동안 보유하며, 구체적인 보유
              기간은 관계 법령이 정한 바에 따릅니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>4. 개인정보의 제3자 제공 및 처리위탁</h2>
          <p className={P}>
            사이트는 이용자의 개인정보를 원칙적으로 외부에 판매·제공하지 않습니다. 다만
            아래의 외부 서비스를 이용하는 과정에서 일부 정보(쿠키·이용 기록 등)가 해당
            사업자에 의해 수집·처리될 수 있으며, 각 서비스의 개인정보 처리에 관하여는 해당
            사업자의 방침을 따릅니다.
          </p>
          <ul className={UL}>
            <li>
              Google AdSense / Google Analytics (광고 게재·통계) —{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={A}>
                Google 개인정보처리방침
              </a>
            </li>
            <li>
              Firebase (Google, 인증·데이터베이스) —{" "}
              <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className={A}>
                Firebase 개인정보 안내
              </a>
            </li>
            <li>
              YouTube (Google, 영상 임베드 재생) —{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={A}>
                Google/YouTube 개인정보처리방침
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>5. 쿠키(Cookie)의 운영</h2>
          <p className={P}>
            사이트는 광고 개인화 및 방문 통계 목적으로 쿠키를 사용할 수 있습니다. 쿠키는
            이용자의 브라우저에 저장되는 작은 텍스트 파일입니다. 이용자는 웹브라우저의
            설정을 통해 쿠키 저장을 거부하거나 삭제할 수 있으며, 이 경우 일부 기능(광고
            개인화 등)이 제한될 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>6. 이용자의 권리와 행사 방법</h2>
          <p className={P}>
            이용자는 자신의 개인정보에 대하여 열람·정정·삭제·처리정지를 요청할 수
            있습니다. 아래 문의처로 요청하시면 관련 법령에 따라 지체 없이 처리합니다.
          </p>
          <ul className={UL}>
            <li>문의: TripByClip@gmail.com</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>7. 만 14세 미만 아동의 개인정보</h2>
          <p className={P}>
            사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를 별도로
            수집하지 않습니다. 만 14세 미만 아동의 개인정보가 수집된 사실이 확인될 경우
            지체 없이 파기합니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>8. 개인정보 보호책임자</h2>
          <p className={P}>
            사이트는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 개인정보 처리와 관련한
            이용자의 문의를 처리하기 위하여 아래와 같이 개인정보 보호책임자를 지정하고
            있습니다.
          </p>
          <ul className={UL}>
            <li>개인정보 보호책임자: TripByClip 운영자</li>
            <li>연락처(이메일): TripByClip@gmail.com</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>9. 시행일</h2>
          <p className={P}>본 개인정보처리방침은 2026년 7월 11일부터 시행됩니다.</p>
        </section>
      </LegalPageLayout>
    );
  }

  // ─── 영어(기본) ───────────────────────────────────────────
  return (
    <LegalPageLayout
      title="Privacy Policy"
      effectiveDate="July 11, 2026"
      lastUpdated="July 11, 2026"
    >
      <section>
        <p className={P}>
          TripByClip (the “Site”) values your privacy and complies with applicable
          laws. This policy explains what information the Site collects, and how it is
          used and protected.
        </p>
      </section>

      <section>
        <h2 className={H2}>1. Information We Collect</h2>
        <p className={P}>
          The Site does not require ordinary visitors to sign up, and does not directly
          collect identifying personal information such as name or phone number for use
          of the Service.
        </p>
        <ul className={UL}>
          <li>
            <strong className="text-ink">Administrator (operator)</strong>: email
            address (for Firebase Authentication login and verification).
          </li>
          <li>
            <strong className="text-ink">General visitors (automatically collected)</strong>:
            access IP address, cookies, browser/device information, visit times, and
            usage records — i.e., visit-statistics information. There is no separate
            sign-up process.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>2. Purpose of Collection and Use</h2>
        <ul className={UL}>
          <li>Administrator authentication and site operation and management.</li>
          <li>Improving the Service through visit-statistics analysis.</li>
          <li>Serving ads (such as affiliate banners) and measuring performance.</li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>3. Retention and Use Period</h2>
        <ul className={UL}>
          <li>
            Administrator account information: retained until account withdrawal or the
            end of the operator’s duties, then destroyed without delay.
          </li>
          <li>
            Visit-statistics information: retained for the period necessary to achieve
            the collection purpose; specific retention periods follow applicable law.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>4. Third-Party Provision and Processing</h2>
        <p className={P}>
          As a rule, the Site does not sell or provide your personal information to
          outside parties. However, in the course of using the external services below,
          some information (such as cookies and usage records) may be collected and
          processed by those providers, and the handling of such information is subject
          to each provider’s own policy.
        </p>
        <ul className={UL}>
          <li>
            Google AdSense / Google Analytics (ad serving and statistics) —{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={A}>
              Google Privacy Policy
            </a>
          </li>
          <li>
            Firebase (Google; authentication and database) —{" "}
            <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className={A}>
              Firebase Privacy Information
            </a>
          </li>
          <li>
            YouTube (Google; embedded video playback) —{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={A}>
              Google/YouTube Privacy Policy
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>5. Use of Cookies</h2>
        <p className={P}>
          The Site may use cookies for ad personalization and visit statistics. A cookie
          is a small text file stored in your browser. You can refuse or delete cookies
          through your browser settings; in that case, some features (such as ad
          personalization) may be limited.
        </p>
      </section>

      <section>
        <h2 className={H2}>6. Your Rights and How to Exercise Them</h2>
        <p className={P}>
          You may request access to, correction of, deletion of, or suspension of
          processing of your personal information. If you contact us at the address
          below, we will handle your request without delay in accordance with applicable
          law.
        </p>
        <ul className={UL}>
          <li>Contact: TripByClip@gmail.com</li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>7. Children’s Personal Information</h2>
        <p className={P}>
          The Site is not directed to children under the age of 14 and does not
          separately collect children’s personal information. If we confirm that a
          child’s personal information under 14 has been collected, we will destroy it
          without delay.
        </p>
      </section>

      <section>
        <h2 className={H2}>8. Privacy Officer</h2>
        <p className={P}>
          The Site designates the following privacy officer to take overall
          responsibility for personal-information processing and to handle user
          inquiries related to it.
        </p>
        <ul className={UL}>
          <li>Privacy Officer: TripByClip operator</li>
          <li>Contact (email): TripByClip@gmail.com</li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>9. Effective Date</h2>
        <p className={P}>This Privacy Policy takes effect on July 11, 2026.</p>
      </section>
    </LegalPageLayout>
  );
}
