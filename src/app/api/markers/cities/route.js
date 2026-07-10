// ─────────────────────────────────────────────────────────────
// GET /api/markers/cities — 기존에 등록된 "도시명" 목록 (자동완성용)
//
// 관리자 마커 등록 폼의 도시 입력 자동완성에 사용한다.
// 같은 도시가 띄어쓰기/순서 차이로 다르게 저장되어(예: "버팔로 뉴욕주" vs "버팔로뉴욕주")
// 사이트에서 한 곳이 두 개로 표기되는 것을 막기 위해, 이미 쓰인 도시명을 그대로 보여준다.
//
// 응답: { ok: true, cities: [{ city, country, continent, count }, ...] }
//   - city|country 조합별로 중복 없이 집계(같은 도시명이 여러 국가에 있을 수 있어 국가로 구분).
//   - count = 그 도시명이 쓰인 마커 수(많이 쓰인 것부터 위로 정렬).
//   - is_active 여부와 무관하게 "이미 쓰인 모든 도시명"을 포함(중복 방지가 목적).
//
// ⚠️ 공개 마커 데이터에서 파생되는 비민감 정보라 별도 인증은 두지 않는다(GET /api/markers 와 동일 성격).
// ⚠️ firebase-admin(Node 전용) 사용 → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
// 실시간 데이터라 정적 캐시하지 않는다.
export const dynamic = "force-dynamic";

const COLLECTION = "markers";

export async function GET() {
  try {
    // 모든 마커를 읽어 도시명을 집계한다(관리자 페이지 저빈도 접근이라 부담 적음).
    const snapshot = await adminDb.collection(COLLECTION).get();

    // key = "도시명||국가코드" → { city, country, continent, count }
    const map = new Map();
    snapshot.docs.forEach((doc) => {
      const d = doc.data() || {};
      const city = typeof d.city === "string" ? d.city.trim() : "";
      // 도시명이 비어 있으면 건너뜀
      if (!city) return;
      const country = typeof d.country === "string" ? d.country : "";
      const continent = typeof d.continent === "string" ? d.continent : "";
      const key = `${city}||${country}`;
      if (!map.has(key)) {
        map.set(key, { city, country, continent, count: 0 });
      }
      map.get(key).count += 1;
    });

    // 많이 쓰인 순 → 같은 빈도면 도시명 가나다순
    const cities = [...map.values()].sort(
      (a, b) => b.count - a.count || a.city.localeCompare(b.city, "ko")
    );

    return Response.json({ ok: true, cities }, { status: 200 });
  } catch (error) {
    console.error("[api/markers/cities][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      {
        ok: false,
        error: "도시 목록을 불러오지 못했습니다: " + error.message,
        cities: [],
      },
      { status: 500 }
    );
  }
}
