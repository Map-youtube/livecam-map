// ─────────────────────────────────────────────────────────────
// gcpMonitoring — Google Cloud Monitoring API 로 "실제 사용량"을 가져온다 (서버 전용)
//
// 왜 필요한가:
//   우리가 코드에서 직접 세는 방식(recordApiUsage)은 빌드 중 호출 등을 놓쳐 부정확했다.
//   Google 이 이미 집계해 둔 정확한 수치(콘솔에 보이는 값)를 그대로 읽어와 대시보드에 쓴다.
//   → YouTube Data API 요청수(=유닛), Firestore 읽기/쓰기/삭제 일별 사용량.
//
// 인증:
//   기존 서비스 계정(FIREBASE_SERVICE_ACCOUNT_KEY)을 재사용한다. 새 키 발급 불필요.
//   이 계정에 IAM 역할 "Monitoring 뷰어(roles/monitoring.viewer)"가 있어야 조회된다.
//   (없으면 403 → { ok:false, error } 반환, 대시보드는 "권한 필요"로 안내)
//
// ⚠️ 서버 전용. 서비스 계정 키를 다루므로 클라이언트에서 import 금지.
// ⚠️ 초과분 "예상 비용"은 공식 표준 단가 기준 추정치다(정확한 청구액은 결제 콘솔 기준).
// ─────────────────────────────────────────────────────────────

import { unstable_cache } from "next/cache";
import { GoogleAuth } from "google-auth-library";

const MON_BASE = "https://monitoring.googleapis.com/v3";

// 무료 한도 + 초과 단가(공식 표준 단가, per 100,000 ops — 예상비용 계산용)
export const USAGE_LIMITS = {
  youtubeUnitsPerDay: 10000,
  firestore: {
    readsPerDay: 50000,
    writesPerDay: 20000,
    deletesPerDay: 20000,
    readPer100k: 0.06, // 표준 단가(추정): 읽기 100K당 $0.06
    writePer100k: 0.18, // 쓰기 100K당 $0.18
    deletePer100k: 0.02, // 삭제 100K당 $0.02
  },
};

// 서비스 계정 파싱 (firebaseAdmin.js 와 동일 방식: JSON.parse + private_key 줄바꿈 복원)
function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (sa && sa.private_key) {
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    }
    return sa && sa.private_key ? sa : null;
  } catch (error) {
    console.error("[gcpMonitoring] 서비스 계정 파싱 실패:", error && error.message); // TODO: 배포 전 제거
    return null;
  }
}

// UTC 자정 기준으로 정렬된 조회 구간 [start, now] 생성
function buildInterval(days) {
  const now = new Date();
  const todayMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const startMs = todayMidnightUtc - (days - 1) * 86400000; // days-1 일 전 자정
  return {
    startISO: new Date(startMs).toISOString(),
    endISO: now.toISOString(),
  };
}

// timeSeries 를 일별 합계 { "YYYY-MM-DD": 값 } 로 조회
async function queryDaily(projectId, token, filter, startISO, endISO) {
  const params = new URLSearchParams();
  params.set("filter", filter);
  params.set("interval.startTime", startISO);
  params.set("interval.endTime", endISO);
  params.set("aggregation.alignmentPeriod", "86400s"); // 하루
  params.set("aggregation.perSeriesAligner", "ALIGN_SUM");
  params.set("aggregation.crossSeriesReducer", "REDUCE_SUM"); // 리전/시리즈 합산

  const url = `${MON_BASE}/projects/${projectId}/timeSeries?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${data.error.code} ${data.error.message}`);
  }
  const byDay = {};
  for (const s of Array.isArray(data.timeSeries) ? data.timeSeries : []) {
    for (const p of Array.isArray(s.points) ? s.points : []) {
      // 알림 구간의 시작일을 그 "날짜"로 본다(자정 정렬 구간).
      const day = ((p.interval && p.interval.startTime) || "").slice(0, 10);
      if (!day) continue;
      const v = Number(
        (p.value && (p.value.int64Value ?? p.value.doubleValue)) || 0
      );
      byDay[day] = (byDay[day] || 0) + v;
    }
  }
  return byDay;
}

// 하루 Firestore 초과분 예상 비용($)
function firestoreDayCost(reads, writes, deletes) {
  const f = USAGE_LIMITS.firestore;
  const over = (used, free) => Math.max(0, used - free);
  return (
    (over(reads, f.readsPerDay) / 100000) * f.readPer100k +
    (over(writes, f.writesPerDay) / 100000) * f.writePer100k +
    (over(deletes, f.deletesPerDay) / 100000) * f.deletePer100k
  );
}

// 실제 조회 (캐시 대상)
async function fetchUsage(days) {
  const sa = parseServiceAccount();
  if (!sa) {
    return { ok: false, error: "서비스 계정 키가 없습니다.", daily: [] };
  }
  const projectId = sa.project_id;
  try {
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ["https://www.googleapis.com/auth/monitoring.read"],
    });
    const client = await auth.getClient();
    const tokenObj = await client.getAccessToken();
    const token = tokenObj && tokenObj.token ? tokenObj.token : null;
    if (!token) {
      return { ok: false, error: "액세스 토큰을 발급받지 못했습니다.", daily: [] };
    }

    const { startISO, endISO } = buildInterval(days);
    const [youtube, reads, writes, deletes] = await Promise.all([
      queryDaily(
        projectId,
        token,
        'metric.type="serviceruntime.googleapis.com/api/request_count" resource.label.service="youtube.googleapis.com"',
        startISO,
        endISO
      ),
      queryDaily(
        projectId,
        token,
        'metric.type="firestore.googleapis.com/document/read_count"',
        startISO,
        endISO
      ),
      queryDaily(
        projectId,
        token,
        'metric.type="firestore.googleapis.com/document/write_count"',
        startISO,
        endISO
      ),
      queryDaily(
        projectId,
        token,
        'metric.type="firestore.googleapis.com/document/delete_count"',
        startISO,
        endISO
      ),
    ]);

    // 날짜 합집합 → 일별 레코드 배열(오름차순)
    const allDays = new Set([
      ...Object.keys(youtube),
      ...Object.keys(reads),
      ...Object.keys(writes),
      ...Object.keys(deletes),
    ]);
    const daily = [...allDays]
      .sort()
      .map((date) => {
        const yt = Math.round(youtube[date] || 0);
        const r = Math.round(reads[date] || 0);
        const w = Math.round(writes[date] || 0);
        const d = Math.round(deletes[date] || 0);
        return {
          date,
          youtubeUnits: yt,
          firestoreReads: r,
          firestoreWrites: w,
          firestoreDeletes: d,
          firestoreCost: firestoreDayCost(r, w, d),
        };
      });

    return { ok: true, daily, error: null };
  } catch (error) {
    const msg = String((error && error.message) || error);
    // 403 = 권한 미부여(역할 전파 지연 포함)
    const permission = /permission|403|forbidden|monitoring\.timeSeries\.list/i.test(msg);
    console.error("[gcpMonitoring] 사용량 조회 실패:", msg); // TODO: 배포 전 제거
    return {
      ok: false,
      error: permission
        ? "Monitoring 조회 권한이 없습니다. 서비스 계정에 'Monitoring 뷰어' 역할이 부여됐는지 확인하세요(부여 후 몇 분 소요될 수 있음)."
        : "사용량 조회에 실패했습니다: " + msg.slice(0, 160),
      daily: [],
    };
  }
}

// 1시간 캐시(모니터링 데이터는 갱신 지연이 있고, 대시보드 열 때마다 재조회할 필요 없음)
export const getGcpUsage = unstable_cache(
  async (days = 14) => fetchUsage(days),
  ["gcp-usage"],
  { revalidate: 3600, tags: ["gcp-usage"] }
);
