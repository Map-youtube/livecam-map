// ─────────────────────────────────────────────────────────────
// 마커 상세 SEO 페이지 — /marker/[markerId]
//
// - 마커 1개 전체 정보: 장소명, 도시/국가, 태그, 유튜브 썸네일/인라인 재생, 좌표,
//   AI 장소 설명(ko/en, description_confirmed: true 인 경우만)
// - "지도에서 보기" → 메인(/?markerId=xxx)
// - JSON-LD: TouristAttraction
// - 마커가 없거나 비공개(is_active:false / auto_disabled)면 notFound()
//   (getPublicMarkers 가 이미 공개 마커만 반환하므로, 공개셋에 없으면 404)
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { getContinentLabel } from "@/lib/i18n/continents";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";
import { getMarkerThumb, citySlug } from "@/lib/seoData";
import { getPublicMarkerById } from "@/lib/getPublicMarkerById";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import YouTubeEmbed from "@/components/seo/YouTubeEmbed";
import RegionCard from "@/components/seo/RegionCard";
import { getRelatedMarkers } from "@/lib/relatedMarkers";

export const revalidate = 86400;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성: 빌드 때 사전생성하지 않음(빈 배열) ───────────
// ⚠️ Firestore 읽기 절감(2026-07-21): 마커 페이지가 수백~수천 개라, 예전엔 빌드마다
//    getNormalizedPublicMarkers()(전체 스캔)로 모든 마커 id 를 뽑아 그 페이지를 전부 프리렌더했다
//    → 매 배포마다 "전체 스캔 + 수백 페이지 렌더"로 Firestore 읽기가 몰렸다(실측: LOOKUP 급증).
//    dynamicParams=true 이므로 빈 배열을 반환해 빌드에선 만들지 않고, 크롤러/방문자의 첫 요청 시
//    on-demand ISR 로 렌더한다(그때 getPublicMarkerById=문서 1~2개 + 관련영상은 국가/대륙 스냅샷을
//    읽어 저비용). 렌더 결과는 24h 캐시되므로 이후 방문은 DB 를 안 친다. sitemap 에는 그대로 노출된다.
export async function generateStaticParams() {
  return [];
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { markerId } = await params;
    const marker = await getPublicMarkerById(markerId);
    if (!marker) return { title: "찾을 수 없음 | TripByClip" };

    const country = marker.country
      ? COUNTRY_NAME_BY_CODE[marker.country] || marker.country
      : "";
    const region = [marker.city, country].filter(Boolean).join(", ");
    const name = marker.location || "라이브캠";
    const desc =
      (marker.description_confirmed &&
        marker.description &&
        (marker.description.ko || marker.description.en)) ||
      `${region ? region + "의 " : ""}실시간 라이브캠 — ${name}. 지금 이 순간을 생중계로 감상하세요.`;
    const ogImage = getMarkerThumb(marker);
    const title = `${name}${region ? " · " + region : ""} 실시간 라이브캠 | TripByClip`;
    return {
      title,
      description: String(desc).slice(0, 200),
      alternates: { canonical: `${SITE_URL}/marker/${markerId}` },
      openGraph: {
        title,
        description: String(desc).slice(0, 200),
        url: `${SITE_URL}/marker/${markerId}`,
        type: "website",
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
    };
  } catch (error) {
    console.error("[marker] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function MarkerPage({ params }) {
  const { markerId } = await params;
  const marker = await getPublicMarkerById(markerId);
  // 존재하지 않거나 비공개(is_active:false/auto_disabled) → 404
  if (!marker) {
    notFound();
  }

  // 관련 영상 (같은 도시 → 같은 국가 → 같은 대륙). 공개 마커 캐시를 재사용하므로 추가 비용 없음.
  const related = await getRelatedMarkers(marker, 8);

  const continent = marker.continent || "";
  const continentLabel = continent ? getContinentLabel(continent, "ko") : "";
  const countryUpper = marker.country || "";
  const countryLabel = countryUpper
    ? COUNTRY_NAME_BY_CODE[countryUpper] || countryUpper
    : "";
  const cityName = marker.city || "";
  const name = marker.location || "(장소명 없음)";
  const tags = Array.isArray(marker.tags) ? marker.tags : [];
  const videoId = marker.youtube_video_id || "";
  const thumb = getMarkerThumb(marker);

  // AI 설명 (관리자 확정된 것만)
  const descKo =
    marker.description_confirmed && marker.description
      ? marker.description.ko || ""
      : "";
  const descEn =
    marker.description_confirmed && marker.description
      ? marker.description.en || ""
      : "";

  // 좌표
  const hasCoord =
    typeof marker.lat === "number" && typeof marker.lng === "number";

  // breadcrumb 경로 구성 (대륙/국가/도시가 있을 때만 링크)
  const crumbs = [{ label: "홈", href: "/" }];
  if (continent) crumbs.push({ label: continentLabel, href: `/${continent}` });
  if (continent && countryUpper) {
    crumbs.push({
      label: countryLabel,
      href: `/${continent}/${countryUpper.toLowerCase()}`,
    });
  }
  if (continent && countryUpper && cityName) {
    crumbs.push({
      label: cityName,
      href: `/${continent}/${countryUpper.toLowerCase()}/${citySlug(cityName)}`,
    });
  }
  crumbs.push({ label: name });

  // JSON-LD: TouristAttraction
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name,
    description: descKo || descEn || undefined,
    image: thumb || undefined,
    url: `${SITE_URL}/marker/${markerId}`,
    address:
      cityName || countryLabel
        ? {
            "@type": "PostalAddress",
            addressLocality: cityName || undefined,
            addressCountry: countryUpper || undefined,
          }
        : undefined,
    geo: hasCoord
      ? {
          "@type": "GeoCoordinates",
          latitude: marker.lat,
          longitude: marker.lng,
        }
      : undefined,
  };

  return (
    <SeoPageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb items={crumbs} />

      {/* 제목 + 지역 + LIVE */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-live-light px-2 py-0.5 text-xs font-semibold text-live">
          🔴 LIVE
        </span>
        {(cityName || countryLabel) && (
          <span className="text-sm text-ink-muted">
            {[cityName, countryLabel].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">{name}</h1>

      {/* 태그 */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 인라인 영상 (없으면 썸네일) */}
      <div className="mt-5 max-w-3xl">
        {videoId ? (
          <YouTubeEmbed videoId={videoId} title={name} />
        ) : thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={name}
            className="w-full rounded-lg border border-border"
          />
        ) : null}
      </div>

      {/* 지도에서 보기 버튼 */}
      <div className="mt-5">
        <Link
          href={`/?markerId=${marker.id}`}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          🗺️ 지도에서 보기
        </Link>
      </div>

      {/* AI 장소 설명 (확정된 것만) */}
      {(descKo || descEn) && (
        <div className="mt-8 max-w-3xl space-y-4">
          <h2 className="font-display text-lg font-bold text-ink">장소 소개</h2>
          {descKo && (
            <p className="text-sm leading-relaxed text-ink-muted">{descKo}</p>
          )}
          {descEn && (
            <p className="text-sm leading-relaxed text-ink-muted/80">{descEn}</p>
          )}
        </div>
      )}

      {/* 관련 영상 — 같은 도시 → 같은 국가 → 같은 대륙의 다른 라이브캠.
          영상을 다 본 방문자가 이어서 볼 콘텐츠를 붙여 연속 탐색을 유도한다(이탈률 전략).
          관련 마커가 하나도 없으면 섹션 자체를 렌더하지 않는다(빈 공간 금지 — CLAUDE.md 14절). */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">
            주변의 다른 라이브캠
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((rm) => (
              // ⚠️ 각 카드는 자기 마커(rm)의 id 로만 링크한다.
              <RegionCard key={rm.id} marker={rm} href={`/marker/${rm.id}`} />
            ))}
          </div>
        </section>
      )}

      {/* 좌표 */}
      {hasCoord && (
        <p className="mt-8 text-xs text-ink-muted">
          좌표: {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
        </p>
      )}
    </SeoPageShell>
  );
}
