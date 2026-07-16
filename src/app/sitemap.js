// ─────────────────────────────────────────────────────────────
// sitemap.js — 검색엔진 색인용 사이트맵 (Next.js 메타데이터 파일 컨벤션)
//
// - 정적 경로: 홈 + 법적 페이지 + 대륙 목록 페이지(7개)
// - 동적 경로: 공개 마커 데이터에서 파생되는 국가/도시/마커상세 경로
//   → getNormalizedPublicMarkers 는 getPublicMarkers(5분 캐시 + tag:"public-markers")를
//     그대로 사용하므로, 이 사이트맵도 마커 등록/수정 시 자동으로 최신 목록을 반영한다.
// - /sitemap.xml 경로로 자동 노출됨(Next.js 컨벤션).
// ─────────────────────────────────────────────────────────────

import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  citySlug,
} from "@/lib/seoData";
import { getLiveChannels } from "@/lib/getLiveChannels";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com";

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

  // 동적 경로(국가/도시/마커상세) — 실패해도 정적 경로는 항상 반환되도록 try-catch
  const dynamicRoutes = [];
  try {
    const markers = await getNormalizedPublicMarkers();
    const countrySeen = new Set();
    const citySeen = new Set();

    for (const m of markers) {
      if (!m || !m.continent || !m.country) continue;
      const countryLower = String(m.country).toLowerCase();

      const countryKey = `${m.continent}/${countryLower}`;
      if (!countrySeen.has(countryKey)) {
        countrySeen.add(countryKey);
        dynamicRoutes.push({
          url: `${SITE_URL}/${countryKey}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }

      if (m.city) {
        const slug = citySlug(m.city);
        const cityKey = slug ? `${countryKey}/${slug}` : null;
        if (cityKey && !citySeen.has(cityKey)) {
          citySeen.add(cityKey);
          dynamicRoutes.push({
            url: `${SITE_URL}/${cityKey}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.5,
          });
        }
      }

      if (m.id) {
        const updatedAt =
          typeof m.updated_at === "number" ? new Date(m.updated_at) : now;
        dynamicRoutes.push({
          url: `${SITE_URL}/marker/${m.id}`,
          lastModified: updatedAt,
          changeFrequency: "daily",
          priority: 0.5,
        });
      }
    }
  } catch (error) {
    console.error("[sitemap] 동적 경로 생성 실패:", error); // TODO: 배포 전 제거
  }

  // 라이브 채널 상세 페이지 (/channel/[id]) — 채널 등록/삭제 시 자동 반영(tag:"live-channels")
  const channelRoutes = [];
  try {
    const channels = await getLiveChannels();
    for (const ch of Array.isArray(channels) ? channels : []) {
      if (!ch || !ch.id) continue;
      const updatedAt =
        typeof ch.updated_at === "number" ? new Date(ch.updated_at) : now;
      channelRoutes.push({
        url: `${SITE_URL}/channel/${ch.id}`,
        lastModified: updatedAt,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
  } catch (error) {
    console.error("[sitemap] 채널 경로 생성 실패:", error); // TODO: 배포 전 제거
  }

  return [...staticRoutes, ...dynamicRoutes, ...channelRoutes];
}
