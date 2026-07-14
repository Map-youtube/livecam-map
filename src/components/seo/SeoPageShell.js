// ─────────────────────────────────────────────────────────────
// SeoPageShell — SEO 정적 페이지 공통 껍데기 (헤더 + 컨테이너 + 하단 푸터)
//
// 이 껍데기 하나를 고치면 SEO 페이지 5종(대륙/국가/도시/마커상세/채널상세)에 모두 적용된다.
//
// 상단 헤더(SiteHeader): 로고 + 대륙별 국가 메뉴 + 언어 선택.
//   검색으로 하위 페이지(예: /asia/jp/tokyo)에 유입된 방문자가 다른 지역으로 계속
//   탐색할 수 있게 한다. (예전엔 브레드크럼의 "홈" 링크가 유일한 이동 수단이었다)
//
// ⚠️ 비용: getSeoNav() 는 getPublicMarkers(5분 캐시 + tag "public-markers")를 재사용하므로
//    추가 DB 조회나 API 비용이 없다. 마커가 바뀌면 기존 revalidateTag("public-markers")로
//    이 메뉴도 함께 갱신된다.
// ─────────────────────────────────────────────────────────────

import Footer from "@/components/Footer";
import SiteHeader from "@/components/seo/SiteHeader";
import { getSeoNav } from "@/lib/seoNav";

export default async function SeoPageShell({ children }) {
  // 헤더 메뉴 데이터. 실패해도 getSeoNav 가 빈 배열을 반환하므로
  // 헤더는 로고만 있는 상태로라도 렌더되고 페이지는 정상 표시된다.
  const nav = await getSeoNav();

  return (
    <>
      <SiteHeader nav={nav} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
