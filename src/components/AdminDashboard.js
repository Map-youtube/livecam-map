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

// 무료 한도 대비 사용량 막대 (한도 초과 시 빨강). label · used/limit.
function UsageBar({ label, used, limit, unit = "" }) {
  const u = Number(used || 0);
  const lim = Number(limit || 0);
  const pct = lim > 0 ? Math.min(100, Math.round((u / lim) * 100)) : 0;
  const over = lim > 0 && u > lim;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink">{label}</span>
        <span className={`font-mono tabular-nums ${over ? "text-live" : "text-ink-muted"}`}>
          {fmtInt(u)}
          {unit} <span className="text-ink-muted/60">/ {fmtInt(lim)}{unit}</span>
          {over && <span className="ml-1 font-semibold text-live">초과</span>}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-bg">
        <span
          className={`block h-full rounded ${over ? "bg-live" : "bg-brand"}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
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

  // 재무 수동입력 폼 상태
  const [finForm, setFinForm] = useState({ month: "", vercel: "", firebase: "", adsense: "" });
  const [finSaving, setFinSaving] = useState(false);
  const [finMsg, setFinMsg] = useState("");

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

  // 데이터 로드되면 재무 폼을 "이번 달" 기존값으로 프리필(입력 시작점).
  useEffect(() => {
    const tm = data?.finance?.thisMonth;
    const month = data?.finance?.month || tm?.month;
    if (!month) return;
    setFinForm((prev) => {
      if (prev.month) return prev; // 사용자가 이미 편집 중이면 덮어쓰지 않음
      return {
        month,
        vercel: tm?.vercel ? String(tm.vercel) : "",
        firebase: tm?.firebase ? String(tm.firebase) : "",
        adsense: tm?.adsense ? String(tm.adsense) : "",
      };
    });
  }, [data]);

  // 재무 수동입력 저장
  const saveFinance = useCallback(async () => {
    setFinSaving(true);
    setFinMsg("");
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.location.href = "/admin/login";
        return;
      }
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month: finForm.month,
          vercel: Number(finForm.vercel) || 0,
          firebase: Number(finForm.firebase) || 0,
          adsense: Number(finForm.adsense) || 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setFinMsg("저장되었습니다.");
        await load(); // 대시보드 값 갱신
      } else {
        setFinMsg(json.error || "저장에 실패했습니다.");
      }
    } catch (e) {
      setFinMsg("저장에 실패했습니다.");
    } finally {
      setFinSaving(false);
    }
  }, [finForm, load]);

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
  const fin = data.finance || {};
  const maxCountry = Math.max(1, ...(v.byCountry || []).map((c) => c.count));
  const maxCity = Math.max(1, ...(v.byCity || []).map((c) => c.count));
  const latestDate = v.latestDate || a.latestDate || null;

  // 서버 비용(Vercel+Firebase) 이번 달 / 누적
  const serverThisMonth = Number(fin.thisMonth?.vercel || 0) + Number(fin.thisMonth?.firebase || 0);
  const serverTotal = Number(fin.totals?.vercel || 0) + Number(fin.totals?.firebase || 0);

  // 이번 달 손익 = 수입(애드센스) - 비용(API + 서버)
  const monthRevenue = Number(fin.thisMonth?.adsense || 0);
  const monthCost = Number(a.monthCost || 0) + serverThisMonth;
  const monthNet = monthRevenue - monthCost;

  // ── GCP 실측 사용량(Google 집계, 정확) ──────────────────────
  const usage = data.usage || {};
  const usageDaily = Array.isArray(usage.daily) ? usage.daily : [];
  const limits = usage.limits || {};
  const fsLimit = limits.firestore || {};
  const usageLatest = usageDaily.length ? usageDaily[usageDaily.length - 1] : null;
  // 최근 14일 Firestore 초과 예상비용 합계
  const usageFsCost = usageDaily.reduce((s, d) => s + Number(d.firestoreCost || 0), 0);

  return (
    <div className="space-y-6">
      {/* 데이터 신선도 안내 */}
      <div className="rounded-lg border border-border bg-bg/50 px-4 py-2.5 text-xs leading-relaxed text-ink-muted">
        <strong className="text-ink">데이터 안내:</strong> 아래 <strong>실측 사용량</strong> 섹션은
        Google Cloud 가 집계한 <strong>정확한 값</strong>(콘솔과 동일)입니다. 방문자·손익 등 그 외
        수치는 자체 기록/수동 입력입니다. 최신 방문자 기준일 <strong>{latestDate || "없음"}</strong>.
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
        <Kpi
          title="서버 비용(이번 달)"
          value={fmtUsd(serverThisMonth)}
          sub={`누적 ${fmtUsd(serverTotal)} · 수동 입력`}
        />
        <Kpi
          title="애드센스 수입(이번 달)"
          value={fmtUsd(fin.thisMonth?.adsense)}
          tone="brand"
          sub={`누적 ${fmtUsd(fin.totals?.adsense)} · 수동 입력`}
        />
      </div>

      {/* ── 실측 사용량 (Google Cloud Monitoring 집계, 정확) ── */}
      <div className="rounded-xl border-2 border-brand/30 bg-surface p-4">
        <SectionTitle desc="Google Cloud 가 집계한 실제 사용량 — 콘솔과 동일한 정확한 값. 무료 한도 대비 표시.">
          📊 실측 사용량 (Google 집계 · 정확)
        </SectionTitle>

        {!usage.ok ? (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            아직 정확한 사용량을 불러오지 못했습니다. {usage.error || ""}
            <br />
            서비스 계정에 <strong>Monitoring 뷰어</strong> 역할을 부여한 뒤 몇 분 기다렸다가
            새로고침하세요.
          </div>
        ) : !usageLatest ? (
          <p className="py-4 text-center text-xs text-ink-muted">사용량 데이터가 아직 없습니다.</p>
        ) : (
          <>
            <p className="mb-3 text-[11px] text-ink-muted">
              최신 집계일 <strong className="text-ink">{usageLatest.date}</strong>(UTC 기준) ·
              오늘 값은 하루가 끝나기 전이라 계속 올라갑니다.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <UsageBar
                label="YouTube Data (유닛/일)"
                used={usageLatest.youtubeUnits}
                limit={limits.youtubeUnitsPerDay || 10000}
              />
              <UsageBar
                label="Firestore 읽기/일"
                used={usageLatest.firestoreReads}
                limit={fsLimit.readsPerDay || 50000}
              />
              <UsageBar
                label="Firestore 쓰기/일"
                used={usageLatest.firestoreWrites}
                limit={fsLimit.writesPerDay || 20000}
              />
              <UsageBar
                label="Firestore 삭제/일"
                used={usageLatest.firestoreDeletes}
                limit={fsLimit.deletesPerDay || 20000}
              />
            </div>

            {/* 최근 14일 추이 표 (읽기가 핵심 — 최근 것부터) */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="py-1 pr-3 font-medium">날짜(UTC)</th>
                    <th className="py-1 pr-3 text-right font-medium">YouTube 유닛</th>
                    <th className="py-1 pr-3 text-right font-medium">FS 읽기</th>
                    <th className="py-1 pr-3 text-right font-medium">FS 쓰기</th>
                    <th className="py-1 text-right font-medium">초과 예상비용</th>
                  </tr>
                </thead>
                <tbody>
                  {[...usageDaily].reverse().map((d) => {
                    const ytOver = d.youtubeUnits > (limits.youtubeUnitsPerDay || 10000);
                    const rOver = d.firestoreReads > (fsLimit.readsPerDay || 50000);
                    return (
                      <tr key={d.date} className="border-t border-border">
                        <td className="py-1 pr-3 font-mono">{d.date}</td>
                        <td
                          className={`py-1 pr-3 text-right font-mono tabular-nums ${
                            ytOver ? "text-live" : "text-ink"
                          }`}
                        >
                          {fmtInt(d.youtubeUnits)}
                        </td>
                        <td
                          className={`py-1 pr-3 text-right font-mono tabular-nums ${
                            rOver ? "text-live" : "text-ink"
                          }`}
                        >
                          {fmtInt(d.firestoreReads)}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono tabular-nums text-ink">
                          {fmtInt(d.firestoreWrites)}
                        </td>
                        <td
                          className={`py-1 text-right font-mono tabular-nums ${
                            d.firestoreCost > 0 ? "text-live" : "text-ink-muted"
                          }`}
                        >
                          {d.firestoreCost > 0 ? fmtUsd(d.firestoreCost) : "$0.00"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                ※ 최근 {usageDaily.length}일 Firestore 초과 예상비용 합계:{" "}
                <strong className={usageFsCost > 0 ? "text-live" : "text-ink"}>
                  {fmtUsd(usageFsCost)}
                </strong>{" "}
                (공식 표준 단가 기준 추정 — 정확한 청구액은 결제 콘솔). YouTube 유닛은 무료 할당량
                초과 시 비용이 아니라 그날 <strong>서비스 중단(403)</strong>으로 이어집니다.
              </p>
            </div>
          </>
        )}
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
          <SectionTitle desc="Monitoring 이 안 잡는 항목(번역·Gemini)만 — YouTube·Firestore 는 위 '실측 사용량' 참고">
            그 외 무료 한도 현황
          </SectionTitle>
          <ul className="space-y-2 text-xs">
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
              ※ 번역 글자는 매월 초 0으로 리셋(자체 기록). Gemini 는 새 항목당 1회만 호출 후 영구
              캐시라 사실상 $0. <strong>YouTube 유닛·Firestore 읽기/쓰기는 위 "실측 사용량"</strong>에서
              Google 집계 정확값으로 확인하세요.
            </li>
          </ul>
        </div>
      </div>

      {/* 이번 달 손익 + 서버비용/애드센스 수동입력 */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <SectionTitle
          desc={`${fin.month || "이번 달"} 기준 · 수입(애드센스) − 비용(API+서버). 서버비용·애드센스는 자동 수집이 안 돼 아래에서 직접 입력합니다.`}
        >
          이번 달 손익
        </SectionTitle>

        {/* 요약 3칸 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-bg/40 p-3">
            <p className="text-[11px] text-ink-muted">수입(애드센스)</p>
            <p className="mt-0.5 font-display text-lg font-bold text-brand">
              {fmtUsd(monthRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-bg/40 p-3">
            <p className="text-[11px] text-ink-muted">비용(API+서버)</p>
            <p className="mt-0.5 font-display text-lg font-bold text-ink">{fmtUsd(monthCost)}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg/40 p-3">
            <p className="text-[11px] text-ink-muted">순수지</p>
            <p
              className={`mt-0.5 font-display text-lg font-bold ${
                monthNet >= 0 ? "text-brand" : "text-live"
              }`}
            >
              {monthNet < 0 ? "-" : ""}
              {fmtUsd(Math.abs(monthNet))}
            </p>
          </div>
        </div>

        {/* 수동입력 폼 */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-ink">
            서버 비용·애드센스 입력 <span className="text-ink-muted">(USD, 월 단위 실제 금액)</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="text-[11px] text-ink-muted">
              월(YYYY-MM)
              <input
                type="month"
                value={finForm.month}
                onChange={(e) => setFinForm((f) => ({ ...f, month: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
              />
            </label>
            <label className="text-[11px] text-ink-muted">
              Vercel($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={finForm.vercel}
                onChange={(e) => setFinForm((f) => ({ ...f, vercel: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
              />
            </label>
            <label className="text-[11px] text-ink-muted">
              Firebase($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={finForm.firebase}
                onChange={(e) => setFinForm((f) => ({ ...f, firebase: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
              />
            </label>
            <label className="text-[11px] text-ink-muted">
              애드센스($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={finForm.adsense}
                onChange={(e) => setFinForm((f) => ({ ...f, adsense: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={saveFinance}
                disabled={finSaving || !finForm.month}
                className="w-full rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
              >
                {finSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
          {finMsg && <p className="mt-1.5 text-[11px] text-ink-muted">{finMsg}</p>}
        </div>

        {/* 월별 표 */}
        {(fin.months || []).length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="py-1 pr-3 font-medium">월</th>
                  <th className="py-1 pr-3 text-right font-medium">Vercel</th>
                  <th className="py-1 pr-3 text-right font-medium">Firebase</th>
                  <th className="py-1 pr-3 text-right font-medium">애드센스</th>
                  <th className="py-1 text-right font-medium">월 순수지*</th>
                </tr>
              </thead>
              <tbody>
                {[...(fin.months || [])].reverse().map((m) => {
                  const net = m.adsense - (m.vercel + m.firebase);
                  return (
                    <tr key={m.month} className="border-t border-border">
                      <td className="py-1 pr-3 font-mono">{m.month}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {fmtUsd(m.vercel)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {fmtUsd(m.firebase)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums text-brand">
                        {fmtUsd(m.adsense)}
                      </td>
                      <td
                        className={`py-1 text-right font-mono tabular-nums ${
                          net >= 0 ? "text-brand" : "text-live"
                        }`}
                      >
                        {net < 0 ? "-" : ""}
                        {fmtUsd(Math.abs(net))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] text-ink-muted">
              * 월 순수지는 서버비용 기준(애드센스 − Vercel − Firebase)의 간이 계산이며, API
              비용은 상단 손익 요약에만 반영됩니다.
            </p>
          </div>
        )}
      </div>

      {/* 아직 자동수집 안 되는 항목 — 정직하게 안내 */}
      <div className="rounded-xl border border-border bg-bg/50 p-4">
        <SectionTitle desc="아래 값은 외부 데이터라 자동 수집이 안 됩니다. 지금은 위에서 매월 직접 입력하고, 나중에 API 연동으로 자동화할 수 있습니다:">
          자동화 예정(현재는 수동 입력)
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
