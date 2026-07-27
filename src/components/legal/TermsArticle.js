"use client";

// ─────────────────────────────────────────────────────────────
// TermsArticle — 이용약관 본문 (한국어/영어). 현재 언어에 따라 렌더.
//   한국어(ko) → 한국어 본문, 그 외 언어 → 영어 본문.
//   ⚠️ 변호사 검토를 거치지 않은 일반 템플릿(레이아웃 하단 공통 면책 문구로 명시).
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import LegalPageLayout from "@/components/LegalPageLayout";
import { useI18n } from "@/components/i18n/LanguageProvider";

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";
const UL = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-muted";
// 소유권 고지 강조 박스
const CALLOUT =
  "rounded-md border border-border bg-secondary/60 p-3 text-sm leading-relaxed text-ink-muted";

export default function TermsArticle() {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  if (isKo) {
    return (
      <LegalPageLayout
        title="이용약관"
        effectiveDate="2026년 7월 11일"
        lastUpdated="2026년 7월 11일"
      >
        <section>
          <h2 className={H2}>제1조 (목적)</h2>
          <p className={P}>
            본 약관은 TripByClip(이하 “사이트”)이 제공하는 지도 기반 라이브캠 탐색
            서비스(이하 “서비스”)의 이용과 관련하여 사이트와 이용자 간의 권리·의무 및
            책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제2조 (서비스의 내용)</h2>
          <p className={P}>
            서비스는 전 세계 곳곳의 유튜브(YouTube) 라이브 스트림을 지도 위에서
            탐색하고 감상할 수 있도록 안내하는 서비스입니다. 사이트는 영상이 위치한
            장소 정보를 지도·카테고리 형태로 제공할 뿐이며,{" "}
            <strong className="text-ink">
              영상 콘텐츠 자체는 각 유튜브 채널 운영자가 소유·제공
            </strong>
            합니다. 사이트는 해당 영상을 직접 제작·저장·송출하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제3조 (콘텐츠 및 저작권 · 카메라 소유권)</h2>
          {/* OWNER OF CAMS — 실제 운영(공개 스트림 임베드)에 맞게 조정한 고지 */}
          <p className={CALLOUT}>
            <strong className="text-ink">카메라·영상의 소유권.</strong> 본 서비스에
            표시되는 모든 라이브 영상은 <strong className="text-ink">공개적으로
            이용 가능한 유튜브 라이브캠 스트림</strong>입니다. 사이트는 이 카메라를
            소유하지 않으며, 모든 권리는 각 카메라·채널의 정당한 권리자에게 있습니다.
            사이트는 정보 제공 및 교육 목적으로 공개된 스트림을 지도 위에 임베드하여
            안내할 뿐이며, 영상을 직접 촬영·편집·재가공하지 않습니다.
          </p>
          {/* ④ 서비스의 성격 명시 — 영상은 유튜브에 호스팅되고 본 서비스는 임베드 링크만 제공 */}
          <p className={`${P} mt-3`}>
            <strong className="text-ink">서비스의 성격.</strong> 모든 영상은{" "}
            <strong className="text-ink">유튜브(YouTube)에 호스팅</strong>되어 있으며,
            본 서비스는 그 공개 스트림에 대한{" "}
            <strong className="text-ink">임베드 링크와 위치 정보만 제공</strong>합니다.
            영상 데이터는 이용자의 브라우저와 유튜브 서버 사이에서 직접 전송되며, 본
            서비스의 서버를 거치지 않습니다. 영상의 저작권·소유권 및 그에 관한 모든
            권리는 각 유튜브 채널 운영자(또는 정당한 권리자)에게 있고, 사이트는 해당
            영상에 대한 저작권을 주장하지 않습니다.
          </p>
          <p className={`${P} mt-3`}>
            본 서비스는 다음 원칙에 따라 운영됩니다.
          </p>
          <ul className={UL}>
            {/* ① 공식 임베드 플레이어만 사용 — 복제·다운로드·재호스팅 없음 */}
            <li>
              <strong className="text-ink">공식 임베드 플레이어만 사용.</strong> 영상은
              유튜브가 공식 제공하는 임베드 플레이어(iframe)로만 재생합니다. 사이트는
              영상을 다운로드·복제·저장·재송출(재호스팅)하거나, 광고를 제거하는 등
              유튜브 플레이어를 우회·변형하지 않습니다. 재생 화면에는 유튜브의 채널명·
              로고 등 원 출처 표시가 그대로 유지됩니다.
            </li>
            {/* ② 임베드 비활성화 영상 자동 제외 */}
            <li>
              <strong className="text-ink">임베드를 원치 않는 영상은 자동 제외.</strong>{" "}
              채널 운영자가 퍼가기(임베드)를 허용하지 않은 영상은 사이트 목록에
              표시되지 않습니다. 영상 정보를 수집하는 단계에서 임베드 비허용 영상을
              미리 걸러내며, 재생 중 임베드 차단이 확인된 경우에도 해당 영상을 자동으로
              비활성화합니다. 영상이 비공개로 전환·삭제되거나 라이브가 종료된 경우에도
              같은 방식으로 목록에서 자동 제외됩니다.
            </li>
            {/* ③ 명확한 신고·삭제 창구와 신속 대응 방침 */}
            <li>
              <strong className="text-ink">게시 중단(삭제) 요청 창구.</strong> 채널
              운영자 또는 정당한 권리자가 자신의 영상이 본 사이트에 표시되는 것을 원하지
              않는 경우,{" "}
              <Link href="/contact" className="text-brand hover:underline">
                문의하기
              </Link>{" "}
              페이지의 이메일로 해당 영상 링크(또는 채널 주소)와 함께 요청해 주시면
              됩니다. 별도의 사유 설명을 요구하지 않으며, 확인 후 신속히(통상 영업일
              기준 며칠 이내) 해당 영상 또는 채널을 목록에서 제외합니다. 저작권 침해
              주장 등 권리 관련 이의 제기도 같은 창구로 접수합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>제4조 (이용자의 의무)</h2>
          <p className={P}>이용자는 다음 각 호의 행위를 하여서는 안 됩니다.</p>
          <ul className={UL}>
            <li>법령 또는 본 약관을 위반하거나 불법적인 목적으로 서비스를 이용하는 행위</li>
            <li>
              자동화된 수단(봇, 크롤러, 스크래퍼 등)을 이용해 사이트의 데이터를 무단으로
              수집·복제하거나 서버에 부하를 유발하는 행위
            </li>
            <li>사이트의 정상적인 운영을 방해하거나 시스템의 취약점을 악용하는 행위</li>
            <li>타인의 권리(저작권, 초상권 등)를 침해하는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>제5조 (서비스의 변경 및 중단)</h2>
          <p className={P}>
            사이트는 서비스의 내용, 구성, 기능 등을 변경할 수 있으며, 운영상·기술상의
            필요에 따라 서비스의 전부 또는 일부를 중단할 수 있습니다. 중대한 변경 또는
            중단의 경우 가능한 범위에서 사전에 사이트를 통해 고지합니다. 다만 천재지변,
            외부 서비스(유튜브 등)의 장애 등 부득이한 사유가 있는 경우 사후에 고지할 수
            있습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제6조 (면책조항)</h2>
          <ul className={UL}>
            <li>
              사이트는 유튜브 영상, 지진·기상·자연재해 등 제3자가 제공하는 정보(공공데이터
              포함)의 정확성·완전성·최신성을 보증하지 않습니다.
            </li>
            <li>
              <strong className="text-ink">
                자연재해·지진 등 재난 관련 정보는 참고용이며, 공식 재난 경보를 대체하지
                않습니다.
              </strong>{" "}
              정확한 정보는 기상청·소방청 등 공식 기관의 안내를 확인하시기 바랍니다.
            </li>
            <li>
              사이트는 외부 서비스의 장애, 영상의 재생 불가, 정보의 오류 등으로 이용자에게
              발생한 손해에 대하여 관련 법령이 허용하는 범위 내에서 책임을 지지 않습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>제7조 (제휴 마케팅 고지)</h2>
          <p className={P}>
            사이트 내 일부 배너·링크는 제휴(affiliate) 마케팅 링크이며, 이용자가 해당
            링크를 통해 예약·구매를 진행할 경우 사이트 운영자가 일정 수수료를 받을 수
            있습니다. 이는 이용자가 지불하는 가격에 영향을 미치지 않습니다. 자세한 내용은{" "}
            <Link href="/affiliate-disclosure" className="text-brand hover:underline">
              제휴 링크 고지
            </Link>{" "}
            페이지를 참고하시기 바랍니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제8조 (약관의 변경)</h2>
          <p className={P}>
            사이트는 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있으며, 약관을
            변경하는 경우 변경 내용과 시행일을 사이트에 공지합니다. 변경된 약관은 공지된
            시행일부터 효력이 발생합니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제9조 (준거법 및 재판관할)</h2>
          <p className={P}>
            본 약관 및 서비스 이용에 관하여는 대한민국 법령을 준거법으로 합니다. 서비스
            이용과 관련하여 사이트와 이용자 간에 분쟁이 발생한 경우, 관련 법령에 따른
            운영자 소재지 관할 법원을 제1심 관할 법원으로 합니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>제10조 (시행일)</h2>
          <p className={P}>본 약관은 2026년 7월 11일부터 시행됩니다.</p>
        </section>
      </LegalPageLayout>
    );
  }

  // ─── 영어(기본) ───────────────────────────────────────────
  return (
    <LegalPageLayout
      title="Terms of Service"
      effectiveDate="July 11, 2026"
      lastUpdated="July 11, 2026"
    >
      <section>
        <h2 className={H2}>1. Purpose</h2>
        <p className={P}>
          These Terms govern the rights, obligations, and responsibilities between
          TripByClip (the “Site”) and its users in connection with the map-based
          live webcam browsing service (the “Service”).
        </p>
      </section>

      <section>
        <h2 className={H2}>2. Description of the Service</h2>
        <p className={P}>
          The Service helps users discover and watch YouTube live streams from
          around the world on an interactive map. The Site only provides location
          information about where the streams are filmed, in map and category form;{" "}
          <strong className="text-ink">
            the video content itself is owned and provided by each YouTube channel
            operator
          </strong>
          . The Site does not produce, store, or broadcast these videos.
        </p>
      </section>

      <section>
        <h2 className={H2}>3. Content, Copyright &amp; Ownership of Cams</h2>
        {/* OWNER OF CAMS — 실제 운영(공개 스트림 임베드)에 맞게 조정한 고지 */}
        <p className={CALLOUT}>
          <strong className="text-ink">Ownership of cams.</strong> All live footage
          shown on this Service comes from{" "}
          <strong className="text-ink">
            publicly available YouTube live webcam streams
          </strong>
          . We do not own these cameras; all rights belong to their respective
          owners. The Site merely embeds these publicly available streams on a map
          for informational and educational purposes, and does not itself film,
          edit, or re-compile the footage.
        </p>
        {/* ④ 서비스의 성격 명시 — 영상은 유튜브에 호스팅되고 본 서비스는 임베드 링크만 제공 */}
        <p className={`${P} mt-3`}>
          <strong className="text-ink">Nature of the Service.</strong> All videos are{" "}
          <strong className="text-ink">hosted on YouTube</strong>, and this Service
          provides only{" "}
          <strong className="text-ink">
            embed links to those public streams together with location information
          </strong>
          . Video data is transmitted directly between your browser and YouTube&rsquo;s
          servers and does not pass through our servers. The copyright, ownership, and
          all related rights in the videos belong to each YouTube channel operator (or
          other rightful owner), and the Site does not claim any copyright over them.
        </p>
        <p className={`${P} mt-3`}>The Service operates on the following principles.</p>
        <ul className={UL}>
          {/* ① 공식 임베드 플레이어만 사용 — 복제·다운로드·재호스팅 없음 */}
          <li>
            <strong className="text-ink">Official embed player only.</strong> Videos are
            played solely through YouTube&rsquo;s official embedded player (iframe). The
            Site does not download, copy, store, or re-broadcast (re-host) any footage,
            and does not bypass or modify the YouTube player, including by removing ads.
            YouTube&rsquo;s original attribution, such as the channel name and logo,
            remains visible in the player.
          </li>
          {/* ② 임베드 비활성화 영상 자동 제외 */}
          <li>
            <strong className="text-ink">
              Videos that disallow embedding are excluded automatically.
            </strong>{" "}
            Videos for which the channel operator has not allowed embedding are not shown
            on the Site. Such videos are filtered out when video information is collected,
            and any video found to be embed-blocked during playback is automatically
            disabled. The same applies when a video is made private, deleted, or its live
            stream ends — it is removed from the listings automatically.
          </li>
          {/* ③ 명확한 신고·삭제 창구와 신속 대응 방침 */}
          <li>
            <strong className="text-ink">Removal (takedown) channel.</strong> If you are
            a channel operator or rightful owner and do not want your stream to appear on
            this Site, please email us the video link (or channel URL) via our{" "}
            <Link href="/contact" className="text-brand hover:underline">
              Contact
            </Link>{" "}
            page. No explanation is required, and we will remove the video or channel from
            our listings promptly after verification (typically within a few business
            days). Copyright infringement claims and other rights-related complaints are
            accepted through the same channel.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>4. User Obligations</h2>
        <p className={P}>Users must not engage in any of the following:</p>
        <ul className={UL}>
          <li>Using the Service in violation of law or these Terms, or for unlawful purposes.</li>
          <li>
            Using automated means (bots, crawlers, scrapers, etc.) to collect or copy
            the Site’s data without permission, or to place a burden on the servers.
          </li>
          <li>Interfering with the normal operation of the Site or exploiting system vulnerabilities.</li>
          <li>Infringing the rights of others (copyright, portrait rights, etc.).</li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>5. Changes and Suspension of the Service</h2>
        <p className={P}>
          The Site may change the content, structure, or features of the Service, and
          may suspend all or part of the Service for operational or technical reasons.
          For material changes or suspensions, we will give advance notice on the Site
          where reasonably possible. However, in cases of force majeure or failures of
          external services (such as YouTube), notice may be given afterward.
        </p>
      </section>

      <section>
        <h2 className={H2}>6. Disclaimer</h2>
        <ul className={UL}>
          <li>
            The Site does not guarantee the accuracy, completeness, or timeliness of
            information provided by third parties, including YouTube videos and
            earthquake, weather, and natural-disaster data (including public data).
          </li>
          <li>
            <strong className="text-ink">
              Disaster-related information such as natural disasters and earthquakes is
              for reference only and does not replace official emergency alerts.
            </strong>{" "}
            For accurate information, please consult official agencies.
          </li>
          <li>
            To the extent permitted by applicable law, the Site is not liable for
            damages arising to users from failures of external services, unplayable
            videos, or errors in information.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>7. Affiliate Marketing Disclosure</h2>
        <p className={P}>
          Some banners and links on the Site are affiliate marketing links. If a user
          makes a booking or purchase through such a link, the Site operator may
          receive a commission. This does not affect the price you pay. For details,
          please see the{" "}
          <Link href="/affiliate-disclosure" className="text-brand hover:underline">
            Affiliate Disclosure
          </Link>{" "}
          page.
        </p>
      </section>

      <section>
        <h2 className={H2}>8. Changes to These Terms</h2>
        <p className={P}>
          The Site may amend these Terms within the limits permitted by applicable law.
          When the Terms are changed, we will announce the changes and their effective
          date on the Site. The amended Terms take effect on the announced effective
          date.
        </p>
      </section>

      <section>
        <h2 className={H2}>9. Governing Law and Jurisdiction</h2>
        <p className={P}>
          These Terms and use of the Service are governed by the laws of the Republic
          of Korea. In the event of a dispute between the Site and a user in connection
          with use of the Service, the court having jurisdiction over the operator’s
          location under applicable law shall be the court of first instance.
        </p>
      </section>

      <section>
        <h2 className={H2}>10. Effective Date</h2>
        <p className={P}>These Terms take effect on July 11, 2026.</p>
      </section>
    </LegalPageLayout>
  );
}
