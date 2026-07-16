// ─────────────────────────────────────────────────────────────
// 관리자 대시보드 데이터 API — /api/admin/dashboard (관리자 전용, GET)
//
// Firestore 의 실제 기록을 읽어 대시보드용으로 집계해 반환한다:
//   - analytics/{YYYY-MM-DD} : daily_visitors, daily_map_clicks, countries{}
//   - analytics/_summary     : total_visitors, total_map_clicks, countries{}(누적)
//   - api_usage/{YYYY-MM-DD}  : youtube/places/ai/category_search + total_estimated_cost_usd
//   - api_usage/{YYYY-MM}     : translate{characters_used, calls} (번역 사용량, 월별)
//
// ⚠️ 정직성: 이 API 는 "저장된 실제 데이터"만 반환한다. 없는 값은 0/빈 배열.
//    (서버비용·애드센스 등 외부 연동이 필요한 값은 여기서 만들어내지 않는다.)
//    현재 코드가 analytics/api_usage 일별 기록을 다시 쓰기 전까지는 과거 데이터만 보인다.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // 일별 문서 id
const MONTH_RE = /^\d{4}-\d{2}$/; // 월별 문서 id(번역 사용량)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    // ── analytics (방문자) ───────────────────────────────────
    const anSnap = await adminDb.collection("analytics").get();
    const visitorsDaily = [];
    let summary = null;
    for (const d of anSnap.docs) {
      if (d.id === "_summary") {
        summary = d.data() || {};
        continue;
      }
      if (!DATE_RE.test(d.id)) continue;
      const data = d.data() || {};
      visitorsDaily.push({
        date: d.id,
        visitors: num(data.daily_visitors),
        mapClicks: num(data.daily_map_clicks),
        countries: data.countries && typeof data.countries === "object" ? data.countries : {},
        cities: data.cities && typeof data.cities === "object" ? data.cities : {},
      });
    }
    visitorsDaily.sort((a, b) => a.date.localeCompare(b.date));

    // 국가별 누적: _summary.countries 우선, 없으면 일별 countries 합산
    let countryTotals = {};
    if (summary && summary.countries && typeof summary.countries === "object") {
      countryTotals = { ...summary.countries };
    } else {
      for (const day of visitorsDaily) {
        for (const [c, n] of Object.entries(day.countries || {})) {
          countryTotals[c] = (countryTotals[c] || 0) + num(n);
        }
      }
    }
    const byCountry = Object.entries(countryTotals)
      .map(([country, count]) => ({ country, count: num(count) }))
      .sort((a, b) => b.count - a.count);

    // 도시별 누적: _summary.cities 우선, 없으면 일별 cities 합산
    let cityTotals = {};
    if (summary && summary.cities && typeof summary.cities === "object") {
      cityTotals = { ...summary.cities };
    } else {
      for (const day of visitorsDaily) {
        for (const [c, n] of Object.entries(day.cities || {})) {
          cityTotals[c] = (cityTotals[c] || 0) + num(n);
        }
      }
    }
    const byCity = Object.entries(cityTotals)
      .map(([city, count]) => ({ city, count: num(count) }))
      .sort((a, b) => b.count - a.count);

    const totalVisitors =
      summary && summary.total_visitors != null
        ? num(summary.total_visitors)
        : visitorsDaily.reduce((s, d) => s + d.visitors, 0);
    const totalMapClicks =
      summary && summary.total_map_clicks != null
        ? num(summary.total_map_clicks)
        : visitorsDaily.reduce((s, d) => s + d.mapClicks, 0);

    // ── api_usage (API 사용량/비용) ──────────────────────────
    const auSnap = await adminDb.collection("api_usage").get();
    const apiDaily = [];
    let translateChars = 0;
    let translateCalls = 0;
    for (const d of auSnap.docs) {
      const data = d.data() || {};
      if (MONTH_RE.test(d.id)) {
        // 월별 번역 사용량
        const t = data.translate || {};
        translateChars += num(t.characters_used);
        translateCalls += num(t.calls);
        continue;
      }
      if (!DATE_RE.test(d.id)) continue;
      const yt = data.youtube || {};
      const ai = data.ai || {};
      const places = data.places || {};
      apiDaily.push({
        date: d.id,
        cost: num(data.total_estimated_cost_usd),
        youtubeUnits: num(yt.units_used),
        youtubeLimit: num(yt.units_limit) || 10000,
        aiTokens: num(ai.match_tokens_used) || num(ai.tokens_used),
        aiCost: num(ai.estimated_cost_usd),
        placesCalls: num(places.calls) || num(places.search_calls),
      });
    }
    apiDaily.sort((a, b) => a.date.localeCompare(b.date));

    const totalCost = apiDaily.reduce((s, d) => s + d.cost, 0);
    const totalYoutubeUnits = apiDaily.reduce((s, d) => s + d.youtubeUnits, 0);

    const latestVisitorDate = visitorsDaily.length
      ? visitorsDaily[visitorsDaily.length - 1].date
      : null;
    const latestApiDate = apiDaily.length ? apiDaily[apiDaily.length - 1].date : null;

    return Response.json(
      {
        ok: true,
        visitors: {
          daily: visitorsDaily.map(({ date, visitors, mapClicks }) => ({
            date,
            visitors,
            mapClicks,
          })),
          totalVisitors,
          totalMapClicks,
          byCountry,
          byCity,
          latestDate: latestVisitorDate,
        },
        api: {
          daily: apiDaily,
          totalCost,
          totalYoutubeUnits,
          translate: { characters: translateChars, calls: translateCalls },
          latestDate: latestApiDate,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/admin/dashboard] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "대시보드 데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
