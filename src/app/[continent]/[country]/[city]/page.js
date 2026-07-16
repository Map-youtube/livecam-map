// ─────────────────────────────────────────────────────────────
// 도시별 목록 페이지 — /[continent]/[country]/[city] (예: /asia/jp/tokyo) — SEO 정적 페이지
//
// - generateStaticParams: 공개 마커에 존재하는 (대륙,국가,도시슬러그) 조합 정적 생성
// - 해당 도시의 마커 전체를 카드로 표시, 각 카드는 마커 상세 페이지(/marker/[id])로 연결
// - JSON-LD(ItemList) + breadcrumb + 24시간 ISR
//
// ⚠️ 도시는 마커에서 파생되므로, 해당 슬러그에 마커가 하나도 없으면 notFound().
// ⚠️ city 파라미터는 슬러그(소문자/하이픈, 한글 유지)이며, 마커의 city 를 같은 규칙으로
//    슬러그화해 역매칭한다.
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { getContinentLabel } from "@/lib/i18n/continents";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";
import { getContinentByCountry } from "@/lib/continentUtils";
import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  getMarkerThumb,
  citySlug,
} from "@/lib/seoData";
import {
  getRegionDescriptions,
  cityDescKey,
  pickRegionText,
} from "@/lib/regionDescriptions";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import RegionCard from "@/components/seo/RegionCard";

export const revalidate = 86400;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성: 공개 마커의 (대륙, 국가, 도시슬러그) 조합 ─────
export async function generateStaticParams() {
  try {
    const markers = await getNormalizedPublicMarkers();
    const seen = new Set();
    const params = [];
    for (const m of markers) {
      if (!m || !m.continent || !m.country || !m.city) continue;
      const slug = citySlug(m.city);
      if (!slug) continue;
      const key = `${m.continent}/${m.country}/${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      params.push({
        continent: m.continent,
        country: m.country.toLowerCase(),
        city: slug,
      });
    }
    return params;
  } catch (error) {
    console.error("[city] generateStaticParams 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// URL 세그먼트(city 슬러그) 방어적 디코딩.
//   한글 등 비ASCII 도시명은 슬러그도 비ASCII("도쿄")라 URL 에서 퍼센트 인코딩
//   (%EB%8F%84%EC%BF%84)되어 들어온다. Next 가 이를 디코딩하지 않고 넘겨주는 경우가 있어
//   citySlug(m.city)="도쿄" 와 매칭되지 않아 404(빈 페이지)가 났다.
//   → 매칭 전에 항상 디코딩해 인코딩/디코딩 상태와 무관하게 일치시킨다.
//   (이미 디코딩된 ASCII/한글이면 decodeURIComponent 는 그대로 반환 → 안전)
function decodeSlug(slug) {
  try {
    return decodeURIComponent(String(slug || ""));
  } catch (error) {
    // 잘못된 퍼센트 시퀀스 등은 원본 그대로 사용
    return String(slug || "");
  }
}

// 해당 도시(슬러그)의 공개 마커
async function getCityMarkers(continent, countryUpper, slug) {
  const decoded = decodeSlug(slug);
  const all = await getNormalizedPublicMarkers();
  return all.filter(
    (m) =>
      m &&
      m.continent === continent &&
      (m.country || "") === countryUpper &&
      citySlug(m.city) === decoded
  );
}

// 유효성: continent 유효 + country 가 그 대륙 소속 → countryUpper 반환, 아니면 null
function validate(continent, countryLower) {
  if (!VALID_CONTINENTS.includes(continent)) return null;
  const countryUpper = String(countryLower || "").toUpperCase();
  if (getContinentByCountry(countryUpper) !== continent) return null;
  return countryUpper;
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { continent, country, city } = await params;
    const countryUpper = validate(continent, country);
    if (!countryUpper) return { title: "찾을 수 없음 | TripByClip" };

    const markers = await getCityMarkers(continent, countryUpper, city);
    if (markers.length === 0) return { title: "찾을 수 없음 | TripByClip" };

    // 표시용 도시명은 실제 마커의 city 값 사용
    const cityName = markers[0].city || city;
    const countryLabel = COUNTRY_NAME_BY_CODE[countryUpper] || countryUpper;
    // AI 소개(있으면) → 기존 템플릿 fallback (메타 설명)
    const descs = await getRegionDescriptions();
    const description =
      pickRegionText(
        descs,
        cityDescKey(continent, countryUpper, citySlug(cityName)),
        "ko"
      ) ||
      `${cityName}(${countryLabel})의 실시간 라이브캠 ${markers.length}곳. 거리·명소·해변을 지금 이 순간 생중계로 감상하세요.`;
    const ogImage = getMarkerThumb(markers[0]);
    const title = `${cityName} 실시간 라이브캠 | TripByClip`;
    return {
      title,
      description,
      alternates: {
        canonical: `${SITE_URL}/${continent}/${country.toLowerCase()}/${city}`,
      },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/${continent}/${country.toLowerCase()}/${city}`,
        type: "website",
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
    };
  } catch (error) {
    console.error("[city] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function CityPage({ params }) {
  const { continent, country, city } = await params;
  const countryUpper = validate(continent, country);
  if (!countryUpper) {
    notFound();
  }

  const markers = await getCityMarkers(continent, countryUpper, city);
  // 도시는 마커에서 파생 → 마커가 없으면 존재하지 않는 페이지로 처리
  if (markers.length === 0) {
    notFound();
  }

  const continentLabel = getContinentLabel(continent, "ko");
  const countryLabel = COUNTRY_NAME_BY_CODE[countryUpper] || countryUpper;
  const countryLower = country.toLowerCase();
  const cityName = markers[0].city || city;

  // 도시 소개: AI 소개(있으면) → 기존 템플릿 fallback
  const descs = await getRegionDescriptions();
  const introText =
    pickRegionText(
      descs,
      cityDescKey(continent, countryUpper, citySlug(cityName)),
      "ko"
    ) ||
    `${cityName}(${countryLabel})의 실시간 라이브캠 ${markers.length}곳입니다. 각 영상을 눌러 상세 정보와 함께 감상해 보세요.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cityName} 실시간 라이브캠`,
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
          { label: countryLabel, href: `/${continent}/${countryLower}` },
          { label: cityName },
        ]}
      />

      <h1 className="font-display text-2xl font-bold text-ink">
        {cityName} 실시간 라이브캠
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
        {introText}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {markers.map((m) => (
          <RegionCard key={m.id} marker={m} href={`/marker/${m.id}`} />
        ))}
      </div>
    </SeoPageShell>
  );
}
