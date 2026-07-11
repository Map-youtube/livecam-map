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
import {
  getNormalizedPublicMarkers,
  getMarkerThumb,
  citySlug,
} from "@/lib/seoData";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import YouTubeEmbed from "@/components/seo/YouTubeEmbed";

export const revalidate = 86400;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성: 모든 공개 마커 id ───────────────────────────
export async function generateStaticParams() {
  try {
    const markers = await getNormalizedPublicMarkers();
    return markers
      .filter((m) => m && m.id)
      .map((m) => ({ markerId: String(m.id) }));
  } catch (error) {
    console.error("[marker] generateStaticParams 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 공개 마커 1개 조회 (없으면 null)
async function getPublicMarkerById(id) {
  const markers = await getNormalizedPublicMarkers();
  return markers.find((m) => m && String(m.id) === String(id)) || null;
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

      {/* 좌표 */}
      {hasCoord && (
        <p className="mt-8 text-xs text-ink-muted">
          좌표: {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
        </p>
      )}
    </SeoPageShell>
  );
}
