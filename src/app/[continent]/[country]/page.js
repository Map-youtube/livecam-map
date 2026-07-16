// ─────────────────────────────────────────────────────────────
// 국가별 목록 페이지 — /[continent]/[country] (예: /asia/jp) — SEO 정적 페이지
//
// - generateStaticParams: 공개 마커에 실제 존재하는 (대륙,국가) 조합 정적 생성
//   (마커 없는 국가는 얇은 중복 페이지가 되어 SEO 에 해로우므로 사전 생성 대상에서 제외.
//    유효한 국가는 dynamicParams=true 로 요청 시 렌더되어 빈 상태를 보여준다.)
// - 해당 국가 공개 마커를 도시별로 그룹핑해 표시 + 도시 목록 페이지로 연결
// - 국가 소개 문구 + JSON-LD(ItemList) + breadcrumb + 24시간 ISR
//
// ⚠️ continent 유효성 + country 가 그 대륙에 속하는지 검증, 아니면 notFound().
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { getContinentLabel } from "@/lib/i18n/continents";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";
import { getContinentByCountry } from "@/lib/continentUtils";
import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  getMarkerThumb,
  getCountryIntro,
  groupBy,
  citySlug,
} from "@/lib/seoData";
import {
  getRegionDescriptions,
  countryDescKey,
  pickRegionText,
} from "@/lib/regionDescriptions";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import RegionCard from "@/components/seo/RegionCard";
import EmptyState from "@/components/seo/EmptyState";

export const revalidate = 86400;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성: 공개 마커에 존재하는 (대륙, 국가) 조합 ────────
export async function generateStaticParams() {
  try {
    const markers = await getNormalizedPublicMarkers();
    const seen = new Set();
    const params = [];
    for (const m of markers) {
      if (!m || !m.continent || !m.country) continue;
      const key = `${m.continent}/${m.country}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // URL 의 국가코드는 소문자 사용 (/asia/jp)
      params.push({ continent: m.continent, country: m.country.toLowerCase() });
    }
    return params;
  } catch (error) {
    console.error("[country] generateStaticParams 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 해당 국가의 공개 마커 (continent + country 일치)
async function getCountryMarkers(continent, countryUpper) {
  const all = await getNormalizedPublicMarkers();
  return all.filter(
    (m) => m && m.continent === continent && (m.country || "") === countryUpper
  );
}

// continent/country 유효성 검증 결과 반환 (유효하지 않으면 null)
function validate(continent, countryLower) {
  if (!VALID_CONTINENTS.includes(continent)) return null;
  const countryUpper = String(countryLower || "").toUpperCase();
  // country 가 실제로 그 대륙에 속하는지 확인
  if (getContinentByCountry(countryUpper) !== continent) return null;
  return countryUpper;
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { continent, country } = await params;
    const countryUpper = validate(continent, country);
    if (!countryUpper) return { title: "찾을 수 없음 | TripByClip" };

    const countryLabel = COUNTRY_NAME_BY_CODE[countryUpper] || countryUpper;
    const markers = await getCountryMarkers(continent, countryUpper);
    // AI 소개(있으면) → 손으로 쓴 주요국 소개 → 데이터 기반 자동 소개 순으로 fallback
    const descs = await getRegionDescriptions();
    const description =
      pickRegionText(descs, countryDescKey(countryUpper), "ko") ||
      getCountryIntro(countryUpper, {
        countryLabel,
        markerCount: markers.length,
      });
    const ogImage = markers.length ? getMarkerThumb(markers[0]) : undefined;
    const title = `${countryLabel} 실시간 라이브캠 | TripByClip`;
    return {
      title,
      description,
      alternates: {
        canonical: `${SITE_URL}/${continent}/${country.toLowerCase()}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/${continent}/${country.toLowerCase()}`,
        type: "website",
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
    };
  } catch (error) {
    console.error("[country] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function CountryPage({ params }) {
  const { continent, country } = await params;
  const countryUpper = validate(continent, country);
  if (!countryUpper) {
    notFound();
  }

  const continentLabel = getContinentLabel(continent, "ko");
  const countryLabel = COUNTRY_NAME_BY_CODE[countryUpper] || countryUpper;
  const countryLower = country.toLowerCase();
  const markers = await getCountryMarkers(continent, countryUpper);

  // 도시별 그룹핑 (도시명 가나다순)
  const byCity = groupBy(markers, (m) => m.city || "(도시 미지정)");
  const cityNames = Object.keys(byCity).sort((a, b) => a.localeCompare(b, "ko"));

  // 국가 소개문: AI 소개(있으면) → 손으로 쓴 주요국 소개 → 마커수·상위도시 자동 구성.
  const topCities = Object.keys(byCity)
    .filter((c) => c && c !== "(도시 미지정)")
    .sort((a, b) => byCity[b].length - byCity[a].length)
    .slice(0, 3);
  const descs = await getRegionDescriptions();
  const intro =
    pickRegionText(descs, countryDescKey(countryUpper), "ko") ||
    getCountryIntro(countryUpper, {
      countryLabel,
      markerCount: markers.length,
      cityNames: topCities,
    });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${countryLabel} 실시간 라이브캠`,
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

      <Breadcrumb
        items={[
          { label: "홈", href: "/" },
          { label: continentLabel, href: `/${continent}` },
          { label: countryLabel },
        ]}
      />

      <h1 className="font-display text-2xl font-bold text-ink">
        {countryLabel} 실시간 라이브캠
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
        {intro}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        공개된 라이브캠 {markers.length}곳
      </p>

      {markers.length === 0 ? (
        <EmptyState
          message={`${countryLabel}에는 아직 공개된 라이브캠이 없습니다.`}
          backHref={`/${continent}`}
          backLabel={`← ${continentLabel} 목록으로`}
        />
      ) : (
        <div className="mt-8 space-y-10">
          {cityNames.map((city) => {
            const list = byCity[city];
            const slug = citySlug(city);
            return (
              <section key={city}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">
                    {city}{" "}
                    <span className="text-sm font-normal text-ink-muted">
                      ({list.length})
                    </span>
                  </h2>
                  {slug && (
                    <Link
                      href={`/${continent}/${countryLower}/${slug}`}
                      className="flex-none text-xs text-brand hover:underline"
                    >
                      {city} 전체 보기 →
                    </Link>
                  )}
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
