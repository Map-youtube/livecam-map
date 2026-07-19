// ─────────────────────────────────────────────────────────────
// 대륙별 목록 페이지 — /[continent] (예: /asia) — SEO 정적 페이지
//
// - generateStaticParams: 7개 대륙 정적 생성
// - 해당 대륙 공개 마커를 국가별로 그룹핑해 카드 목록 표시
// - 대륙 소개 문구 + JSON-LD(ItemList) + breadcrumb + 24시간 ISR
// - 공개 마커 캐시(tag:"public-markers")를 쓰므로, 마커 등록 시 revalidateTag 로 함께 재생성됨
//
// ⚠️ 유효하지 않은 대륙 코드는 notFound(). 데이터 조회는 seoData 헬퍼가 내부 try-catch 처리.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { getContinentLabel } from "@/lib/i18n/continents";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";
import {
  VALID_CONTINENTS,
  CONTINENT_INTRO,
  getMarkerThumb,
  groupBy,
} from "@/lib/seoData";
import { getContinentPublicMarkers } from "@/lib/queryPublicMarkers";
import {
  getRegionDescriptions,
  continentDescKey,
  pickRegionText,
} from "@/lib/regionDescriptions";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import RegionCard from "@/components/seo/RegionCard";
import EmptyState from "@/components/seo/EmptyState";

// 24시간마다 자동 재생성(ISR). 그 외 마커 등록 시 revalidateTag("public-markers")로 즉시 갱신.
export const revalidate = 86400;
// 대륙은 7개 고정 집합이므로, 목록에 없는 경로(예: /foobar, /about 등)는 하드 404 처리한다.
// (dynamicParams=true 로 두면 잘못된 대륙이 200 소프트-404 로 프리렌더되어 SEO 에 해롭다)
export const dynamicParams = false;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성 파라미터: 7개 대륙 ────────────────────────────
export function generateStaticParams() {
  return VALID_CONTINENTS.map((c) => ({ continent: c }));
}

// 해당 대륙의 공개 마커 (타겟 쿼리 — 전체 스캔 아님)
async function getContinentMarkers(continent) {
  return getContinentPublicMarkers(continent);
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { continent } = await params;
    if (!VALID_CONTINENTS.includes(continent)) {
      return { title: "찾을 수 없음 | TripByClip" };
    }
    const label = getContinentLabel(continent, "ko");
    const markers = await getContinentMarkers(continent);
    // AI 소개(있으면) → 하드코딩 소개 → 기본 문구 순으로 fallback
    const descs = await getRegionDescriptions();
    const intro =
      pickRegionText(descs, continentDescKey(continent), "ko") ||
      CONTINENT_INTRO[continent] ||
      `${label}의 실시간 라이브캠을 지도와 목록으로 만나보세요.`;
    const ogImage = markers.length ? getMarkerThumb(markers[0]) : undefined;
    const title = `${label} 실시간 라이브캠 | TripByClip`;
    return {
      title,
      description: intro,
      alternates: { canonical: `${SITE_URL}/${continent}` },
      openGraph: {
        title,
        description: intro,
        url: `${SITE_URL}/${continent}`,
        type: "website",
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
    };
  } catch (error) {
    console.error("[continent] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function ContinentPage({ params }) {
  const { continent } = await params;
  // 유효하지 않은 대륙이면 404
  if (!VALID_CONTINENTS.includes(continent)) {
    notFound();
  }

  const label = getContinentLabel(continent, "ko");
  // AI 소개(있으면) → 하드코딩 소개 → 기본 문구 순으로 fallback
  const descs = await getRegionDescriptions();
  const intro =
    pickRegionText(descs, continentDescKey(continent), "ko") ||
    CONTINENT_INTRO[continent] ||
    `${label}의 실시간 라이브캠을 지도와 목록으로 만나보세요.`;
  const markers = await getContinentMarkers(continent);

  // 국가별 그룹핑 (국가명 가나다순)
  const byCountry = groupBy(markers, (m) => m.country || "unknown");
  const countryCodes = Object.keys(byCountry).sort((a, b) =>
    (COUNTRY_NAME_BY_CODE[a] || a).localeCompare(
      COUNTRY_NAME_BY_CODE[b] || b,
      "ko"
    )
  );

  // JSON-LD: ItemList (최대 50개)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} 실시간 라이브캠`,
    numberOfItems: markers.length,
    itemListElement: markers.slice(0, 50).map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.location || "",
      url: `${SITE_URL}/marker/${m.id}`,
    })),
  };

  return (
    <SeoPageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb items={[{ label: "홈", href: "/" }, { label }]} />

      <h1 className="font-display text-2xl font-bold text-ink">
        {label} 실시간 라이브캠
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
        {intro}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        공개된 라이브캠 {markers.length}곳
      </p>

      {markers.length === 0 ? (
        <EmptyState
          message={`${label}에는 아직 공개된 라이브캠이 없습니다.`}
          backHref="/"
          backLabel="← 메인 지도로"
        />
      ) : (
        <div className="mt-8 space-y-10">
          {countryCodes.map((code) => {
            const list = byCountry[code];
            const countryLabel = COUNTRY_NAME_BY_CODE[code] || code;
            return (
              <section key={code}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">
                    {countryLabel}{" "}
                    <span className="text-sm font-normal text-ink-muted">
                      ({list.length})
                    </span>
                  </h2>
                  <Link
                    href={`/${continent}/${code.toLowerCase()}`}
                    className="flex-none text-xs text-brand hover:underline"
                  >
                    {countryLabel} 전체 보기 →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((m) => (
                    <RegionCard
                      key={m.id}
                      marker={m}
                      href={`/?markerId=${m.id}`}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </SeoPageShell>
  );
}
