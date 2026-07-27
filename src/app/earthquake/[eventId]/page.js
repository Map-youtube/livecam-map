// ─────────────────────────────────────────────────────────────
// 지진 상세 페이지 — /earthquake/[eventId]  (SEO 정적 페이지, 요구사항 6)
//
// 왜 필요한가:
//   큰 지진이 나면 그 지역명으로 검색량이 폭증한다. 그런데 알림 팝업은 자바스크립트로 그리는
//   것이라 검색엔진이 읽지 못한다 → 검색 유입이 0이다. 그래서 지진 1건마다 "서버에서 렌더되는
//   실제 페이지"를 만들어, 지진 정보 + 진앙에서 가장 가까운 라이브캠을 함께 담는다.
//   (알림 팝업의 '자세히 보기' 와 sitemap.xml 이 이 페이지로 연결된다.)
//
// 데이터: USGS 공식 이벤트 API(무료, 키 불필요)에서 eventId 로 단건 조회한다.
//   https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=...&format=geojson
//   → 24시간 피드에서 사라진 과거 지진도 조회되므로, 오래된 링크도 계속 살아있다.
//
// ⚠️ 비용: USGS 는 무료. 인근 라이브캠은 이미 만들어둔 마커 청크 인덱스에서 읽으므로
//    Firestore 읽기는 문서 몇 개뿐이고, 페이지는 ISR 로 1시간 캐시된다.
// ⚠️ 빌드 시 사전 생성하지 않는다(generateStaticParams: []). 지진은 수시로 생기므로
//    요청이 온 것만 on-demand 로 만들고 24시간 캐시한다(읽기 폭증 방지 원칙과 동일).
// ─────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { getMapMarkers } from "@/lib/getMapMarkers";
import {
  findNearestMarkers,
  formatDistanceKm,
  pagerAlertStyle,
} from "@/lib/earthquakeAlert";
import { getMagnitudeColor } from "@/lib/earthquakeUtils";
import { getMarkerThumb } from "@/lib/seoData";

export const revalidate = 3600; // 1시간
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

const USGS_EVENT_API =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=";

// ─── USGS 단건 조회 → 우리 형태로 정규화 ──────────────────────
async function fetchEarthquake(eventId) {
  try {
    const id = String(eventId || "").trim();
    // 이벤트 id 는 영숫자 조합이다. 그 외 문자가 섞이면 조회하지 않는다(잘못된 요청 차단).
    if (!id || !/^[A-Za-z0-9_-]{3,40}$/.test(id)) return null;

    const res = await fetch(`${USGS_EVENT_API}${encodeURIComponent(id)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const f = await res.json();
    const p = (f && f.properties) || {};
    const coords =
      f && f.geometry && Array.isArray(f.geometry.coordinates)
        ? f.geometry.coordinates
        : [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const depth = Number(coords[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return {
      id: f.id || id,
      magnitude: typeof p.mag === "number" ? p.mag : null,
      place: p.place || "",
      title: p.title || "",
      time: typeof p.time === "number" ? p.time : null,
      depthKm: Number.isNaN(depth) ? null : depth,
      tsunami: p.tsunami === 1 ? 1 : 0,
      alert: typeof p.alert === "string" ? p.alert : null,
      felt: typeof p.felt === "number" ? p.felt : null,
      url: typeof p.url === "string" ? p.url : "",
      lat,
      lng,
    };
  } catch (error) {
    console.error("[earthquake] USGS 조회 실패:", eventId, error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 한글+영어 병기 (이 페이지만 예외 — 지진은 해외 검색량이 압도적이라
//    영어 검색 매칭을 위해 다른 SEO 페이지(한국어 고정)와 다르게 이중 언어로 렌더한다) ──
// 짧은 라벨/배지용: "한국어 · English" 한 줄로.
function bi(ko, en) {
  return en ? `${ko} · ${en}` : ko;
}

// 날짜 표기: 한국어 + 영어 두 가지 로캘로 각각 포맷해 나란히 보여준다.
function formatKo(time) {
  if (time == null) return "";
  try {
    return new Date(time).toLocaleString("ko-KR", {
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
function formatEn(time) {
  if (time == null) return "";
  try {
    return new Date(time).toLocaleString("en-US", {
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
function formatDateOnly(time) {
  if (time == null) return "";
  try {
    return new Date(time).toISOString().slice(0, 10);
  } catch (error) {
    return "";
  }
}

function magText(mag) {
  return typeof mag === "number" ? mag.toFixed(1) : "-";
}

// 빌드 시 사전 생성 안 함(요청 시 생성 + ISR 캐시)
export function generateStaticParams() {
  return [];
}

// ─── SEO 메타데이터 ──────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const { eventId } = await params;
    const eq = await fetchEarthquake(eventId);
    if (!eq) return { title: "찾을 수 없음 | TripByClip" };

    const mag = magText(eq.magnitude);
    const place = eq.place || "";
    const date = formatDateOnly(eq.time);
    // ⚠️ 이 페이지만 한글+영어 병기(다른 SEO 페이지는 한국어 고정) — 지진은 해외 검색량이
    //    압도적으로 커서, title/description 에 영어 키워드("Earthquake")가 없으면 "Chile
    //    earthquake" 같은 영어 검색에 전혀 매칭되지 않는다. place 는 USGS 원문이 이미
    //    영어라 국가/지명은 자연히 병기된다.
    const title = `규모 ${mag} 지진 · ${place} | M${mag} Earthquake | TripByClip`;
    const description =
      `${date} ${place}에서 규모 ${mag} 지진이 발생했습니다.` +
      (eq.depthKm != null ? ` 진원 깊이 약 ${Math.round(eq.depthKm)}km.` : "") +
      " 진앙에서 가장 가까운 실시간 라이브캠을 지도와 함께 확인하세요." +
      ` · A magnitude ${mag} earthquake struck ${place} on ${date}` +
      (eq.depthKm != null ? ` (depth ~${Math.round(eq.depthKm)}km)` : "") +
      ". View live webcams nearest to the epicenter.";

    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/earthquake/${eq.id}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/earthquake/${eq.id}`,
        type: "article",
      },
    };
  } catch (error) {
    console.error("[earthquake] generateMetadata 실패:", error); // TODO: 배포 전 제거
    return { title: "TripByClip" };
  }
}

// ─── 페이지 ──────────────────────────────────────────────────
export default async function EarthquakePage({ params }) {
  const { eventId } = await params;
  const eq = await fetchEarthquake(eventId);
  if (!eq) {
    notFound();
  }

  // 진앙에서 가장 가까운 공개 라이브캠 (요구사항 2·3 과 동일 기준)
  let nearest = [];
  try {
    const markers = await getMapMarkers();
    nearest = findNearestMarkers(markers, eq.lat, eq.lng, {
      limit: 8,
      maxKm: 3000,
    });
  } catch (error) {
    console.error("[earthquake] 인근 마커 조회 실패:", error); // TODO: 배포 전 제거
    nearest = [];
  }

  const mag = magText(eq.magnitude);
  const magColor = getMagnitudeColor(eq.magnitude);
  const pager = pagerAlertStyle(eq.alert);
  // 한글+영어 병기 (PAGER_LABELS)
  const PAGER_LABELS = {
    eqPagerGreen: ["피해 거의 없음", "Minimal impact"],
    eqPagerYellow: ["국지적 피해 우려", "Local impact expected"],
    eqPagerOrange: ["지역적 피해 우려", "Regional impact expected"],
    eqPagerRed: ["광범위한 피해 우려", "Extensive impact expected"],
  };
  const pagerLabel = pager ? bi(...PAGER_LABELS[pager.key]) : null;
  const timeKo = formatKo(eq.time);
  const timeEn = formatEn(eq.time);
  const dateOnly = formatDateOnly(eq.time);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `규모 ${mag} 지진 · ${eq.place} · M${mag} Earthquake`,
    datePublished: eq.time ? new Date(eq.time).toISOString() : undefined,
    description:
      `${dateOnly} ${eq.place}에서 규모 ${mag} 지진이 발생했습니다. · ` +
      `A magnitude ${mag} earthquake struck ${eq.place} on ${dateOnly}.`,
    about: {
      "@type": "Place",
      name: eq.place,
      geo: {
        "@type": "GeoCoordinates",
        latitude: eq.lat,
        longitude: eq.lng,
      },
    },
    isBasedOn: eq.url || undefined,
    mainEntityOfPage: `${SITE_URL}/earthquake/${eq.id}`,
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
          { label: bi(`규모 ${mag} 지진`, `M${mag} Earthquake`) },
        ]}
      />

      {/* ── 제목 + 규모 배지 (한글+영어 병기) ── */}
      <div className="flex items-start gap-3">
        <span
          className="mt-1 flex-none rounded-md px-2.5 py-1.5 text-base font-bold text-white"
          style={{ backgroundColor: magColor }}
        >
          M{mag}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">
            규모 {mag} 지진
            <span className="ml-2 text-lg font-normal text-ink-muted">
              M{mag} Earthquake
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{eq.place}</p>
        </div>
      </div>

      {/* ── 경보 배지 ── */}
      {(eq.tsunami === 1 || pagerLabel) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {eq.tsunami === 1 && (
            <span className="rounded-full bg-live-light px-2.5 py-1 text-xs font-semibold text-live">
              🌊 {bi("쓰나미 경보 대상 지역", "Tsunami warning area")}
            </span>
          )}
          {pagerLabel && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: pager.color }}
            >
              {bi("예상 피해", "Expected impact")}: {pagerLabel}
            </span>
          )}
        </div>
      )}

      {/* ── 지진 정보 ── */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-bold text-ink">
          {bi("지진 정보", "Earthquake Information")}
        </h2>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("규모", "Magnitude")}</dt>
            <dd className="font-semibold text-ink">M {mag}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("발생시각", "Time")} (UTC)</dt>
            <dd className="text-ink">
              {timeKo || "-"}
              {timeEn && (
                <span className="block text-xs text-ink-muted">{timeEn}</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("진원 깊이", "Depth")}</dt>
            <dd className="text-ink">
              {eq.depthKm != null ? `${Math.round(eq.depthKm)} km` : "-"}
            </dd>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <dt className="text-ink-muted">{bi("진앙 좌표", "Coordinates")}</dt>
            <dd className="font-mono text-xs text-ink">
              {eq.lat.toFixed(4)}, {eq.lng.toFixed(4)}
            </dd>
          </div>
          {eq.felt != null && (
            <div className="flex justify-between border-b border-border py-1.5">
              <dt className="text-ink-muted">
                {bi("체감 신고", "Felt reports")}
              </dt>
              <dd className="text-ink">{eq.felt.toLocaleString()}건 / reports</dd>
            </div>
          )}
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          {bi("출처: 미국 지질조사국(USGS)", "Source: USGS (U.S. Geological Survey)")}
          {eq.url && (
            <>
              {" · "}
              <a
                href={eq.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                USGS ↗
              </a>
            </>
          )}
        </p>
      </section>

      {/* ── 진앙에서 가장 가까운 라이브캠 ── */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink">
          {bi(
            "진앙에서 가장 가까운 실시간 라이브캠",
            "Nearest Live Cams to the Epicenter"
          )}
        </h2>
        {nearest.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            이 지진의 진앙 주변에는 아직 등록된 라이브캠이 없습니다.{" "}
            <Link href="/" className="text-brand hover:underline">
              세계 라이브 지도 보기 →
            </Link>
            <span className="mt-1 block text-xs">
              No live cams are registered near this epicenter yet.{" "}
              <Link href="/" className="text-brand hover:underline">
                View the world live map →
              </Link>
            </span>
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              진앙에서 가까운 순서로 {nearest.length}곳입니다. 각 영상을 눌러 현재
              모습을 실시간으로 확인해 보세요.
              <span className="mt-1 block text-xs">
                {nearest.length} nearest live cams to the epicenter, sorted by
                distance. Click any video to watch it live.
              </span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {nearest.map((m) => {
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
                      {/* 진앙으로부터의 거리 (요구사항 3) */}
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
        ⚠️ 이 페이지의 지진 정보는 미국 지질조사국(USGS)이 제공하는 자동 관측 자료이며,
        분석이 진행되면서 규모·깊이 등이 수정될 수 있습니다. 재난 대응은 반드시 각국
        기상·방재 기관의 공식 발표를 따르세요.
        <span className="mt-1 block">
          Earthquake data on this page is automated, sourced from the USGS, and
          may be revised as analysis continues. For disaster response, always
          follow official announcements from your local meteorological or
          emergency management agency.
        </span>
      </p>
    </SeoPageShell>
  );
}
