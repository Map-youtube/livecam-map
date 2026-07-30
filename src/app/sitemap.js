// ─────────────────────────────────────────────────────────────
// sitemap.js — 검색엔진 색인용 사이트맵 (Next.js 메타데이터 파일 컨벤션)
//
// - 정적 경로: 홈 + 법적 페이지 + 대륙 목록 페이지(7개)
// - 동적 경로: 공개 마커/채널에서 파생되는 국가/도시/마커상세/채널상세 경로
// - /sitemap.xml 경로로 자동 노출됨(Next.js 컨벤션).
//
// ⚠️ Firestore 읽기 폭증 방지(2026-07-20 사고 후속 — 재발): 동적 경로는 공개 마커 "전체"
//    (markers + auto_markers 수백~수천 개)와 라이브 채널 전체를 읽는다. 사이트맵은 크롤러가
//    수시로 다시 가져가는데, unstable_cache 는 Vercel 서버리스 인스턴스별로 분리돼 매 요청마다
//    전체 컬렉션을 재스캔할 수 있다(읽기 초과 원인). → 방송/ISS·getSeoNav 와 동일하게 Firestore
//    시간제 스냅샷(getTimedSnapshot)으로 전환한다. 경로 목록은 1시간에 1번만 계산하고, 그 외
//    사이트맵 요청은 스냅샷 문서 1개만 읽는다(트래픽·크롤 빈도와 무관하게 읽기 고정).
//    (Firestore 저장을 위해 lastModified 는 Date 대신 밀리초로 직렬화해 담고, 응답 시 Date 로 복원)
//
// ⚠️ 스냅샷은 2개다(2026-07-30 분리 — 자세한 이유는 아래 computeStableRoutes 위 주석 참고):
//      sitemap_routes_stable     : 마커·채널 (Firestore 읽음 → 6시간)
//      sitemap_routes_earthquake : 지진     (USGS 만 호출, Firestore 0 → 15분)
// ─────────────────────────────────────────────────────────────

import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  citySlug,
} from "@/lib/seoData";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getTimedSnapshot } from "@/lib/liveSnapshot";
import { getMapMarkers } from "@/lib/getMapMarkers";
import { getLaunches, getNearbyForLaunch } from "@/lib/launchData";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// ─────────────────────────────────────────────────────────────
// ⚠️ 스냅샷을 2개로 분리한다(2026-07-30, 속보 SEO 대응).
//
//   왜: 예전엔 마커·채널·지진 경로를 한 덩어리로 묶어 6시간마다 갱신했다. 그런데 큰 지진이
//       나면 검색량 피크가 발생 후 1~6시간에 몰리는데, 새 지진 페이지가 사이트맵에 오르기까지
//       최대 6시간이 걸려 그 피크를 통째로 놓쳤다.
//
//   어떻게: "느린 것"과 "빠른 것"을 분리한다.
//     - stable(마커·채널): Firestore 를 읽으므로 기존대로 6시간 유지 → 읽기 비용 변화 없음.
//     - fresh(지진)      : USGS만 호출하고 Firestore 를 전혀 읽지 않는다 → 주기를 15분으로
//                          줄여도 Firestore 읽기 증가가 정확히 0건이다(공짜로 속도만 얻음).
//
//   ⚠️ 지진 경로 계산에 Firestore 호출을 추가하지 말 것. 추가하는 순간 이 "공짜" 전제가 깨지고
//      15분마다 스캔이 도는 비용 사고가 된다.
// ─────────────────────────────────────────────────────────────

// 마커/채널에서 파생되는 동적 경로를 "직렬화 가능한" 형태로 계산(전체 스캔).
//   스냅샷이 만료됐을 때만 호출된다. throw 하지 않고, 실패한 소스는 건너뛴다.
//   각 항목: { path, lastModifiedMs(null 가능), changeFrequency, priority }
async function computeStableRoutes() {
  const routes = [];

  // 국가/도시/마커상세 경로
  try {
    const markers = await getNormalizedPublicMarkers();
    const countrySeen = new Set();
    const citySeen = new Set();

    for (const m of Array.isArray(markers) ? markers : []) {
      if (!m || !m.continent || !m.country) continue;
      const countryLower = String(m.country).toLowerCase();

      const countryKey = `${m.continent}/${countryLower}`;
      if (!countrySeen.has(countryKey)) {
        countrySeen.add(countryKey);
        routes.push({
          path: `/${countryKey}`,
          lastModifiedMs: null,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }

      if (m.city) {
        const slug = citySlug(m.city);
        const cityKey = slug ? `${countryKey}/${slug}` : null;
        if (cityKey && !citySeen.has(cityKey)) {
          citySeen.add(cityKey);
          routes.push({
            path: `/${cityKey}`,
            lastModifiedMs: null,
            changeFrequency: "weekly",
            priority: 0.5,
          });
        }
      }

      if (m.id) {
        routes.push({
          path: `/marker/${m.id}`,
          lastModifiedMs: typeof m.updated_at === "number" ? m.updated_at : null,
          changeFrequency: "daily",
          priority: 0.5,
        });
      }
    }
  } catch (error) {
    console.error("[sitemap] 마커 경로 계산 실패:", error); // TODO: 배포 전 제거
  }

  // 라이브 채널 상세 경로 (/channel/[id])
  try {
    const channels = await getLiveChannels();
    for (const ch of Array.isArray(channels) ? channels : []) {
      if (!ch || !ch.id) continue;
      routes.push({
        path: `/channel/${ch.id}`,
        lastModifiedMs: typeof ch.updated_at === "number" ? ch.updated_at : null,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
  } catch (error) {
    console.error("[sitemap] 채널 경로 계산 실패:", error); // TODO: 배포 전 제거
  }

  // 로켓 발사 경로 (/launch, /launch/[slug]) — 2026-07-30 신설
  //   ⚠️ 발사는 일정이 미리 공개되므로, 이벤트 전에 사이트맵에 올려 미리 색인시키는 것이
  //      이 기능의 핵심이다(지진과 달리 사전 준비가 가능한 이벤트).
  //   ⚠️ 발사장 인근에 라이브캠이 없는 발사는 이 사이트만의 콘텐츠가 없어 얇은 페이지가 된다
  //      → 개별 페이지는 noindex 이고, 여기 사이트맵에도 넣지 않는다(둘의 판정 기준을
  //        같은 getMapMarkers 로 맞춰야 "사이트맵엔 있는데 noindex" 인 모순이 안 생긴다).
  try {
    const [launches, markers] = await Promise.all([
      getLaunches(),
      getMapMarkers().catch(() => []),
    ]);
    let indexable = 0;
    for (const launch of Array.isArray(launches) ? launches : []) {
      // ⚠️ 각 발사는 자기 발사장 좌표로 판정한다(반복문 밖 고정값 참조 금지).
      if (getNearbyForLaunch(launch, markers).length === 0) continue;
      indexable += 1;
      routes.push({
        path: `/launch/${launch.slug}`,
        lastModifiedMs: null,
        changeFrequency: "daily",
        priority: 0.7, // 이벤트성 트래픽이 크므로 마커 상세(0.5)보다 높게
      });
    }
    // 허브 페이지는 색인 가능한 발사가 하나라도 있을 때만 넣는다(빈 목록 색인 방지).
    if (indexable > 0) {
      routes.push({
        path: "/launch",
        lastModifiedMs: null,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (error) {
    console.error("[sitemap] 발사 경로 계산 실패:", error); // TODO: 배포 전 제거
  }

  return routes;
}

// ─── 속보성 경로: 지진 (USGS 만 호출 — Firestore 읽기 0) ──────
//   USGS "significant"(주요 지진) 월간 피드만 사용한다 — 규모 4.5+ 전체(하루 20~30건)를
//   넣으면 얇은 페이지가 대량 생성돼 SEO 에 오히려 해롭기 때문에, 뉴스가 될 만한 건만.
//   ⚠️ 이 함수 안에서는 Firestore 를 절대 호출하지 않는다(위 분리 주석 참고).
async function computeEarthquakeRoutes() {
  const routes = [];
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
      // 피드 자체도 짧게 캐시해야 스냅샷 주기를 줄인 효과가 살아난다(USGS 는 무료).
      { next: { revalidate: 600 } }
    );
    if (res.ok) {
      const data = await res.json();
      const features = Array.isArray(data.features) ? data.features : [];
      for (const f of features) {
        if (!f || !f.id) continue;
        const p = f.properties || {};
        routes.push({
          path: `/earthquake/${f.id}`,
          lastModifiedMs: typeof p.time === "number" ? p.time : null,
          changeFrequency: "daily",
          priority: 0.6,
        });
      }
    }
  } catch (error) {
    console.error("[sitemap] 지진 경로 계산 실패:", error); // TODO: 배포 전 제거
  }
  return routes;
}

export default async function sitemap() {
  const now = new Date();

  // 정적 경로(홈, 법적 페이지, 대륙 목록)
  const staticRoutes = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/affiliate-disclosure", changeFrequency: "yearly", priority: 0.3 },
    ...VALID_CONTINENTS.map((c) => ({
      path: `/${c}`,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ].map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // 스냅샷에 저장된 { path, lastModifiedMs, ... } 를 사이트맵 항목으로 복원
  const toEntry = (r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified:
      typeof r.lastModifiedMs === "number" ? new Date(r.lastModifiedMs) : now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  });

  // ① 안정 경로(마커·채널): Firestore 를 읽으므로 6시간 유지 — 읽기 비용 기존과 동일.
  let stableRoutes = [];
  try {
    const stored = await getTimedSnapshot({
      // ⚠️ 문서 id 를 예전(sitemap_routes)에서 바꾼 이유: 옛 스냅샷에는 지진 경로가 함께
      //    들어 있어서, 그대로 재사용하면 아래 ②의 지진 경로와 겹쳐 최대 6시간 동안
      //    사이트맵에 같은 URL 이 두 번 실린다. id 를 바꿔 새로 계산하게 한다.
      //    (옛 live_snapshots/sitemap_routes 문서는 더 이상 읽히지 않는다.)
      docId: "sitemap_routes_stable",
      refreshMs: 6 * 60 * 60 * 1000, // 6시간 (마커·채널은 자주 안 바뀜 — 전체 스캔 빈도↓)
      compute: computeStableRoutes,
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    stableRoutes = (Array.isArray(stored) ? stored : []).map(toEntry);
  } catch (error) {
    console.error("[sitemap] 안정 경로 생성 실패:", error); // TODO: 배포 전 제거
  }

  // ② 속보 경로(지진): USGS 만 호출 → Firestore 읽기 0건이므로 15분 주기로 둘 수 있다.
  //    큰 지진이 나면 최대 6시간 걸리던 사이트맵 반영이 15분 이내로 줄어든다.
  let quakeRoutes = [];
  try {
    const stored = await getTimedSnapshot({
      docId: "sitemap_routes_earthquake",
      refreshMs: 15 * 60 * 1000, // 15분
      compute: computeEarthquakeRoutes,
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    quakeRoutes = (Array.isArray(stored) ? stored : []).map(toEntry);
  } catch (error) {
    console.error("[sitemap] 지진 경로 생성 실패:", error); // TODO: 배포 전 제거
  }

  return [...staticRoutes, ...stableRoutes, ...quakeRoutes];
}
