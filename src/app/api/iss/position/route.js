// ─────────────────────────────────────────────────────────────
// ISS 위치 프록시 API — 1순위 WTIA, 폴백 Open Notify
//
// GET /api/iss/position
//   - 1순위: WTIA(https://api.wheretheiss.at/v1/satellites/25544)
//       성공 시 { lat, lng, altKm, speedKmh, visibility, source:"wtia" }
//   - WTIA 실패(오류/3초 타임아웃) 시: Open Notify(http://api.open-notify.org/iss-now.json)
//       성공 시 { lat, lng, altKm:null, speedKmh:null, visibility:null, source:"open-notify" }
//       ※ Open Notify 는 http 전용 → 브라우저 직접 호출 시 혼합 콘텐츠 차단.
//         반드시 이 서버 프록시에서만 호출한다.
//   - 둘 다 실패 → 503
//
// ★ 캐싱: 외부 fetch 에 { next: { revalidate: 2 } } (2초 캐시)
//   → 방문자가 많아도 실제 외부 호출은 2초에 1번으로 제한(WTIA 레이트리밋/차단 예방).
//   Open Notify 폴백도 동일 캐시가 적용된다.
//
// 외부 네트워크 호출이므로 Node.js 런타임 + 요청마다 실행(force-dynamic).
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WTIA_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const OPEN_NOTIFY_URL = "http://api.open-notify.org/iss-now.json";
const WTIA_TIMEOUT_MS = 3000;

// ─── 1순위: WTIA ─────────────────────────────────────────────
async function fetchWtia() {
  // 3초 타임아웃 (느린 응답이면 폴백으로 넘어가기 위함)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WTIA_TIMEOUT_MS);
  try {
    const res = await fetch(WTIA_URL, {
      signal: controller.signal,
      next: { revalidate: 2 }, // 2초 캐시 (레이트리밋 예방)
    });
    if (!res.ok) return null;

    const d = await res.json();
    // 좌표는 필수 — 없으면 실패로 간주
    if (typeof d.latitude !== "number" || typeof d.longitude !== "number") {
      return null;
    }
    return {
      lat: d.latitude,
      lng: d.longitude,
      altKm: typeof d.altitude === "number" ? d.altitude : null,
      speedKmh: typeof d.velocity === "number" ? d.velocity : null,
      visibility: typeof d.visibility === "string" ? d.visibility : null,
      source: "wtia",
    };
  } catch (error) {
    // 타임아웃/네트워크 오류 → 폴백으로
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 폴백: Open Notify (http 전용, 반드시 서버에서만) ─────────
async function fetchOpenNotify() {
  try {
    const res = await fetch(OPEN_NOTIFY_URL, {
      next: { revalidate: 2 }, // 동일 2초 캐시
    });
    if (!res.ok) return null;

    const d = await res.json();
    const pos = d && d.iss_position ? d.iss_position : null;
    if (!pos) return null;

    const lat = Number(pos.latitude);
    const lng = Number(pos.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return {
      lat,
      lng,
      altKm: null,
      speedKmh: null,
      visibility: null,
      source: "open-notify",
    };
  } catch (error) {
    return null;
  }
}

export async function GET() {
  try {
    // 1순위 → 폴백 순서로 시도
    let data = await fetchWtia();
    if (!data) {
      data = await fetchOpenNotify();
    }

    if (!data) {
      return Response.json(
        { ok: false, error: "ISS 위치를 가져오지 못했습니다." },
        { status: 503 }
      );
    }

    return Response.json({ ok: true, ...data }, { status: 200 });
  } catch (error) {
    console.error("[api/iss/position][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "ISS 위치 조회 중 오류가 발생했습니다: " + error.message },
      { status: 503 }
    );
  }
}
