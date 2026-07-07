// ─────────────────────────────────────────────────────────────
// 마커 CRUD API (서버 전용 Route Handler)
//
// - GET  : 마커 목록 조회 (continent / country / city / is_active 필터 지원)
// - POST : 관리자 마커 등록 (YouTube 메타데이터 자동 수집 + 대륙 자동 계산)
//
// Firestore 컬렉션: "markers"
// firebase-admin은 Node.js 런타임에서만 동작하므로 runtime을 nodejs로 명시한다.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { extractVideoId, getYoutubeInfo } from "@/lib/youtubeUtils";
import { getContinentByCountry } from "@/lib/continentUtils";

// firebase-admin(Node 전용) 사용 → Edge 런타임 금지, Node.js 런타임 명시
export const runtime = "nodejs";
// Firestore 실시간 데이터를 다루므로 정적 캐시하지 않고 매 요청 실행
export const dynamic = "force-dynamic";

// Firestore 컬렉션명 상수
const COLLECTION = "markers";

// ─────────────────────────────────────────────────────────────
// GET: 마커 목록 조회
//   쿼리 파라미터:
//     continent : 대륙 필터 (asia | europe | ...)
//     country   : 국가코드 필터 (JP, FR ...)
//     city      : 도시명 필터
//     is_active : "true" | "false" (문자열)
//   파라미터가 없으면 is_active !== false 인 마커 전체 반환.
//   각 마커 객체에는 Firestore 문서 id를 포함한다.
// ─────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    // 요청 URL에서 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const continent = searchParams.get("continent");
    const country = searchParams.get("country");
    const city = searchParams.get("city");
    const isActiveParam = searchParams.get("is_active");

    // 기본 컬렉션 참조에서 쿼리 빌드 시작
    let query = adminDb.collection(COLLECTION);

    // ─── 필터 적용 ─────────────────────────────────────────────
    // continent / country / city 는 값이 있을 때만 등호 필터 추가
    if (continent) {
      query = query.where("continent", "==", continent);
    }
    if (country) {
      // 국가코드는 대문자로 저장되므로 대문자로 정규화하여 비교
      query = query.where("country", "==", country.toUpperCase());
    }
    if (city) {
      query = query.where("city", "==", city);
    }

    // is_active 처리:
    //   - 파라미터가 명시되면 그 값(true/false)으로 필터
    //   - 파라미터가 없으면 is_active !== false 인 것만 (기본적으로 활성 마커)
    if (isActiveParam === "true" || isActiveParam === "false") {
      const boolValue = isActiveParam === "true";
      query = query.where("is_active", "==", boolValue);
    } else {
      // is_active != false → 활성 마커. (필드가 true 인 문서만 반환)
      query = query.where("is_active", "!=", false);
    }

    // 쿼리 실행
    const snapshot = await query.get();

    // 문서 배열로 변환 (각 항목에 문서 id 포함)
    const markers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 정상 응답
    return Response.json(
      { ok: true, count: markers.length, markers },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "마커 목록을 불러오지 못했습니다: " + error.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST: 관리자 마커 등록
//   body(JSON): youtube_url, location, lat, lng, city, country, category, is_live
//   처리 순서:
//     1) youtube_url → video_id 추출 (실패 시 400)
//     2) getYoutubeInfo 로 제목/설명/채널명/썸네일 자동 수집 (1유닛)
//     3) country → continent 자동 계산
//     4) Firestore markers 컬렉션에 저장 (기본값 포함)
//     5) 저장된 문서 id 반환
// ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    // ─── 요청 body 파싱 ────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return Response.json(
        { ok: false, error: "요청 본문(JSON)을 파싱하지 못했습니다." },
        { status: 400 }
      );
    }

    const {
      youtube_url,
      location,
      lat,
      lng,
      city,
      country,
      category,
      is_live,
    } = body || {};

    // ─── 필수값 검증 ───────────────────────────────────────────
    if (!youtube_url) {
      return Response.json(
        { ok: false, error: "youtube_url 은 필수 항목입니다." },
        { status: 400 }
      );
    }
    if (!location) {
      return Response.json(
        { ok: false, error: "location(장소명) 은 필수 항목입니다." },
        { status: 400 }
      );
    }
    // 위경도는 숫자여야 함 (0도 유효하므로 undefined/null/NaN만 거른다)
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat === undefined || lat === null || Number.isNaN(latNum)) {
      return Response.json(
        { ok: false, error: "lat(위도) 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    if (lng === undefined || lng === null || Number.isNaN(lngNum)) {
      return Response.json(
        { ok: false, error: "lng(경도) 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    if (!country) {
      return Response.json(
        { ok: false, error: "country(국가코드) 는 필수 항목입니다." },
        { status: 400 }
      );
    }

    // ─── 1) video_id 추출 ──────────────────────────────────────
    const videoId = extractVideoId(youtube_url);
    if (!videoId) {
      return Response.json(
        {
          ok: false,
          error:
            "youtube_url 에서 유효한 video_id를 추출하지 못했습니다. URL 형식을 확인하세요.",
        },
        { status: 400 }
      );
    }

    // ─── 2) YouTube 메타데이터 자동 수집 (1유닛) ───────────────
    // API 호출 실패는 서버/외부 원인이므로 500으로 처리
    let ytInfo;
    try {
      ytInfo = await getYoutubeInfo(videoId);
    } catch (ytError) {
      return Response.json(
        {
          ok: false,
          error: "YouTube 정보 수집에 실패했습니다: " + ytError.message,
        },
        { status: 500 }
      );
    }

    // ─── 3) country → continent 자동 계산 ──────────────────────
    const countryCode = String(country).toUpperCase();
    const continent = getContinentByCountry(countryCode);
    if (!continent) {
      // 매핑에 없는 국가코드는 continent를 만들 수 없어 등록 불가
      return Response.json(
        {
          ok: false,
          error: `country '${countryCode}' 에 해당하는 대륙 매핑을 찾을 수 없습니다. 국가코드를 확인하세요.`,
        },
        { status: 400 }
      );
    }

    // ─── 4) Firestore 저장 문서 구성 ───────────────────────────
    const now = FieldValue.serverTimestamp();
    const markerData = {
      // 위치 정보
      lat: latNum,
      lng: lngNum,
      location: location,
      city: city || "",
      country: countryCode,
      continent: continent,

      // 분류 (미지정 시 other)
      category: category || "other",

      // YouTube 정보 (입력 + 자동 수집)
      youtube_url: youtube_url,
      youtube_video_id: videoId,
      youtube_title: ytInfo.title,
      youtube_description: ytInfo.description,
      youtube_channel_name: ytInfo.channelName,
      youtube_thumbnail_url: ytInfo.thumbnailUrl,

      // 상태 기본값
      is_active: true, // 지도/목록 표시 여부 (기본 활성)
      auto_disabled: false, // 자동 비활성화 여부 (재생 불가 자동 감지 시 true)
      is_live: is_live === undefined || is_live === null ? true : Boolean(is_live),
      description_confirmed: false, // 관리자 설명 확정 여부

      // 타임스탬프 (서버 기준)
      created_at: now,
      updated_at: now,
    };

    // ─── 5) 저장 및 문서 id 반환 ───────────────────────────────
    const docRef = await adminDb.collection(COLLECTION).add(markerData);

    return Response.json(
      {
        ok: true,
        id: docRef.id,
        message: "마커가 등록되었습니다.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/markers][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "마커 등록 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
