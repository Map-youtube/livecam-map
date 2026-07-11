// ─────────────────────────────────────────────────────────────
// 루트 레이아웃 — 폰트 로드 + 전역 CSS 변수 연결
//
// 타이포그래피:
//   - Space Grotesk : 제목/강조 (--font-space → 토큰 --font-display)
//   - Inter         : 본문/영문·숫자 (--font-inter → 토큰 --font-body)
//   - Noto Sans KR  : 한국어 (--font-noto-kr)
//   - IBM Plex Mono : 좌표/시각/개수 등 데이터성 표기 (--font-plex → 토큰 --font-mono)
// globals.css 의 @theme 에서 이 변수들을 조합해 font-display/body/mono/kr 유틸리티로 노출한다.
// ─────────────────────────────────────────────────────────────

import {
  Space_Grotesk,
  Inter,
  Noto_Sans_KR,
  IBM_Plex_Mono,
} from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";

// GA4 측정 ID (미설정 시 GA 스크립트 자체를 렌더하지 않음)
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// 제목/강조용
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

// 본문/영문·숫자용
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// 한국어용 (가변 폰트가 아니므로 사용할 굵기를 지정)
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-kr",
  display: "swap",
});

// 좌표/시각/개수 등 데이터성 표기용
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata = {
  title: "LiveCam Map — 세계 라이브 지도",
  description: "세계 곳곳의 실시간 라이브 영상을 지도로 탐험하는 서비스",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ko"
      className={`${spaceGrotesk.variable} ${inter.variable} ${notoSansKr.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg font-body text-ink">
        {/* GA4 — 측정 ID가 설정된 경우에만 로드 */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        {/* 전역 언어 상태 제공 (브라우저 언어 기본값 + 선택 저장 + RTL 처리) */}
        {/* 공통 푸터는 각 페이지가 렌더한다(메인=지도 영역 안, 법적 페이지=LegalPageLayout).
            → 메인 화면에서 스크롤 없이 푸터가 보이도록 하기 위함. */}
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
