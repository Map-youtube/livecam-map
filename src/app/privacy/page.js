// ─────────────────────────────────────────────────────────────
// 개인정보처리방침 페이지 — /privacy (정적 서버 컴포넌트)
//
// 국내 개인정보보호법상 일반적으로 요구되는 항목(수집항목/목적/보유기간/제3자
// 제공·위탁/쿠키/이용자권리/아동/보호책임자/시행일)을 실제 사이트 구조에 맞게 작성.
// ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(하단 공통 면책 문구로 명시).
// ⚠️ 개인정보 보호책임자 연락처는 운영자가 나중에 채워 넣도록 자리(placeholder)만 둔다.
// ─────────────────────────────────────────────────────────────

import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata = {
  title: "개인정보처리방침 | TripByClip",
  description: "TripByClip 개인정보처리방침",
};

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";
const UL = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-muted";
const A = "text-brand hover:underline";

export default function PrivacyPage() {
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

      {/* 1. 수집하는 개인정보 항목 */}
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
            <strong className="text-ink">일반 방문자(자동 수집)</strong>: 접속
            IP 주소, 쿠키, 브라우저·기기 정보, 방문 일시 및 이용 기록 등 방문 통계
            정보. 별도의 회원가입 절차는 없습니다.
          </li>
        </ul>
      </section>

      {/* 2. 수집 목적 */}
      <section>
        <h2 className={H2}>2. 개인정보의 수집 및 이용 목적</h2>
        <ul className={UL}>
          <li>관리자 인증 및 사이트 운영·관리</li>
          <li>방문 통계 분석을 통한 서비스 개선</li>
          <li>광고(제휴 배너 등) 게재 및 성과 측정</li>
        </ul>
      </section>

      {/* 3. 보유 및 이용 기간 */}
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

      {/* 4. 제3자 제공 및 처리위탁 */}
      <section>
        <h2 className={H2}>4. 개인정보의 제3자 제공 및 처리위탁</h2>
        <p className={P}>
          사이트는 이용자의 개인정보를 원칙적으로 외부에 판매·제공하지 않습니다. 다만
          아래의 외부 서비스를 이용하는 과정에서 일부 정보(쿠키·이용 기록 등)가 해당
          사업자에 의해 수집·처리될 수 있으며, 각 서비스의 개인정보 처리에 관하여는
          해당 사업자의 방침을 따릅니다.
        </p>
        <ul className={UL}>
          <li>
            Google AdSense / Google Analytics (광고 게재·통계) —{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={A}
            >
              Google 개인정보처리방침
            </a>
          </li>
          <li>
            Firebase (Google, 인증·데이터베이스) —{" "}
            <a
              href="https://firebase.google.com/support/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={A}
            >
              Firebase 개인정보 안내
            </a>
          </li>
          <li>
            YouTube (Google, 영상 임베드 재생) —{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={A}
            >
              Google/YouTube 개인정보처리방침
            </a>
          </li>
        </ul>
      </section>

      {/* 5. 쿠키(Cookie) 운영 */}
      <section>
        <h2 className={H2}>5. 쿠키(Cookie)의 운영</h2>
        <p className={P}>
          사이트는 광고 개인화 및 방문 통계 목적으로 쿠키를 사용할 수 있습니다. 쿠키는
          이용자의 브라우저에 저장되는 작은 텍스트 파일입니다. 이용자는 웹브라우저의
          설정을 통해 쿠키 저장을 거부하거나 삭제할 수 있으며, 이 경우 일부 기능(광고
          개인화 등)이 제한될 수 있습니다.
        </p>
      </section>

      {/* 6. 이용자의 권리 */}
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

      {/* 7. 아동의 개인정보 */}
      <section>
        <h2 className={H2}>7. 만 14세 미만 아동의 개인정보</h2>
        <p className={P}>
          사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를 별도로
          수집하지 않습니다. 만 14세 미만 아동의 개인정보가 수집된 사실이 확인될 경우
          지체 없이 파기합니다.
        </p>
      </section>

      {/* 8. 개인정보 보호책임자 */}
      <section>
        <h2 className={H2}>8. 개인정보 보호책임자</h2>
        <p className={P}>
          사이트는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 개인정보 처리와
          관련한 이용자의 문의를 처리하기 위하여 아래와 같이 개인정보 보호책임자를
          지정하고 있습니다.
        </p>
        <ul className={UL}>
          <li>개인정보 보호책임자: TripByClip 운영자</li>
          <li>연락처(이메일): TripByClip@gmail.com</li>
        </ul>
      </section>

      {/* 9. 시행일 */}
      <section>
        <h2 className={H2}>9. 시행일</h2>
        <p className={P}>본 개인정보처리방침은 2026년 7월 11일부터 시행됩니다.</p>
      </section>
    </LegalPageLayout>
  );
}
