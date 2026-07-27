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

// ─── 근접 구간 기준 (km) ──────────────────────────────────────
// 지진 진앙에서 "실제로 의미 있는" 거리만 보여주기 위한 2단계 구간.
//   500km 이내  : 진짜 인근 — 흔들림/피해가 있을 수 있는 범위
//   1,000km 이내: 같은 권역 — 참고할 만한 범위
//   1,000km 초과: 보여주지 않는다("가까운 지역 영상 없음"으로 안내)
export const NEAR_TIER_1_KM = 500;
export const NEAR_TIER_2_KM = 1000;

// ─── 지진 위치에서 가장 가까운 마커 N개 (요구사항 2·3) ─────────
// 반환: [{ ...marker, distanceKm }] — 가까운 순.
// ⚠️ maxKm: 지진이 대양 한가운데서 나면 "가장 가까운" 곳도 수천 km 떨어져 무의미하므로
//    기본 1,000km 를 넘는 곳은 제외한다(없으면 빈 배열 → UI 가 "근처 없음"으로 안내).
export function findNearestMarkers(markers, lat, lng, options = {}) {
  const limit = typeof options.limit === "number" ? options.limit : 5;
  const maxKm =
    typeof options.maxKm === "number" ? options.maxKm : NEAR_TIER_2_KM;
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

// ─── 거리 구간별 분류 (500km 이내 / 1,000km 이내) ─────────────
// 반환: { within500, within1000, hasAny }
//   within500  : 진앙 500km 이내 (가까운 순)
//   within1000 : 500km 초과 ~ 1,000km 이내 (가까운 순)
//   hasAny     : 둘 중 하나라도 있으면 true. false 면 UI 가 "가까운 지역 영상 없음"을 보여준다.
// ⚠️ 1,000km 를 넘는 곳은 "가까운 영상"이라 부를 수 없으므로 아예 제외한다.
export function groupNearestByDistance(markers, lat, lng, options = {}) {
  const limit = typeof options.limit === "number" ? options.limit : 6;
  const list = findNearestMarkers(markers, lat, lng, {
    limit,
    maxKm: NEAR_TIER_2_KM,
  });
  const within500 = list.filter((m) => m.distanceKm <= NEAR_TIER_1_KM);
  const within1000 = list.filter((m) => m.distanceKm > NEAR_TIER_1_KM);
  return {
    within500,
    within1000,
    hasAny: within500.length > 0 || within1000.length > 0,
  };
}

// ─── "오늘 하루 보지 않기" (localStorage) ─────────────────────
// ⚠️ 노출 규칙(사용자 요구):
//   - 접속 중 + 새로고침/재접속(= 신규 접속)에는 다시 보인다 → 닫기(✕)는 "이번 화면에서만" 닫는다
//     (그래서 닫힘 기록은 저장하지 않고 컴포넌트 메모리에만 둔다).
//   - 다시 안 보고 싶은 사람을 위해 "오늘 하루 보지 않기" 버튼을 두고, 누르면 24시간 동안
//     모든 지진 알림을 숨긴다(특정 지진 1건이 아니라 전체 음소거).
const MUTE_KEY = "livecam_eq_mute_until";
const MUTE_MS = DAY_MS; // 24시간

export function isAlertMuted(now = Date.now()) {
  try {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(MUTE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && now < until;
  } catch (error) {
    return false;
  }
}

export function muteAlertsForDay(now = Date.now()) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MUTE_KEY, String(now + MUTE_MS));
  } catch (error) {
    // 저장 실패(사생활 보호 모드 등)는 무시 — 음소거가 안 될 뿐 화면은 정상
  }
}

// ─── 지금 띄울 지진 선정 ──────────────────────────────────────
// 조건: 규모 4.5 이상 && (지금 - 발생시각) < 규모별 유지기간 && 이번 화면에서 아직 안 닫은 것.
// 여러 건이 해당되면 "가장 큰 규모"(같으면 더 최근) 1건만 띄운다.
//   ⚠️ 4.5+ 지진은 하루 20~30건이라 전부 띄우면 팝업 폭탄이 된다. 그래서 한 번에 1건만 보여주고,
//      사용자가 닫으면 그 시점에 조건을 만족하던 나머지도 함께 "이번 화면에서 닫음"으로 처리한다.
//   ⚠️ dismissed 는 localStorage 가 아니라 "컴포넌트 메모리"다 → 새로고침/재접속하면 다시 보인다
//      (사용자 요구: 신규 접속 = 새로고침·재접속 포함). 완전히 끄려면 "오늘 하루 보지 않기".
// 반환: { target, eligibleIds } — target 이 null 이면 띄울 것 없음.
export function pickAlertEarthquake(
  earthquakes,
  dismissed = {},
  now = Date.now()
) {
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
      if (dismissed && dismissed[eq.id]) continue; // 이번 화면에서 이미 닫은 지진
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
