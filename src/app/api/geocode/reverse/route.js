// ─────────────────────────────────────────────────────────────
// 역지오코딩 API — 좌표(lat/lng) → 도시/국가/대륙 (관리자 전용)
//
// GET /api/geocode/reverse?lat=..&lng=..
//   - verifyAdminRequest 로 보호 (우리 서버가 Nominatim 프록시로 남용/차단되는 것 방지).
//   - OpenStreetMap Nominatim 역지오코딩(무료, API 키 불필요)을 서버에서 호출한다.
//     · accept-language=en → 도시명을 영어 기준으로 받아 기존 도시 데이터("Tokyo" 등)와 통일.
//     · address 객체에서 도시명 후보를 우선순위대로 추출.
//   - country_code(소문자 alpha-2)를 대문자로 정규화하고, continentUtils 로 대륙까지 계산.
//   - 응답: { ok:true, city, countryCode, continent, displayName }
//
// ⚠️ Nominatim 이용정책:
//   · 앱을 식별하는 User-Agent 헤더 필수(없으면 403 가능).
//   · 초당 1회 이하 사용(관리자가 지도를 클릭하는 소량 사용이라 충분히 준수).
//   · 대량/자동 호출 금지 — 여기서는 관리자 등록 폼의 수동 클릭에만 쓴다.
//
// 외부 fetch 를 사용하므로 Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { verifyAdminRequest } from "@/lib/authUtils";
import { getContinentByCountry } from "@/lib/continentUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Nominatim address 객체에서 도시명 후보 추출 ──────────────
// 나라마다 city/town/village 등 다른 필드에 들어오므로 우선순위대로 고른다.
function pickCity(address) {
  if (!address || typeof address !== "object") return "";
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.city_district ||
    address.county ||
    address.state ||
    ""
  );
}

export async function GET(request) {
  try {
    // ─── 로그인 관리자 검증 ────────────────────────────────────
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    // ─── 좌표 파싱/검증 ────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return Response.json(
        { ok: false, error: "lat/lng 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // ─── Nominatim 역지오코딩 호출 (무료) ──────────────────────
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
      "&accept-language=en&zoom=10&addressdetails=1";

    let res;
    try {
      res = await fetch(url, {
        headers: {
          // 이용정책상 앱을 식별하는 User-Agent 필수
          "User-Agent": "livecam-map/1.0 (admin marker reverse geocoding)",
        },
      });
    } catch (fetchError) {
      console.error("[api/geocode/reverse] Nominatim 연결 실패:", fetchError); // TODO: 배포 전 제거
      return Response.json(
        { ok: false, error: "지오코딩 서버에 연결하지 못했습니다." },
        { status: 502 }
      );
    }

    if (!res.ok) {
      return Response.json(
        { ok: false, error: `지오코딩 실패 (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const address = data && data.address ? data.address : null;

    const city = pickCity(address);
    const countryCode =
      address && address.country_code
        ? String(address.country_code).toUpperCase()
        : "";
    // 대륙은 continentUtils 매핑으로 계산(약 150개국 지원). 없으면 빈 문자열.
    const continent = countryCode ? getContinentByCountry(countryCode) : null;

    return Response.json(
      {
        ok: true,
        city,
        countryCode,
        continent: continent || "",
        // 참고용 전체 주소 표시명 (디버깅/안내용)
        displayName: data && data.display_name ? data.display_name : "",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/geocode/reverse][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "역지오코딩 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
