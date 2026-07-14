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

// 애드센스 게시자 ID(예: "pub-1234567890123456"). 서버 전용 환경변수를 그대로 사용한다.
//   설정돼 있을 때만 애드센스 로더 스크립트를 <head> 에 삽입한다(사이트 확인·심사·광고 게재용).
//   미설정이면 스크립트 자체를 렌더하지 않는다. (layout 은 서버 컴포넌트라 서버 전용 변수 접근 가능)
const ADSENSE_PUBLISHER_ID = process.env.ADSENSE_PUBLISHER_ID;

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

// ─── 뷰포트 설정 (모바일 / 추후 앱 전환 대비) ──────────────────
//   - viewportFit: "cover" → 노치·홈바가 있는 기기에서 화면 끝까지 렌더링하고,
//     CSS 의 env(safe-area-inset-*) (globals.css 의 .safe-top/.safe-bottom)가 동작하게 한다.
//   - themeColor → 모바일 브라우저 주소창 / PWA 상단 바 색상을 브랜드 청록으로.
//   - 확대(zoom)는 막지 않는다 — 저시력 사용자 접근성 때문.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#146c6b",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ko"
      className={`${spaceGrotesk.variable} ${inter.variable} ${notoSansKr.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg font-body text-ink">
        {/* 구글 애드센스 로더 — 게시자 ID가 설정된 경우에만 로드(사이트 확인·심사·광고 게재).
            src 의 client 파라미터는 "ca-" 접두사가 필요하므로 pub-XXX 앞에 ca- 를 붙인다. */}
        {ADSENSE_PUBLISHER_ID && (
          <Script
            id="adsense-loader"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${ADSENSE_PUBLISHER_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}

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
