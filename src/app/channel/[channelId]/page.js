// ─────────────────────────────────────────────────────────────
// 라이브 채널 상세 SEO 페이지 — /channel/[channelId]
//
// - 자동 라이브 채널(방송국 등) 1개의 목록 페이지: 채널명 + 분류(대/중/소) + 현재 라이브 영상.
// - generateStaticParams: 활성 채널 전부 → 채널이 늘면 정적 페이지도 자동 생성
//   (dynamicParams=true 라 신규 채널은 방문 시 즉시 렌더 + 사이트맵으로 색인).
// - 채널 데이터는 getLiveChannels(tag:"live-channels")를 쓰므로, 관리자가 채널을 추가/수정/삭제하면
//   revalidateTag("live-channels")로 이 페이지도 함께 갱신된다. 삭제되면 notFound()(404).
// - 라이브 영상은 getLiveChannelVideosCached(30분 캐시)를 공유 → 추가 YouTube 비용 없음.
// - JSON-LD: VideoObject(BroadcastEvent, isLiveBroadcast)
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getChannelById } from "@/lib/getChannelById";
import { getLiveChannelVideosCached } from "@/lib/getLiveChannelVideos";
import { getRelatedChannels } from "@/lib/relatedChannels";
import { capitalizeWords } from "@/lib/textCase";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import YouTubeEmbed from "@/components/seo/YouTubeEmbed";

export const revalidate = 86400;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─── 정적 생성: 활성 채널 전부 ───────────────────────────────
export async function generateStaticParams() {
  try {
    const channels = await getLiveChannels();
    return (Array.isArray(channels) ? channels : [])
      .filter((c) => c && c.id)
      .map((c) => ({ channelId: String(c.id) }));
  } catch (error) {
    console.error("[channel] generateStaticParams 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 분류 경로 라벨 배열 (대/중/소 중 값이 있는 것만)
function categoryPath(ch) {
  return [ch.major_category, ch.middle_category, ch.minor_category]
    .map((x) => (x ? String(x).trim() : ""))
    .filter(Boolean)
    .map((x) => capitalizeWords(x));
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { channelId } = await params;
    const ch = await getChannelById(channelId);
    if (!ch) return { title: "찾을 수 없음 | TripByClip" };

    const name = ch.channel_name || ch.minor_category || "라이브 채널";
    const path = categoryPath(ch).join(" · ");
    const desc = `${name}${path ? " (" + path + ")" : ""} 실시간 라이브 방송을 지도와 함께 시청하세요. 24시간 생중계.`;
    const title = `${name}${path ? " · " + path : ""} 실시간 라이브 | TripByClip`;
    return {
      title,
      description: desc.slice(0, 200),
      alternates: { canonical: `${SITE_URL}/channel/${channelId}` },
      openGraph: {
        title,
        description: desc.slice(0, 200),
        url: `${SITE_URL}/channel/${channelId}`,
        type: "website",
      },
    };
  } catch (error) {
    console.error("[channel] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function ChannelPage({ params }) {
  const { channelId } = await params;
  const ch = await getChannelById(channelId);
  // 존재하지 않거나 비활성 → 404 (getLiveChannels 는 is_active !== false 만 반환)
  if (!ch) {
    notFound();
  }

  const name = ch.channel_name || ch.minor_category || "(채널명 없음)";
  const path = categoryPath(ch);

  // 이 채널의 현재 라이브 영상 (공유 30분 캐시 → 추가 비용 없음)
  // byChannel(채널별 라이브 영상 맵)은 관련 채널의 라이브 개수 표시에도 재사용한다.
  let byChannel = {};
  let videos = [];
  try {
    byChannel = await getLiveChannelVideosCached();
    videos = Array.isArray(byChannel[ch.id]) ? byChannel[ch.id] : [];
  } catch (error) {
    console.error("[channel] 라이브 영상 조회 실패:", error); // TODO: 배포 전 제거
  }
  const firstVideo = videos[0] || null;
  const isLiveNow = !!firstVideo; // 지금 실제로 방송 중인가

  // 같은 분류의 다른 채널 (라이브 없을 때 페이지가 비지 않도록 + 연속 탐색). 추가 비용 없음.
  const related = await getRelatedChannels(ch, byChannel, 8);

  // breadcrumb: 홈 > (대분류) > (중분류) > 채널명
  const crumbs = [{ label: "홈", href: "/" }];
  for (const label of path.slice(0, -1)) crumbs.push({ label });
  crumbs.push({ label: name });

  // JSON-LD: 라이브 영상이 있으면 VideoObject(BroadcastEvent)
  const jsonLd = firstVideo
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: firstVideo.title || name,
        description: `${name} 실시간 라이브 방송`,
        thumbnailUrl: firstVideo.thumbnailUrl || undefined,
        embedUrl: `https://www.youtube.com/embed/${firstVideo.videoId}`,
        uploadDate: new Date().toISOString(),
        url: `${SITE_URL}/channel/${channelId}`,
        publication: {
          "@type": "BroadcastEvent",
          isLiveBroadcast: true,
          startDate: new Date().toISOString(),
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name,
        url: `${SITE_URL}/channel/${channelId}`,
      };

  return (
    <SeoPageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb items={crumbs} />

      {/* 제목 + 분류 + 상태 배지 (실제 라이브 여부에 따라 표시) */}
      <div className="flex flex-wrap items-center gap-2">
        {isLiveNow ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-live-light px-2 py-0.5 text-xs font-semibold text-live">
            🔴 LIVE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-ink-muted">
            ⚫ 방송 대기 중
          </span>
        )}
        {path.length > 0 && (
          <span className="text-sm text-ink-muted">{path.join(" · ")}</span>
        )}
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">{name}</h1>

      {/* 현재 라이브 영상 (첫 영상 인라인 재생) */}
      {firstVideo ? (
        <div className="mt-5 max-w-3xl">
          <YouTubeEmbed
            videoId={firstVideo.videoId}
            title={firstVideo.title || name}
          />
          {firstVideo.title && (
            <p className="mt-2 text-sm font-medium text-ink">
              {firstVideo.title}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-ink-muted">
          현재 방송 중인 라이브가 없습니다. 잠시 후 다시 확인해 주세요.
        </p>
      )}

      {/* 지도에서 보기 */}
      <div className="mt-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          🗺️ 지도에서 보기
        </Link>
      </div>

      {/* 이 채널의 다른 라이브 영상 목록 (2개 이상일 때) */}
      {videos.length > 1 && (
        <div className="mt-8 max-w-3xl">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">
            현재 라이브 방송 ({videos.length})
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {videos.map((v) => (
              <li
                key={v.videoId}
                className="overflow-hidden rounded-lg border border-border bg-surface"
              >
                <a
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      v.thumbnailUrl ||
                      `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
                    }
                    alt={v.title || name}
                    className="aspect-video w-full object-cover"
                  />
                  <p className="line-clamp-2 p-2 text-xs text-ink">
                    {v.title || name}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 같은 분류의 다른 채널 — 라이브가 없어도 페이지가 비지 않게 + 연속 탐색 유도.
          관련 채널이 없으면 섹션 자체를 렌더하지 않는다(빈 공간 금지 — CLAUDE.md 14절). */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">
            같은 분류의 다른 채널
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((rc) => {
              // ⚠️ 각 카드는 자기 채널(rc)의 id/분류/라이브수만 참조한다.
              const rcPath = categoryPath(rc).join(" · ");
              return (
                <Link
                  key={rc.id}
                  href={`/channel/${rc.id}`}
                  className="group block rounded-lg border border-border bg-surface p-3 shadow-card transition duration-150 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
                      {rc.channel_name || rc.minor_category || "(채널)"}
                    </span>
                    {rc.liveCount > 0 ? (
                      <span
                        className="flex-none rounded-full bg-live-light px-1.5 py-0.5 text-[11px] font-semibold text-live"
                        title="현재 라이브 방송 수"
                      >
                        🔴 {rc.liveCount}
                      </span>
                    ) : (
                      <span className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                        대기
                      </span>
                    )}
                  </div>
                  {rcPath && (
                    <p className="mt-1 truncate text-xs text-ink-muted">
                      {rcPath}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </SeoPageShell>
  );
}
