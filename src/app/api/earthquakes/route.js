// ─────────────────────────────────────────────────────────────
// 지진 API — src/app/api/earthquakes/route.js
//
// GET /api/earthquakes
//   USGS 실시간 요약 GeoJSON 피드(규모 4.5 이상, 최근 24시간)를 프록시한다.
//   https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson
//
//   각 지진에서 { id, magnitude, depthKm, place, time, lat, lng } 추출:
//     - properties.mag / .place / .time (epoch ms)
//     - geometry.coordinates = [경도(lng), 위도(lat), 깊이(depth km)]
//
//   캐싱: { next: { revalidate: 300 } } (5분)
//   실패 시: 빈 배열 반환(500 금지 — 지도 다른 기능에 영향 없어야 함)
//
// 외부 fetch → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USGS_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

export async function GET() {
  try {
    const res = await fetch(USGS_FEED, { next: { revalidate: 300 } }); // 5분 캐시
    if (!res.ok) {
      console.error(`[api/earthquakes] USGS 실패 (status ${res.status})`); // TODO: 배포 전 제거
      return Response.json({ ok: true, earthquakes: [] }, { status: 200 });
    }

    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];
    const earthquakes = [];

    for (const f of features) {
      try {
        const p = f.properties || {};
        const g = f.geometry || {};
        const coords = Array.isArray(g.coordinates) ? g.coordinates : [];
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        const depth = Number(coords[2]);
        // 좌표가 없으면 지도에 못 찍으므로 제외
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        earthquakes.push({
          id: f.id,
          magnitude: typeof p.mag === "number" ? p.mag : null,
          depthKm: Number.isNaN(depth) ? null : depth,
          place: p.place || "",
          time: typeof p.time === "number" ? p.time : null,
          lat,
          lng,
        });
      } catch (innerError) {
        // 개별 항목 파싱 실패는 건너뛴다
        continue;
      }
    }

    return Response.json({ ok: true, earthquakes }, { status: 200 });
  } catch (error) {
    console.error("[api/earthquakes][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, earthquakes: [] }, { status: 200 });
  }
}
