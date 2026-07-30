// ─────────────────────────────────────────────────────────────
// 로켓 발사 목록 페이지 — /launch  (SEO 허브 페이지, 2026-07-30 신설)
//
// 왜 필요한가:
//   1) 검색엔진이 개별 발사 페이지(/launch/[slug])를 발견하는 통로가 된다(내부 링크 허브).
//   2) "로켓 발사 일정", "rocket launch schedule live" 같은 상시 검색어를 받는다
//      — 개별 발사 페이지는 이벤트가 끝나면 검색량이 사라지지만 이 목록은 계속 유효하다.
//   3) 방문자가 다음 발사로 이어서 탐색하게 해 이탈률을 낮춘다.
//
// ⚠️ 얇은 페이지 방지: 발사장 인근(300km)에 라이브캠이 있는 발사만 목록에 넣는다.
//    라이브캠이 없는 발사는 이 사이트만의 콘텐츠가 없어 색인 가치가 낮다
//    (개별 페이지도 noindex 처리 — launch/[slug]/page.js 주석 참고).
//
// ⚠️ 비용: 발사 목록은 3시간 스냅샷(문서 1건), 마커는 청크 인덱스(문서 몇 건)로 읽는다.
//    ISR 1시간 캐시라 크롤러가 반복 방문해도 읽기가 늘지 않는다.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import SeoPageShell from "@/components/seo/SeoPageShell";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { getMapMarkers } from "@/lib/getMapMarkers";
import { formatDistanceKm } from "@/lib/earthquakeAlert";
import { getLaunches, getNearbyForLaunch, isPast } from "@/lib/launchData";

export const revalidate = 3600; // 1시간

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

function bi(ko, en) {
  return en ? `${ko} · ${en}` : ko;
}

function formatKo(ms) {
  try {
    return new Date(ms).toLocaleString("ko-KR", {
      timeZone: "UTC",
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
  try {
    return new Date(ms).toLocaleString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

export const metadata = {
  title:
    "로켓 발사 일정 · 발사장 라이브캠 | Rocket Launch Schedule & Live Cams | TripByClip",
  description:
    "다가오는 NASA·SpaceX 로켓 발사 일정과 발사장에서 가장 가까운 실시간 라이브캠을 함께 확인하세요. " +
    "Upcoming NASA and SpaceX rocket launches with live webcams nearest to each launch pad.",
  alternates: { canonical: `${SITE_URL}/launch` },
};

export default async function LaunchListPage() {
  let launches = [];
  let markers = [];
  try {
    [launches, markers] = await Promise.all([
      getLaunches(),
      getMapMarkers().catch(() => []),
    ]);
  } catch (error) {
    console.error("[launch/list] 데이터 조회 실패:", error); // TODO: 배포 전 제거
  }

  // ⚠️ 각 발사는 자기 발사장 좌표로 인근 라이브캠을 계산한다(반복문 밖 고정값 참조 금지).
  //    라이브캠이 하나도 없는 발사는 목록에서 제외한다(얇은 페이지 유입 방지).
  const rows = [];
  for (const launch of launches) {
    const nearby = getNearbyForLaunch(launch, markers);
    if (nearby.length === 0) continue;
    rows.push({ launch, nearest: nearby[0], camCount: nearby.length });
  }

  const upcoming = rows.filter((r) => !isPast(r.launch));
  const recent = rows.filter((r) => isPast(r.launch)).reverse(); // 최근 발사부터

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "로켓 발사 일정 · Rocket Launch Schedule",
    itemListElement: rows.slice(0, 30).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/launch/${r.launch.slug}`,
      name: r.launch.rocket || r.launch.name,
    })),
  };

  const Section = ({ title, titleEn, list, empty }) => (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold text-ink">
        {bi(title, titleEn)}
        {list.length > 0 && (
          <span className="ml-1.5 text-sm font-normal text-ink-muted">
            ({list.length})
          </span>
        )}
      </h2>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((r) => {
            // ⚠️ 각 행은 자기 자신(r)의 발사·라이브캠 데이터만 참조한다.
            const l = r.launch;
            return (
              <li key={l.slug}>
                <Link
                  href={`/launch/${l.slug}`}
                  className="block rounded-lg border border-border bg-surface p-3 shadow-card transition duration-150 hover:-translate-y-0.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-display text-sm font-semibold text-ink">
                      🚀 {l.rocket || l.name}
                    </h3>
                    <span className="font-mono text-xs text-ink-muted">
                      {formatKo(l.netMs)} UTC
                      <span className="ml-1.5">({formatEn(l.netMs)})</span>
                    </span>
                  </div>
                  {l.missionName && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {bi("임무", "Mission")}: {l.missionName}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-muted">
                    📍 {l.padLocation || l.padName}
                  </p>
                  <p className="mt-1 text-xs text-brand">
                    📹 {bi("가장 가까운 라이브캠", "Nearest live cam")}:{" "}
                    {r.nearest.location || "(장소명 없음)"} (
                    {formatDistanceKm(r.nearest.distanceKm)})
                    {r.camCount > 1 && (
                      <span className="text-ink-muted">
                        {" "}
                        {bi(`외 ${r.camCount - 1}곳`, `+${r.camCount - 1} more`)}
                      </span>
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <SeoPageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb
        items={[
          { label: "홈", href: "/" },
          { label: bi("로켓 발사", "Rocket Launches") },
        ]}
      />

      <h1 className="font-display text-2xl font-bold text-ink">
        {bi("로켓 발사 일정", "Rocket Launch Schedule")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        NASA·SpaceX 등 다가오는 로켓 발사 일정과, 각 발사장에서 가장 가까운 실시간
        라이브캠을 함께 보여줍니다. 발사장 주변의 지금 모습을 실시간으로 확인해
        보세요.
        <span className="mt-1 block">
          Upcoming rocket launches from NASA, SpaceX and others — each paired with
          the live webcams nearest to its launch pad.
        </span>
      </p>

      <Section
        title="다가오는 발사"
        titleEn="Upcoming Launches"
        list={upcoming}
        empty="현재 표시할 예정 발사가 없습니다. / No upcoming launches to show."
      />
      <Section
        title="최근 발사"
        titleEn="Recent Launches"
        list={recent}
        empty="최근 발사 기록이 없습니다. / No recent launches."
      />

      <p className="mt-8 text-xs text-ink-muted">
        {bi(
          "발사 일정 출처: The Space Devs (Launch Library). 기상·기술적 사유로 수시로 변경될 수 있습니다.",
          "Launch data: The Space Devs (Launch Library). Schedules change frequently."
        )}
      </p>
    </SeoPageShell>
  );
}
