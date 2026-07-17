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
import { getGcpUsage, USAGE_LIMITS } from "@/lib/gcpMonitoring";

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
    // 무료 한도는 "기간별"로 리셋된다:
    //   - YouTube Data: 10,000 유닛 / "하루"       → 오늘(todayStr) 사용량으로 비교
    //   - Google 번역:  500,000 글자 / "한 달"      → 이번 달(monthStr) 사용량으로 비교
    // 따라서 전체 누적이 아니라 해당 기간 doc 의 값을 따로 뽑아야 한다.
    const todayStr = new Date().toISOString().slice(0, 10); // 서버 UTC 기준(usageRecorder 와 동일)
    const monthStr = todayStr.slice(0, 7); // YYYY-MM

    const auSnap = await adminDb.collection("api_usage").get();
    const apiDaily = [];
    let translateChars = 0; // 전체 누적(참고용)
    let translateCalls = 0;
    let monthTranslateChars = 0; // 이번 달(무료 한도 500,000/월 비교용)
    let monthTranslateCalls = 0;
    let todayYoutubeUnits = 0; // 오늘(무료 한도 10,000/일 비교용)
    let todayYoutubeLimit = 10000;
    for (const d of auSnap.docs) {
      const data = d.data() || {};
      if (MONTH_RE.test(d.id)) {
        // 월별 번역 사용량
        const t = data.translate || {};
        translateChars += num(t.characters_used);
        translateCalls += num(t.calls);
        if (d.id === monthStr) {
          monthTranslateChars = num(t.characters_used);
          monthTranslateCalls = num(t.calls);
        }
        continue;
      }
      if (!DATE_RE.test(d.id)) continue;
      const yt = data.youtube || {};
      const ai = data.ai || {};
      const places = data.places || {};
      const dayYoutubeUnits = num(yt.units_used);
      if (d.id === todayStr) {
        todayYoutubeUnits = dayYoutubeUnits;
        todayYoutubeLimit = num(yt.units_limit) || 10000;
      }
      apiDaily.push({
        date: d.id,
        cost: num(data.total_estimated_cost_usd),
        youtubeUnits: dayYoutubeUnits,
        youtubeLimit: num(yt.units_limit) || 10000,
        aiTokens: num(ai.match_tokens_used) || num(ai.tokens_used),
        aiCost: num(ai.estimated_cost_usd),
        placesCalls: num(places.calls) || num(places.search_calls),
      });
    }
    apiDaily.sort((a, b) => a.date.localeCompare(b.date));

    const totalCost = apiDaily.reduce((s, d) => s + d.cost, 0);
    const totalYoutubeUnits = apiDaily.reduce((s, d) => s + d.youtubeUnits, 0);
    // 이번 달 API 비용(손익 계산용) — apiDaily 중 이번 달 doc 합산
    const monthApiCost = apiDaily
      .filter((d) => d.date.slice(0, 7) === monthStr)
      .reduce((s, d) => s + d.cost, 0);

    // ── finance (수동 입력: 서버비용/애드센스) ────────────────
    const finSnap = await adminDb.collection("finance").get();
    const financeMonths = [];
    for (const d of finSnap.docs) {
      if (!MONTH_RE.test(d.id)) continue;
      const data = d.data() || {};
      financeMonths.push({
        month: d.id,
        vercel: num(data.vercel_usd),
        firebase: num(data.firebase_usd),
        adsense: num(data.adsense_usd),
      });
    }
    financeMonths.sort((a, b) => a.month.localeCompare(b.month));
    const financeTotals = financeMonths.reduce(
      (s, m) => ({
        vercel: s.vercel + m.vercel,
        firebase: s.firebase + m.firebase,
        adsense: s.adsense + m.adsense,
      }),
      { vercel: 0, firebase: 0, adsense: 0 }
    );
    const thisMonthFinance =
      financeMonths.find((m) => m.month === monthStr) || {
        month: monthStr,
        vercel: 0,
        firebase: 0,
        adsense: 0,
      };

    const latestVisitorDate = visitorsDaily.length
      ? visitorsDaily[visitorsDaily.length - 1].date
      : null;
    const latestApiDate = apiDaily.length ? apiDaily[apiDaily.length - 1].date : null;

    // ── GCP Monitoring 실측 사용량(YouTube 유닛·Firestore 읽기/쓰기/삭제) ──
    // Google 이 집계한 정확한 값. 권한 없으면 usage.ok=false 로 안내.
    let usage = { ok: false, error: "조회 안 함", daily: [] };
    try {
      usage = await getGcpUsage(14);
    } catch (usageError) {
      console.error("[api/admin/dashboard] 사용량 조회 예외:", usageError); // TODO: 배포 전 제거
      usage = { ok: false, error: "사용량 조회 중 오류", daily: [] };
    }

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
          totalYoutubeUnits, // 전체 누적(KPI 카드용)
          today: {
            date: todayStr,
            youtubeUnits: todayYoutubeUnits, // 오늘 사용 유닛(무료 한도 비교용)
            youtubeLimit: todayYoutubeLimit || 10000,
          },
          translate: {
            characters: translateChars, // 전체 누적(참고용)
            calls: translateCalls,
            month: monthStr,
            monthCharacters: monthTranslateChars, // 이번 달(무료 한도 비교용)
            monthCalls: monthTranslateCalls,
          },
          monthCost: monthApiCost, // 이번 달 API 비용(손익용)
          latestDate: latestApiDate,
        },
        finance: {
          month: monthStr,
          months: financeMonths,
          totals: financeTotals,
          thisMonth: thisMonthFinance,
        },
        // GCP 실측 사용량 + 무료 한도 상수(대시보드에서 한도 대비 표시/비용계산)
        usage: {
          ok: usage.ok,
          error: usage.error || null,
          daily: usage.daily || [],
          limits: USAGE_LIMITS,
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
