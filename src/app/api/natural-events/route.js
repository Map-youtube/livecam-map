// ─────────────────────────────────────────────────────────────
// 자연재해 API — src/app/api/natural-events/route.js
//
// GET /api/natural-events?category=wildfires,volcanoes,...
//   NASA EONET v3 오픈 이벤트를 프록시한다.
//   https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&category=...
//   - ?category= 쿼리로 카테고리 필터 가능. 기본값은 아래 6종 전체.
//
//   각 이벤트에서 { id, title, category, categoryTitle, sourceUrl, sourceName, lat, lng, date } 추출:
//     - geometry 배열의 "마지막" 좌표 = 최신 위치 (Point 형태만 사용, Polygon 등은 스킵)
//     - categories[0].id / .title, sources[0].url / .id
//
//   캐싱: { next: { revalidate: 900 } } (15분)
//   실패 시: 빈 배열 반환
//
// 외부 fetch → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기본 카테고리 (6종)
const DEFAULT_CATEGORIES =
  "wildfires,volcanoes,severeStorms,floods,landslides,seaLakeIce";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || DEFAULT_CATEGORIES;

    const url =
      "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&category=" +
      encodeURIComponent(category);

    const res = await fetch(url, { next: { revalidate: 900 } }); // 15분 캐시
    if (!res.ok) {
      console.error(`[api/natural-events] EONET 실패 (status ${res.status})`); // TODO: 배포 전 제거
      return Response.json({ ok: true, events: [] }, { status: 200 });
    }

    const data = await res.json();
    const rawEvents = Array.isArray(data.events) ? data.events : [];
    const events = [];

    for (const e of rawEvents) {
      try {
        const geom = Array.isArray(e.geometry) ? e.geometry : [];
        if (geom.length === 0) continue;

        // 마지막 geometry = 최신 위치
        const last = geom[geom.length - 1] || {};
        const coords = Array.isArray(last.coordinates) ? last.coordinates : [];
        // Point 형태([lng, lat])만 사용. Polygon 등 중첩 배열은 스킵.
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isNaN(lng) || Number.isNaN(lat)) continue;

        const cat =
          Array.isArray(e.categories) && e.categories[0] ? e.categories[0] : {};
        const src = Array.isArray(e.sources) && e.sources[0] ? e.sources[0] : {};

        events.push({
          id: e.id,
          title: e.title || "",
          category: cat.id || "", // 아이콘 매핑용 id
          categoryTitle: cat.title || "", // 표시용 이름
          sourceUrl: src.url || "",
          sourceName: src.id || "",
          lat,
          lng,
          date: last.date || "",
        });
      } catch (innerError) {
        // 개별 이벤트 파싱 실패는 건너뛴다
        continue;
      }
    }

    return Response.json({ ok: true, events }, { status: 200 });
  } catch (error) {
    console.error("[api/natural-events][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, events: [] }, { status: 200 });
  }
}
