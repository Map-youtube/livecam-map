// ─────────────────────────────────────────────────────────────
// 오로라 예보 API — src/app/api/aurora-forecast/route.js
//
// GET /api/aurora-forecast
//   NOAA SWPC OVATION 오로라 모델(격자 확률)을 프록시한다.
//   https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
//
//   응답의 coordinates 배열([경도, 위도, 확률(0~100)] 격자)을 "그대로" 반환한다.
//   (히트맵용 변환은 클라이언트 lib/auroraUtils.parseAuroraGrid 에서 처리)
//
//   캐싱: { next: { revalidate: 600 } } (10분)
//   실패 시: { coordinates: [] } 반환
//
// 외부 fetch → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVATION_URL =
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

export async function GET() {
  try {
    const res = await fetch(OVATION_URL, { next: { revalidate: 600 } }); // 10분 캐시
    if (!res.ok) {
      console.error(`[api/aurora-forecast] NOAA 실패 (status ${res.status})`); // TODO: 배포 전 제거
      return Response.json({ ok: true, coordinates: [] }, { status: 200 });
    }

    const data = await res.json();
    const coordinates = Array.isArray(data.coordinates) ? data.coordinates : [];

    // 원본 격자를 그대로 반환 (가공은 클라이언트에서)
    return Response.json({ ok: true, coordinates }, { status: 200 });
  } catch (error) {
    console.error("[api/aurora-forecast][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, coordinates: [] }, { status: 200 });
  }
}
