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
// ─────────────────────────────────────────────────────────────

import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  citySlug,
} from "@/lib/seoData";
import { getLiveChannels } from "@/lib/getLiveChannels";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

// 마커/채널에서 파생되는 동적 경로를 "직렬화 가능한" 형태로 계산(전체 스캔).
//   스냅샷이 만료됐을 때만 호출된다. throw 하지 않고, 실패한 소스는 건너뛴다.
//   각 항목: { path, lastModifiedMs(null 가능), changeFrequency, priority }
async function computeDynamicRoutes() {
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

  // 동적 경로: 1시간 시간제 스냅샷에서 읽어와 Date 로 복원 (실패해도 정적 경로는 항상 반환)
  let dynamicRoutes = [];
  try {
    const stored = await getTimedSnapshot({
      docId: "sitemap_routes",
      refreshMs: 60 * 60 * 1000, // 1시간
      compute: computeDynamicRoutes,
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    dynamicRoutes = (Array.isArray(stored) ? stored : []).map((r) => ({
      url: `${SITE_URL}${r.path}`,
      lastModified:
        typeof r.lastModifiedMs === "number" ? new Date(r.lastModifiedMs) : now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    }));
  } catch (error) {
    console.error("[sitemap] 동적 경로 생성 실패:", error); // TODO: 배포 전 제거
  }

  return [...staticRoutes, ...dynamicRoutes];
}
