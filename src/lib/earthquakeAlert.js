// ─────────────────────────────────────────────────────────────
// earthquakeAlert — 지진 발생 알림 팝업의 "판단 로직" 모음 (클라이언트/서버 공용, 순수 함수)
//
// UI 는 src/components/EarthquakeAlert.js 가 담당하고, 이 파일은 계산만 한다:
//   1) 규모별 팝업 유지 기간 (요구사항 7~11)
//   2) 두 좌표 사이 거리(km) — 지진 위치에서 가장 가까운 라이브캠을 찾기 위함 (요구사항 2·3)
//   3) 이미 본 지진 기록(localStorage) — "접속 중 사용자에겐 1회만" (요구사항 7~11)
//   4) 지금 띄울 지진 1건 선정
//
// ⚠️ 비용: 이 로직은 전부 브라우저 안에서 계산된다. Firestore/YouTube/AI 호출이 전혀 없다.
//    지진 데이터는 이미 있는 /api/earthquakes(USGS 무료 피드, 서버에서 5분 캐시)를 그대로 쓴다.
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

// 팝업을 띄우는 최소 규모 (요구사항 1)
export const MIN_ALERT_MAGNITUDE = 4.5;

// ─── 규모별 "신규 접속자에게 유지되는 기간" (요구사항 7~11) ────
//   4.5 이상 ~ 5.0 미만 : 1일
//   5.0 이상 ~ 6.0 미만 : 2일
//   6.0 이상 ~ 7.0 미만 : 2.5일
//   7.0 이상 ~ 8.0 미만 : 3일
//   8.0 이상            : 5일
//   (4.5 미만은 0 → 팝업 대상 아님)
export function alertWindowMs(magnitude) {
  const m = Number(magnitude);
  if (!Number.isFinite(m) || m < MIN_ALERT_MAGNITUDE) return 0;
  if (m < 5) return 1 * DAY_MS;
  if (m < 6) return 2 * DAY_MS;
  if (m < 7) return 2.5 * DAY_MS;
  if (m < 8) return 3 * DAY_MS;
  return 5 * DAY_MS;
}

// ─── 두 좌표 사이 거리 (하버사인 공식, km) ────────────────────
export function distanceKm(lat1, lng1, lat2, lng2) {
  try {
    const R = 6371; // 지구 평균 반지름(km)
    const toRad = (d) => (Number(d) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  } catch (error) {
    return Infinity;
  }
}

// ─── 지진 위치에서 가장 가까운 마커 N개 (요구사항 2·3) ─────────
// 반환: [{ ...marker, distanceKm }] — 가까운 순.
// ⚠️ maxKm: 지진이 대양 한가운데서 나면 "가장 가까운" 곳도 수천 km 떨어져 무의미하므로
//    기본 3,000km 를 넘는 곳은 제외한다(없으면 빈 배열 → UI 가 "근처 없음"으로 안내).
export function findNearestMarkers(markers, lat, lng, options = {}) {
  const limit = typeof options.limit === "number" ? options.limit : 5;
  const maxKm = typeof options.maxKm === "number" ? options.maxKm : 3000;
  try {
    const eqLat = Number(lat);
    const eqLng = Number(lng);
    if (!Number.isFinite(eqLat) || !Number.isFinite(eqLng)) return [];

    const scored = [];
    for (const m of Array.isArray(markers) ? markers : []) {
      // ⚠️ 각 마커는 "자기 자신의" 좌표로 거리를 계산한다(반복문 밖 고정값 참조 금지).
      if (!m || typeof m.lat !== "number" || typeof m.lng !== "number") continue;
      const d = distanceKm(eqLat, eqLng, m.lat, m.lng);
      if (!Number.isFinite(d) || d > maxKm) continue;
      scored.push({ ...m, distanceKm: d });
    }
    scored.sort((a, b) => a.distanceKm - b.distanceKm);
    return scored.slice(0, limit);
  } catch (error) {
    console.error("[earthquakeAlert] 근접 마커 계산 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 거리 표기 (1,234 km / 12.3 km)
export function formatDistanceKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "";
  if (n < 10) return `${n.toFixed(1)} km`;
  return `${Math.round(n).toLocaleString()} km`;
}

// ─── 이미 본 지진 기록 (localStorage) ─────────────────────────
// { [지진id]: 본 시각(ms) } 형태. 오래된 항목은 읽을 때 정리한다(6일 초과 = 최장 유지기간보다 김).
const SEEN_KEY = "livecam_eq_seen";
const SEEN_TTL_MS = 6 * DAY_MS;

export function loadSeenIds(now = Date.now()) {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // 만료 항목 제거(무한 증가 방지)
    const out = {};
    for (const [id, ts] of Object.entries(parsed)) {
      const t = Number(ts);
      if (Number.isFinite(t) && now - t < SEEN_TTL_MS) out[id] = t;
    }
    return out;
  } catch (error) {
    return {};
  }
}

export function markSeenIds(ids, now = Date.now()) {
  try {
    if (typeof window === "undefined") return;
    const current = loadSeenIds(now);
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      if (id) current[String(id)] = now;
    }
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(current));
  } catch (error) {
    // 저장 실패(사생활 보호 모드 등)는 무시 — 이번 세션에만 다시 뜰 수 있을 뿐
  }
}

// ─── 지금 띄울 지진 선정 ──────────────────────────────────────
// 조건: 규모 4.5 이상 && (지금 - 발생시각) < 규모별 유지기간 && 아직 안 본 것.
// 여러 건이 해당되면 "가장 큰 규모"(같으면 더 최근) 1건만 띄운다.
//   ⚠️ 4.5+ 지진은 하루 20~30건이라 전부 띄우면 팝업 폭탄이 된다. 그래서 한 번에 1건만 보여주고,
//      사용자가 닫으면(=현재 상황을 확인함) 그 시점에 조건을 만족하던 나머지도 함께 "본 것"으로
//      처리한다(EarthquakeAlert 의 닫기 처리). 닫은 뒤 "새로" 발생한 지진은 다시 알린다.
// 반환: { target, eligibleIds } — target 이 null 이면 띄울 것 없음.
export function pickAlertEarthquake(earthquakes, seen = {}, now = Date.now()) {
  const eligible = [];
  try {
    for (const eq of Array.isArray(earthquakes) ? earthquakes : []) {
      if (!eq || !eq.id) continue;
      const mag = Number(eq.magnitude);
      if (!Number.isFinite(mag) || mag < MIN_ALERT_MAGNITUDE) continue;
      const time = Number(eq.time);
      if (!Number.isFinite(time)) continue;
      const win = alertWindowMs(mag);
      if (win <= 0) continue;
      if (now - time > win) continue; // 유지 기간 지남 → 노출 중지
      if (seen && seen[eq.id]) continue; // 이미 본 지진
      eligible.push(eq);
    }
    // 규모 큰 순 → 같으면 최근 순
    eligible.sort(
      (a, b) =>
        Number(b.magnitude) - Number(a.magnitude) || Number(b.time) - Number(a.time)
    );
  } catch (error) {
    console.error("[earthquakeAlert] 알림 대상 선정 실패:", error); // TODO: 배포 전 제거
  }
  return {
    target: eligible.length > 0 ? eligible[0] : null,
    eligibleIds: eligible.map((e) => e.id),
  };
}

// ─── USGS PAGER 경보등급 → 표시용 색/라벨 키 ───────────────────
// USGS 가 산정한 예상 피해 등급(green/yellow/orange/red). 없을 수도 있다.
export function pagerAlertStyle(alertLevel) {
  switch (String(alertLevel || "").toLowerCase()) {
    case "red":
      return { color: "#B71C1C", key: "eqPagerRed" };
    case "orange":
      return { color: "#E65100", key: "eqPagerOrange" };
    case "yellow":
      return { color: "#F9A825", key: "eqPagerYellow" };
    case "green":
      return { color: "#2E7D32", key: "eqPagerGreen" };
    default:
      return null;
  }
}
