"use client";

// ─────────────────────────────────────────────────────────────
// Footer — 모든 페이지 하단 공통 푸터
//
// - 저작권 표기: © 2026 TripByClip. All rights reserved.
// - 법적 페이지 링크 3종: 이용약관 / 개인정보처리방침 / 제휴 링크 고지 (다국어 라벨)
// - 지도 데이터 출처(OpenStreetMap) 표기
//
// 다국어 라벨(t)을 쓰기 위해 클라이언트 컴포넌트로 둔다. layout.js 에서 공통 적용.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
// ⚠️ seoData.js 가 아니라 continentUtils.js 에서 가져온다 — seoData.js 는 getMapMarkers→
//    firebase-admin 체인을 물고 있어 서버 전용이고, 이 컴포넌트("use client")에서 import 하면
//    500 에러가 난다(2026-08-05 실측). continentUtils.js 는 순수 상수/함수라 안전하다.
import { VALID_CONTINENTS } from "@/lib/continentUtils";

// 푸터 링크 공통 스타일.
//   모바일: 터치 타깃 32px 확보(기존 14px → 2.3배). 좌우 패딩으로 누르는 폭도 넓힌다.
//   ⚠️ 44px 가 접근성 권장이지만, 이 화면은 푸터가 커질수록 지도가 줄어든다.
//      지도가 682px 밑으로 내려가면 초기 월드뷰 줌이 한 단계 낮아져 지도 위아래에
//      빈 영역이 생긴다(2026-07-29 실측). 자주 누르지 않는 법적 링크이므로
//      32px 로 타협하고 지도 높이를 지킨다.
//   데스크톱(sm 이상): 기존처럼 촘촘하게(패딩 제거).
const linkClass =
  "inline-flex min-h-[32px] items-center px-1.5 hover:text-brand hover:underline " +
  "sm:min-h-0 sm:px-0";

// 링크 사이 "|" 구분자 — 좁은 화면에서는 줄바꿈과 겹쳐 지저분해지므로 숨긴다.
function Divider() {
  return (
    <span aria-hidden="true" className="hidden text-border sm:inline">
      |
    </span>
  );
}

export default function Footer() {
  const { t, tContinent } = useI18n();

  return (
    <footer className="flex-shrink-0 border-t border-border bg-surface px-3 py-1 text-ink-muted sm:px-4 sm:py-1.5">
      {/* 지역 목록 링크 (2026-08-05 신설)
          ⚠️ 왜 필요한가: 메인 지도 화면(이 컴포넌트가 렌더되는 곳)에는 그동안 실제 <a href> 링크가
          하나도 없었다(오른쪽 카테고리 트리는 onSelectLocation() 콜백으로 지도만 이동시킬 뿐,
          페이지 이동이 아니다 — 실측 확인). 그 결과 크롤러가 홈에서 대륙/국가/도시 정적
          콘텐츠 페이지로 갈 방법이 전혀 없었고, 애드센스가 "가치가 별로 없는 콘텐츠"로
          거절한 사유 중 하나로 추정된다(홈 화면이 텍스트 없는 지도 하나로만 보임).
          → 실제 지도 UI/동작은 전혀 건드리지 않고, 푸터에 대륙별 실제 링크만 추가한다.
          ⚠️ Link 는 Next.js 가 서버 렌더 시 진짜 <a href> 태그로 출력하므로(클라이언트 라우팅과
             무관하게) 크롤러가 JS 실행 없이도 이 링크들을 발견할 수 있다. */}
      <nav
        aria-label={t("footerRegions")}
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 border-b border-border/60 pb-1 pt-0.5 text-center text-[10px] sm:justify-start sm:text-[11px]"
      >
        {VALID_CONTINENTS.map((c) => (
          <Link
            key={c}
            href={`/${c}`}
            className="hover:text-brand hover:underline"
          >
            {tContinent(c)}
          </Link>
        ))}
      </nav>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-x-2 text-center text-[10px] leading-tight sm:flex-row sm:justify-between sm:text-left sm:text-[11px]">
        {/* 저작권 + 지도 데이터 출처 (한 줄로 합침).
            ⚠️ "© OpenStreetMap contributors" 표기는 OSM 라이선스 요건이라 반드시 남긴다.
               모바일에서는 앞부분을 짧게 줄여 한 줄에 담기게 한다(연도·상호는 유지). */}
        <span>
          © 2026 TripByClip
          <span className="hidden sm:inline">. All rights reserved.</span>
          <span className="mx-1 text-border sm:mx-1.5" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline">지도 데이터 </span>© OpenStreetMap
          contributors
        </span>

        {/* 사이트 안내 + 법적 페이지 링크
            ⚠️ 2026-07-29 모바일 실측: 링크 높이가 14px, "소개"/"문의"는 너비 20px 로
               권장 터치 타깃(44px)의 1/3 도 안 돼 손가락으로 누르기 어려웠다.
               → 모바일에서는 링크마다 세로 패딩으로 최소 높이를 확보하고(min-h-[36px]),
                 좁은 화면에서 겹쳐 보이던 "|" 구분자는 숨긴다(여백으로 구분).
               데스크톱(sm 이상)은 기존의 촘촘한 한 줄 배치를 그대로 유지한다. */}
        <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0 sm:gap-x-2.5 sm:gap-y-0.5">
          <Link href="/about" className={linkClass}>
            {t("footerAbout")}
          </Link>
          <Divider />
          <Link href="/contact" className={linkClass}>
            {t("footerContact")}
          </Link>
          <Divider />
          {/* 영상 게시 중단 요청 — 유튜브 채널 운영자·권리자가 어느 페이지에서든 창구를
              바로 찾을 수 있도록 모든 페이지 하단에 노출한다(문의 페이지의 해당 섹션으로 이동). */}
          <Link href="/contact" className={linkClass}>
            {t("footerTakedown")}
          </Link>
          <Divider />
          <Link href="/terms" className={linkClass}>
            {t("footerTerms")}
          </Link>
          <Divider />
          <Link href="/privacy" className={linkClass}>
            {t("footerPrivacy")}
          </Link>
          <Divider />
          <Link href="/affiliate-disclosure" className={linkClass}>
            {t("footerAffiliate")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
