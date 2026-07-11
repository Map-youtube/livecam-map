// ─────────────────────────────────────────────────────────────
// RegionCard — SEO 목록 페이지의 마커 카드 (썸네일 + 장소명 + 도시/국가 + LIVE 배지)
//
// props:
//   - marker : 공개 마커 객체
//   - href   : 카드 클릭 시 이동할 경로 (대륙/국가 목록 → /?markerId=xxx, 도시 목록 → /marker/xxx)
//
// 서버 컴포넌트. 외부 유튜브 썸네일이라 next/image 대신 <img> 사용(lazy 로딩).
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { getMarkerThumb } from "@/lib/seoData";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";

export default function RegionCard({ marker, href }) {
  const thumb = getMarkerThumb(marker);
  const country = marker.country
    ? COUNTRY_NAME_BY_CODE[marker.country] || marker.country
    : "";
  const region = [marker.city, country].filter(Boolean).join(", ");
  const tags = Array.isArray(marker.tags) ? marker.tags : [];

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-lg border border-border bg-surface shadow-card transition duration-150 hover:-translate-y-0.5"
    >
      {/* 썸네일 (16:9) + LIVE 배지 */}
      <div className="relative aspect-video w-full overflow-hidden bg-ink/5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={marker.location || "라이브캠 썸네일"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">
            이미지 없음
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-live-light px-2 py-0.5 text-xs font-semibold text-live shadow-card">
          🔴 LIVE
        </span>
      </div>

      {/* 본문 */}
      <div className="p-3">
        <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink">
          {marker.location || "(장소명 없음)"}
        </h3>
        {region && <p className="mt-1 text-xs text-ink-muted">{region}</p>}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
