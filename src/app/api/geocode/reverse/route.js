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

// ─── 영토(자치령) 이름 → 실제 ISO alpha-2 코드 보정 ─────────────
// Nominatim 은 퀴라소/아루바/프랑스령 등 자치령의 country_code 를 "부모국"(nl/fr 등)으로
// 돌려주면서 country 이름에는 실제 영토명("Curacao" 등)을 넣는다. 그 이름을 실제 코드로 보정한다.
// (국가 이름은 accept-language=en 기준 영문. 소문자/공백 정규화 후 비교)
const TERRITORY_NAME_TO_CODE = {
  // 네덜란드령 (위치상 남미 ABC / 북미 카리브)
  curacao: "CW",
  aruba: "AW",
  bonaire: "BQ",
  "sint eustatius": "BQ",
  saba: "BQ",
  "sint maarten": "SX",
  // 프랑스령
  martinique: "MQ",
  guadeloupe: "GP",
  reunion: "RE",
  mayotte: "YT",
  "french guiana": "GF",
  guyane: "GF",
  "french polynesia": "PF",
  "new caledonia": "NC",
  "saint barthelemy": "BL",
  "saint martin": "MF",
  "wallis and futuna": "WF",
  // 영국령
  bermuda: "BM",
  "cayman islands": "KY",
  "british virgin islands": "VG",
  "turks and caicos islands": "TC",
  anguilla: "AI",
  gibraltar: "GI",
  "isle of man": "IM",
  jersey: "JE",
  guernsey: "GG",
  "falkland islands": "FK",
  "pitcairn islands": "PN",
  pitcairn: "PN",
  // 미국령
  "puerto rico": "PR",
  guam: "GU",
  "united states virgin islands": "VI",
  "u.s. virgin islands": "VI",
  "american samoa": "AS",
  "northern mariana islands": "MP",
  // 덴마크령
  greenland: "GL",
  "faroe islands": "FO",
  // 뉴질랜드령
  "cook islands": "CK",
  niue: "NU",
  tokelau: "TK",
  // 호주령
  "norfolk island": "NF",
  // 기타
  "western sahara": "EH",
  "hong kong": "HK",
  macau: "MO",
  macao: "MO",
};

// 영토 이름 정규화(소문자 + 공백 축약 + 흔한 발음부호 제거)
function normTerritory(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 발음부호 제거(é→e, ç→c 등)
    .replace(/\s+/g, " ")
    .trim();
}

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
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
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
    let countryCode =
      address && address.country_code
        ? String(address.country_code).toUpperCase()
        : "";
    // ★ 영토 보정: Nominatim 이 자치령(퀴라소/아루바/프랑스령 등)의 country_code 를 부모국으로
    //   돌려주는 경우, country 이름으로 실제 영토 코드를 찾아 덮어쓴다(위치 기반 대륙이 되도록).
    const territoryCode =
      address && address.country
        ? TERRITORY_NAME_TO_CODE[normTerritory(address.country)]
        : null;
    if (territoryCode) countryCode = territoryCode;
    // 대륙은 continentUtils 매핑으로 계산. 없으면 빈 문자열.
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
