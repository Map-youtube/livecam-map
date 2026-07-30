// ─────────────────────────────────────────────────────────────
// 로켓 발사 상세 페이지 — /launch/[slug]  (SEO 정적 페이지, 2026-07-30 신설)
//
// 왜 필요한가:
//   NASA/SpaceX 발사는 전 세계 검색량이 폭증하는 이벤트다. 그리고 지진과 달리
//   **발사 일정이 미리 공개되므로 이벤트 전에 페이지를 만들어 미리 색인시킬 수 있다.**
//   발사 당일 검색이 몰릴 때 이미 순위에 올라가 있는 상태를 만드는 것이 목표다.
//
// 이 페이지만의 콘텐츠(다른 발사 정보 사이트에 없는 것):
//   발사장에서 가장 가까운 "실시간 라이브캠". 실측 기준 케이프커내버럴 17km,
//   스타베이스 0km 지점에 NASA/SpaceX 전용 24시간 라이브캠이 등록돼 있다.
//
// ⚠️ 얇은 페이지(thin content) 방지: 발사장 300km 안에 라이브캠이 없으면 이 페이지는
//    발사 정보만 남아 다른 사이트와 차별점이 없다 → 그런 발사는 noindex 로 색인을 막고
//    사이트맵·목록에도 넣지 않는다(아래 generateMetadata / sitemap.js / launch/page.js).
//    404 로 처리하지 않는 이유: 마커 조회가 일시적으로 실패했을 때 정상 페이지가
//    사라지는 사고를 막기 위함(색인만 막고 화면은 유지한다).
//
// ⚠️ 비용: 발사 데이터는 무료 API(Launch Library 2, 키 불필요)를 3시간 스냅샷으로 읽으므로
//    방문자당 Firestore 읽기는 스냅샷 1건 + 마커 청크 인덱스 몇 건뿐이다. YouTube 호출 0.
// ⚠️ 빌드 시 사전 생성하지 않는다(generateStaticParams: []). 일정이 자주 바뀌므로
//    요청이 온 것만 on-demand 로 만들고 ISR 로 캐시한다(읽기 폭증 방지 원칙과 동일).
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { getMapMarkers } from "@/lib/getMapMarkers";
import { getMarkerThumb } from "@/lib/seoData";
import { formatDistanceKm } from "@/lib/earthquakeAlert";
import {
  getLaunchBySlug,
  getNearbyForLaunch,
  isPast,
  LAUNCH_NEAR_KM,
} from "@/lib/launchData";

// 발사 일정은 연기가 잦으므로 지진(1시간)과 같은 수준으로 자주 갱신한다.
export const revalidate = 3600; // 1시간
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// 빌드 시 사전 생성 안 함(요청 시 생성 + ISR 캐시)
export function generateStaticParams() {
  return [];
}

// ─── 한글+영어 병기 (지진 페이지와 동일한 이유 — 해외 검색량이 압도적) ──
function bi(ko, en) {
  return en ? `${ko} · ${en}` : ko;
}

function formatKo(ms) {
  if (ms == null) return "";
  try {
    return new Date(ms).toLocaleString("ko-KR", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}
function formatEn(ms) {
  if (ms == null) return "";
  try {
    return new Date(ms).toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}
function formatDateOnly(ms) {
  if (ms == null) return "";
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch (error) {
    return "";
  }
}

// 발사까지 남은 기간을 사람이 읽는 문구로 (서버 렌더라 "실시간 초 단위"는 하지 않는다)
function countdownText(launch, now = Date.now()) {
  try {
    const diff = launch.netMs - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return { ko: `D-${days}`, en: `T-minus ${days} days` };
    return { ko: `약 ${hours}시간 뒤`, en: `in about ${hours} hours` };
  } catch (error) {
    return null;
  }
}

// 발사 성공/실패/예정 배지 색
function statusStyle(abbrev) {
  const a = String(abbrev || "").toLowerCase();
  if (a === "success") return { bg: "#137333", ko: "발사 성공", en: "Success" };
  if (a === "failure") return { bg: "#c5221f", ko: "발사 실패", en: "Failure" };
  if (a === "go") return { bg: "#146c6b", ko: "발사 예정", en: "Go for Launch" };
  if (a === "tbd") return { bg: "#a35a00", ko: "일정 미확정", en: "Date TBD" };
  if (a === "hold") return { bg: "#a35a00", ko: "발사 보류", en: "On Hold" };
  return null;
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { slug } = await params;
    const launch = await getLaunchBySlug(slug);
    if (!launch) return { title: "찾을 수 없음 | TripByClip" };

    // 인근 라이브캠 유무로 색인 여부를 정한다(얇은 페이지 색인 방지).
    //   ⚠️ getMapMarkers 내부의 청크 인덱스 조회는 React cache 로 렌더당 1회만 실행되므로,
    //      본문에서 다시 불러도 추가 Firestore 읽기가 없다.
    let markers = [];
    try {
      markers = await getMapMarkers();
    } catch (error) {
      markers = [];
    }
    const nearby = getNearbyForLaunch(launch, markers);
    // 마커 조회 자체가 실패했으면(빈 배열) 색인 여부를 함부로 낮추지 않는다.
    const markersLoaded = Array.isArray(markers) && markers.length > 0;
    const thin = markersLoaded && nearby.length === 0;

    const date = formatDateOnly(launch.netMs);
    const rocket = launch.rocket || launch.name;
    const place = launch.padLocation || launch.padName;

    const title = `${rocket} 발사 · ${date} · ${place} | ${rocket} Launch Live | TripByClip`;
    const description =
      `${date} ${place}에서 ${rocket} 로켓이 발사됩니다.` +
      (launch.missionName ? ` 임무: ${launch.missionName}.` : "") +
      " 발사장에서 가장 가까운 실시간 라이브캠을 지도와 함께 확인하세요." +
      ` · ${rocket} launches from ${place} on ${date}.` +
      " Watch live webcams nearest to the launch pad.";

    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/launch/${launch.slug}` },
      // 얇은 페이지는 색인하지 않되 링크는 따라가게 둔다(follow).
      robots: thin ? { index: false, follow: true } : undefined,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/launch/${launch.slug}`,
        type: "article",
        images: launch.image ? [launch.image] : undefined,
      },
    };
  } catch (error) {
    console.error("[launch] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function LaunchPage({ params }) {
  const { slug } = await params;
  const launch = await getLaunchBySlug(slug);
  if (!launch) {
    notFound();
  }

  let markers = [];
  try {
    markers = await getMapMarkers();
  } catch (error) {
    console.error("[launch] 마커 조회 실패:", error); // TODO: 배포 전 제거
  }
  const nearby = getNearbyForLaunch(launch, markers);

  const past = isPast(launch);
  const status = statusStyle(launch.statusAbbrev);
  const countdown = past ? null : countdownText(launch);
  const timeKo = formatKo(launch.netMs);
  const timeEn = formatEn(launch.netMs);
  const dateOnly = formatDateOnly(launch.netMs);
  const rocket = launch.rocket || launch.name;
  const place = launch.padLocation || launch.padName;

  // 예정된 발사는 schema.org Event 로 표현한다(검색결과에 일정으로 노출될 수 있음).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${rocket} 발사 · ${rocket} Launch`,
    startDate: new Date(launch.netMs).toISOString(),
    eventStatus: past
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    description:
      `${dateOnly} ${place}에서 ${rocket} 로켓이 발사됩니다. · ` +
      `${rocket} launches from ${place} on ${dateOnly}.`,
    location: {
      "@type": "Place",
      name: place || launch.padName,
      geo: {
        "@type": "GeoCoordinates",
        latitude: launch.lat,
        longitude: launch.lng,
      },
    },
    image: launch.image || undefined,
    organizer: launch.provider
      ? { "@type": "Organization", name: launch.provider }
      : undefined,
    mainEntityOfPage: `${SITE_URL}/launch/${launch.slug}`,
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
          { label: bi("로켓 발사", "Rocket Launches"), href: "/launch" },
          { label: rocket },
        ]}
      />

      {/* ── 제목 + 상태 배지 ── */}
      <div className="flex items-start gap-3">
        <span className="mt-1 flex-none text-2xl" aria-hidden="true">
          🚀
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">
            {rocket} {bi("발사", "Launch")}
          </h1>
          {launch.missionName && (
            <p className="mt-1 text-sm text-ink-muted">
              {bi("임무", "Mission")}: {launch.missionName}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {status && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: status.bg }}
          >
            {bi(status.ko, status.en)}
          </span>
        )}
        {countdown && (
          <span className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
            ⏱ {bi(countdown.ko, countdown.en)}
          </span>
        )}
      </div>

      {/* ── 발사 정보 ── */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-bold text-ink">
          {bi("발사 정보", "Launch Details")}
        </h2>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("발사 예정", "Launch Time")} (UTC)</dt>
            <dd className="text-right text-ink">
              {timeKo || "-"}
              {timeEn && (
                <span className="block text-xs text-ink-muted">{timeEn}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("로켓", "Rocket")}</dt>
            <dd className="text-right font-semibold text-ink">{rocket || "-"}</dd>
          </div>
          {launch.provider && (
            <div className="flex justify-between border-b border-border py-1.5">
              <dt className="text-ink-muted">{bi("발사 기관", "Provider")}</dt>
              <dd className="text-right text-ink">{launch.provider}</dd>
            </div>
          )}
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("발사장", "Launch Pad")}</dt>
            <dd className="text-right text-ink">
              {launch.padName || "-"}
              {place && (
                <span className="block text-xs text-ink-muted">{place}</span>
              )}
            </dd>
          </div>
          {launch.missionType && (
            <div className="flex justify-between border-b border-border py-1.5">
              <dt className="text-ink-muted">{bi("임무 유형", "Mission Type")}</dt>
              <dd className="text-right text-ink">{launch.missionType}</dd>
            </div>
          )}
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("발사장 좌표", "Pad Coordinates")}</dt>
            <dd className="text-right font-mono text-xs text-ink">
              {launch.lat.toFixed(4)}, {launch.lng.toFixed(4)}
            </dd>
          </div>
        </dl>

        {launch.missionDescription && (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {launch.missionDescription}
          </p>
        )}

        <p className="mt-2 text-xs text-ink-muted">
          {bi(
            "출처: The Space Devs (Launch Library)",
            "Source: The Space Devs (Launch Library)"
          )}
          {launch.padWiki && (
            <>
              {" · "}
              <a
                href={launch.padWiki}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {bi("발사장 정보", "About this pad")} ↗
              </a>
            </>
          )}
        </p>
      </section>

      {/* ── 공식 중계 링크 (발사 직전에야 채워지는 경우가 많아 있을 때만 표시) ── */}
      {launch.webcastUrls.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-ink">
            {bi("공식 생중계", "Official Webcast")}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {launch.webcastUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {url} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 발사장에서 가장 가까운 라이브캠 (이 사이트만의 콘텐츠) ── */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink">
          {bi(
            "발사장에서 가장 가까운 실시간 라이브캠",
            "Nearest Live Cams to the Launch Pad"
          )}
        </h2>
        {nearby.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            이 발사장에서 {LAUNCH_NEAR_KM}km 이내에는 등록된 라이브캠이 없습니다.{" "}
            <Link href="/" className="text-brand hover:underline">
              세계 라이브 지도 보기 →
            </Link>
            <span className="mt-1 block text-xs">
              No live cams are registered within {LAUNCH_NEAR_KM} km of this
              launch pad.{" "}
              <Link href="/" className="text-brand hover:underline">
                View the world live map →
              </Link>
            </span>
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              발사장에서 가까운 순서로 {nearby.length}곳입니다. 각 영상을 눌러
              현재 모습을 실시간으로 확인해 보세요.
              <span className="mt-1 block text-xs">
                {nearby.length} nearest live cams to the launch pad, sorted by
                distance. Click any video to watch it live.
              </span>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {nearby.map((m) => {
                // ⚠️ 각 카드는 자기 자신(m)의 데이터·거리만 참조한다.
                const thumb = getMarkerThumb(m);
                return (
                  <Link
                    key={m.id}
                    href={`/marker/${m.id}`}
                    className="group block overflow-hidden rounded-lg border border-border bg-surface shadow-card transition duration-150 hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-ink/5">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={m.location || "라이브캠 썸네일"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">
                          이미지 없음
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-white">
                        📍 {formatDistanceKm(m.distanceKm)}
                      </span>
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink">
                        {m.location || "(장소명 없음)"}
                      </h3>
                      {(m.city || m.country) && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {[m.city, m.country].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      <p className="mt-8 text-xs text-ink-muted">
        ⚠️ 발사 일정은 기상·기술적 사유로 수시로 변경되거나 연기될 수 있습니다. 실제
        발사 여부는 발사 기관의 공식 발표를 확인하세요.
        <span className="mt-1 block">
          Launch schedules frequently change or slip due to weather and technical
          issues. Always check the launch provider&apos;s official announcements.
        </span>
      </p>
    </SeoPageShell>
  );
}
