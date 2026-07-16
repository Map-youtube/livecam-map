// ─────────────────────────────────────────────────────────────
// regionDescriptionRun — "설명이 없는 지역"을 찾아 Gemini 로 채워 저장하는 오케스트레이터
//
// runRegionDescriptionFill({ cap }):
//   1) 공개 마커에서 스코프 지역 목록을 만든다:
//        · 대륙 7개
//        · 마커가 있는 국가 전부
//        · 마커가 2개 이상인 '주요 도시'  (소도시 환각 위험 회피 — 사용자 선택 범위)
//   2) 이미 region_descriptions 에 있는 key 는 제외
//   3) 남은 것 중 cap 개만 Gemini 로 생성해 저장 → revalidateTag
//   4) 보고서 반환(생성 수 / 남은 수 / 유형별)
//
// - 관리자 버튼(/api/region-descriptions/generate)과 매일 크론(scan) 양쪽에서 호출.
// - 한 번에 cap 까지만 처리 → 무료 RPD/실행시간 방어. 남은 건 다음 실행에서 이어서.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getContinentLabel } from "@/lib/i18n/continents";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";
import {
  VALID_CONTINENTS,
  getNormalizedPublicMarkers,
  citySlug,
} from "@/lib/seoData";
import {
  REGION_DESC_COLLECTION,
  continentDescKey,
  countryDescKey,
  cityDescKey,
} from "@/lib/regionDescriptions";
import { generateRegionDescriptions } from "@/lib/regionDescriptionAi";

// 주요 도시 기준: 이 개수 이상 마커가 있는 도시만 AI 설명을 생성한다.
const MAJOR_CITY_MIN_MARKERS = 2;

// 공개 마커 → 스코프 지역 서술자 목록 [{ key, type, name, context }]
async function buildScopedRegions() {
  const regions = [];
  const seen = new Set();

  // 1) 대륙 (고정 7개)
  for (const c of VALID_CONTINENTS) {
    const key = continentDescKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push({
      key,
      type: "continent",
      name: getContinentLabel(c, "ko"),
      context: "",
    });
  }

  const markers = await getNormalizedPublicMarkers();

  // 2) 국가 (마커가 있는 국가 전부)
  const countrySeen = new Set();
  // 3) 도시 (continent|country|slug → 마커 수, 표시 도시명)
  const cityAgg = new Map(); // cityKey → { count, name, continent, country, slug }

  for (const m of markers) {
    if (!m || !m.continent || !m.country) continue;
    const continent = m.continent;
    const country = String(m.country).toUpperCase();

    // 국가
    const ck = `${continent}__${country}`;
    if (!countrySeen.has(ck)) {
      countrySeen.add(ck);
      const key = countryDescKey(country);
      if (!seen.has(key)) {
        seen.add(key);
        regions.push({
          key,
          type: "country",
          name: COUNTRY_NAME_BY_CODE[country] || country,
          context: `대륙: ${getContinentLabel(continent, "ko")}`,
        });
      }
    }

    // 도시 (city 값이 있고 슬러그화 가능한 것만)
    if (m.city) {
      const slug = citySlug(m.city);
      if (slug) {
        const cityK = cityDescKey(continent, country, slug);
        const agg = cityAgg.get(cityK) || {
          count: 0,
          name: m.city,
          continent,
          country,
        };
        agg.count += 1;
        cityAgg.set(cityK, agg);
      }
    }
  }

  // 주요 도시(마커 2개 이상)만 추가
  for (const [key, agg] of cityAgg.entries()) {
    if (agg.count < MAJOR_CITY_MIN_MARKERS) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push({
      key,
      type: "city",
      name: agg.name,
      context: `국가: ${
        COUNTRY_NAME_BY_CODE[agg.country] || agg.country
      }, 대륙: ${getContinentLabel(agg.continent, "ko")}`,
    });
  }

  return regions;
}

export async function runRegionDescriptionFill({ cap = 40 } = {}) {
  const report = {
    ok: true,
    scoped: 0,
    existing: 0,
    generated: 0,
    remaining: 0,
    byType: { continent: 0, country: 0, city: 0 },
  };
  try {
    const scoped = await buildScopedRegions();
    report.scoped = scoped.length;

    // 이미 설명이 있는 key 조회
    const existingSnap = await adminDb.collection(REGION_DESC_COLLECTION).get();
    const existingKeys = new Set(existingSnap.docs.map((d) => d.id));
    report.existing = existingKeys.size;

    const missing = scoped.filter((r) => !existingKeys.has(r.key));
    report.remaining = missing.length;

    // 생성할 게 있으면 cap 까지 생성·저장
    if (missing.length > 0) {
      const batch = missing.slice(0, Math.max(0, cap));
      const resultMap = await generateRegionDescriptions(batch);

      // 저장 (Firestore 배치)
      const descriptorByKey = new Map(batch.map((r) => [r.key, r]));
      const keys = [...resultMap.keys()];
      for (let i = 0; i < keys.length; i += 400) {
        const wb = adminDb.batch();
        for (const key of keys.slice(i, i + 400)) {
          const desc = resultMap.get(key);
          const meta = descriptorByKey.get(key) || {};
          wb.set(
            adminDb.collection(REGION_DESC_COLLECTION).doc(key),
            {
              key,
              type: meta.type || "",
              name: meta.name || "",
              ko: desc.ko || "",
              en: desc.en || "",
              model: desc.model || "",
              generated_at: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          report.generated += 1;
          if (meta.type && report.byType[meta.type] !== undefined) {
            report.byType[meta.type] += 1;
          }
        }
        await wb.commit();
      }

      report.remaining = missing.length - report.generated;
    }

    // 항상 재검증한다(생성이 0이어도) → 외부에서 직접 써넣은 설명도 즉시 공개 페이지에 반영.
    try {
      revalidateTag("region-descriptions");
    } catch (revalErr) {
      console.error("[regionDescriptionRun] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }
  } catch (error) {
    console.error("[regionDescriptionRun] 예외:", error); // TODO: 배포 전 제거
    report.ok = false;
    report.error = error && error.message;
  }
  return report;
}
