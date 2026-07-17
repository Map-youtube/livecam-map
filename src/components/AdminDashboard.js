"use client";

// ─────────────────────────────────────────────────────────────
// AdminDashboard — 관리자 대시보드 (실데이터 기반, 클라이언트)
//
// GET /api/admin/dashboard 에서 저장된 실제 데이터(analytics·api_usage)를 받아
//   방문자/국가별/ API 사용량·비용을 일·주·월 단위로 보여준다.
//
// ⚠️ 정직성 원칙:
//   - 저장된 실데이터만 표시한다(없는 값은 0/빈 상태로 명확히).
//   - 서버비용(Vercel/Firebase)·애드센스 수입은 자동 수집이 안 되므로 "연동 필요"로 명시.
//   - 현재 코드가 일별 기록을 다시 쓰기 전까지는 과거 데이터까지만 보인다는 점을 배너로 안내.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminIdToken } from "@/lib/clientAuth";

// 국가코드 → 한글/이모지 (자주 나오는 것만; 없으면 코드 그대로)
const COUNTRY_KO = {
  US: "미국", TH: "태국", KR: "한국", CA: "캐나다", DE: "독일", NL: "네덜란드",
  MY: "말레이시아", IN: "인도", ID: "인도네시아", GB: "영국", PL: "폴란드",
  LU: "룩셈부르크", LI: "리히텐슈타인", JP: "일본", ZZ: "미상",
};

function fmtInt(n) {
  return Number(n || 0).toLocaleString("en-US");
}
function fmtUsd(n) {
  return "$" + Number(n || 0).toFixed(2);
}

// 일별 배열 → 주/월 버킷 합산
function bucketize(daily, period) {
  const list = Array.isArray(daily) ? daily : [];
  if (period === "day") return list;
  const map = new Map();
  for (const d of list) {
    let key = d.date;
    if (period === "month") key = d.date.slice(0, 7); // YYYY-MM
    else if (period === "week") {
      // ISO 주 대신 간단히 "그 주 월요일" 기준
      const dt = new Date(d.date + "T00:00:00Z");
      const day = (dt.getUTCDay() + 6) % 7; // 월=0
      dt.setUTCDate(dt.getUTCDate() - day);
      key = dt.toISOString().slice(0, 10);
    }
    const cur = map.get(key) || { date: key, visitors: 0, mapClicks: 0, cost: 0, youtubeUnits: 0 };
    cur.visitors += Number(d.visitors || 0);
    cur.mapClicks += Number(d.mapClicks || 0);
    cur.cost += Number(d.cost || 0);
    cur.youtubeUnits += Number(d.youtubeUnits || 0);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// 세로 막대 미니 차트 (값 배열 → 막대). 라이브러리 없이 CSS 로.
function BarChart({ items, valueKey, color = "bg-brand", label }) {
  const rows = Array.isArray(items) ? items.slice(-16) : []; // 최근 16개 버킷
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-ink-muted">데이터 없음</p>;
  }
  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {rows.map((r) => {
          const v = Number(r[valueKey] || 0);
          const h = Math.round((v / max) * 100);
          return (
            <div key={r.date} className="group flex flex-1 flex-col items-center justify-end">
              <div
                className={`w-full rounded-t ${color}`}
                style={{ height: `${Math.max(2, h)}%` }}
                title={`${r.date} · ${label}: ${fmtInt(v)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
        <span>{rows[0].date}</span>
        <span>{rows[rows.length - 1].date}</span>
      </div>
    </div>
  );
}

// KPI 카드
function Kpi({ title, value, sub, tone = "ink", pending }) {
  const valueColor =
    tone === "brand" ? "text-brand" : tone === "live" ? "text-live" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-muted">{title}</p>
      {pending ? (
        <p className="mt-1 font-display text-base font-semibold text-ink-muted">
          연동 필요
        </p>
      ) : (
        <p className={`mt-1 font-display text-2xl font-bold tracking-tight ${valueColor}`}>
          {value}
        </p>
      )}
      {sub && <p className="mt-1 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, desc }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-base font-bold text-ink">{children}</h3>
      {desc && <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("day"); // day | week | month

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.location.href = "/admin/login";
        return;
      }
      const res = await fetch("/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.ok) setData(json);
      else setError(json.error || "데이터를 불러오지 못했습니다.");
    } catch (e) {
      setError("데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visitorBuckets = useMemo(
    () => bucketize(data?.visitors?.daily || [], period),
    [data, period]
  );
  const apiBuckets = useMemo(
    () => bucketize(data?.api?.daily || [], period),
    [data, period]
  );

  if (loading) {
    return <p className="p-6 text-sm text-ink-muted">대시보드를 불러오는 중...</p>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-live">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-brand-light"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const v = data.visitors || {};
  const a = data.api || {};
  const maxCountry = Math.max(1, ...(v.byCountry || []).map((c) => c.count));
  const maxCity = Math.max(1, ...(v.byCity || []).map((c) => c.count));
  const latestDate = v.latestDate || a.latestDate || null;

  return (
    <div className="space-y-6">
      {/* 데이터 신선도 안내 (정직성) */}
      <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
        <strong>데이터 안내:</strong> 아래 수치는 실제 저장된 기록입니다(최신 기준일{" "}
        <strong>{latestDate || "없음"}</strong>). 현재 사이트 코드는 방문자·API
        사용량의 <strong>일별 기록을 쓰지 않고 있어</strong>, 이 시점 이후로는 집계가
        멈춰 있습니다. 계속 집계하려면 추적을 다시 켜야 합니다(다음 단계).
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi title="누적 방문자" value={fmtInt(v.totalVisitors)} tone="brand" sub="analytics 누적" />
        <Kpi title="누적 지도 클릭" value={fmtInt(v.totalMapClicks)} sub="마커/지도 상호작용" />
        <Kpi
          title="누적 API 비용(추정)"
          value={fmtUsd(a.totalCost)}
          sub={`YouTube ${fmtInt(a.totalYoutubeUnits)} 유닛`}
        />
        <Kpi title="서버 비용(Vercel/Firebase)" pending sub="자동 수집 불가 · 수동입력/연동 필요" />
        <Kpi title="애드센스 수입" pending sub="승인 후 API 연동 필요" />
      </div>

      {/* 기간 선택 */}
      <div className="inline-flex rounded-lg border border-border bg-bg p-1">
        {[
          { k: "day", label: "일별" },
          { k: "week", label: "주별" },
          { k: "month", label: "월별" },
        ].map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => setPeriod(p.k)}
            className={
              "rounded-md px-3 py-1 text-sm font-medium transition " +
              (period === p.k ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 방문자 + 국가별 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionTitle desc="최근 구간의 방문자 수(막대에 마우스를 올리면 값 표시)">
            방문자 추이
          </SectionTitle>
          <BarChart items={visitorBuckets} valueKey="visitors" label="방문자" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionTitle desc="누적 방문자의 국가별 분포">국가별 방문자</SectionTitle>
          <ul className="space-y-1.5">
            {(v.byCountry || []).slice(0, 10).map((c) => (
              <li key={c.country} className="flex items-center gap-2 text-xs">
                <span className="w-24 flex-none truncate text-ink">
                  {COUNTRY_KO[c.country] || c.country}
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded bg-bg">
                  <span
                    className="block h-full rounded bg-brand"
                    style={{ width: `${Math.round((c.count / maxCountry) * 100)}%` }}
                  />
                </span>
                <span className="w-10 flex-none text-right font-mono tabular-nums text-ink-muted">
                  {fmtInt(c.count)}
                </span>
              </li>
            ))}
            {(v.byCountry || []).length === 0 && (
              <li className="py-4 text-center text-xs text-ink-muted">국가 데이터 없음</li>
            )}
          </ul>
        </div>
      </div>

      {/* 도시별 방문자 (추적 재활성화 후 쌓임) */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <SectionTitle desc="누적 방문자의 도시별 분포(방문 추적이 켜진 이후부터 집계)">
          도시별 방문자
        </SectionTitle>
        {(v.byCity || []).length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-muted">
            아직 도시 데이터가 없습니다. (방문 추적이 켜진 뒤 실제 방문부터 쌓입니다)
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(v.byCity || []).slice(0, 20).map((c) => (
              <li key={c.city} className="flex items-center gap-2 text-xs">
                <span className="w-28 flex-none truncate text-ink">{c.city}</span>
                <span className="h-3 flex-1 overflow-hidden rounded bg-bg">
                  <span
                    className="block h-full rounded bg-brand/70"
                    style={{ width: `${Math.round((c.count / maxCity) * 100)}%` }}
                  />
                </span>
                <span className="w-8 flex-none text-right font-mono tabular-nums text-ink-muted">
                  {fmtInt(c.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* API 비용/사용량 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionTitle desc="일/주/월 추정 API 비용(YouTube·AI·Places 등 합산)">
            API 비용 추이(추정)
          </SectionTitle>
          <BarChart items={apiBuckets} valueKey="cost" color="bg-live" label="비용($)" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <SectionTitle desc="무료 한도는 기간별로 리셋 — 유튜브는 '오늘', 번역은 '이번 달' 기준">
            API 무료 한도 현황
          </SectionTitle>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center justify-between">
              <span className="text-ink">
                YouTube Data <span className="text-ink-muted/70">(오늘 {a.today?.date || ""})</span>
              </span>
              <span className="font-mono tabular-nums text-ink-muted">
                {fmtInt(a.today?.youtubeUnits)}{" "}
                <span className="text-ink-muted/60">/ {fmtInt(a.today?.youtubeLimit || 10000)}·일</span>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink">
                번역(Google) <span className="text-ink-muted/70">(이번 달 {a.translate?.month || ""})</span>
              </span>
              <span className="font-mono tabular-nums text-ink-muted">
                {fmtInt(a.translate?.monthCharacters)}{" "}
                <span className="text-ink-muted/60">/ 500,000·월</span>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink">Gemini(지역/마커 AI)</span>
              <span className="text-ink-muted">무료 티어 내(호출 캐시)</span>
            </li>
            <li className="mt-1 border-t border-border pt-2 text-[11px] text-ink-muted">
              ※ 유튜브 유닛은 매일 자정(UTC), 번역 글자는 매월 초에 0으로 리셋됩니다.
              누적 사용량이 아니라 <strong>현재 기간</strong>의 사용량이라 한도와 직접 비교됩니다.
              Gemini 는 새 항목당 1회만 호출 후 영구 캐시라 사실상 $0.
            </li>
          </ul>
        </div>
      </div>

      {/* 아직 자동수집 안 되는 항목 — 정직하게 안내 */}
      <div className="rounded-xl border border-border bg-bg/50 p-4">
        <SectionTitle desc="이 값들은 외부 데이터라 자동으로 못 가져옵니다. 연결 방법:">
          아직 연동되지 않은 항목
        </SectionTitle>
        <ul className="space-y-1.5 text-xs text-ink-muted">
          <li>
            <strong className="text-ink">서버 비용(Vercel)</strong> — Vercel 요금 API
            토큰 연동 또는 매월 수동 입력.
          </li>
          <li>
            <strong className="text-ink">서버 비용(Firebase/GCP)</strong> — GCP 결제
            내보내기(BigQuery) 연동 또는 매월 수동 입력.
          </li>
          <li>
            <strong className="text-ink">애드센스 수입</strong> — 애드센스 승인 후
            AdSense Management API 연동(또는 수동 입력).
          </li>
          <li>
            <strong className="text-ink">실시간 접속자/도시별</strong> — 방문 추적을 다시
            켜면(1차 자체 기록) 이어서 집계됩니다. 도시 단위·실시간은 GA4 연동으로 확장 가능.
          </li>
        </ul>
      </div>
    </div>
  );
}
