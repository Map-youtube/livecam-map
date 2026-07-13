// ─────────────────────────────────────────────────────────────
// 마커 CRUD API (서버 전용 Route Handler)
//
// - GET  : 마커 목록 조회 (continent / country / city / is_active 필터 지원)
// - POST : 관리자 마커 등록 (YouTube 메타데이터 자동 수집 + 대륙 자동 계산)
//
// Firestore 컬렉션: "markers"
// firebase-admin은 Node.js 런타임에서만 동작하므로 runtime을 nodejs로 명시한다.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { extractVideoId, getYoutubeInfo } from "@/lib/youtubeUtils";
import { getContinentByCountry } from "@/lib/continentUtils";
import { generatePlaceDescription } from "@/lib/aiUtils";
import { verifyAdminRequest } from "@/lib/authUtils";

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
    // all=true 이면 is_active 필터를 적용하지 않고 전체(비활성 포함)를 반환한다.
    // 관리자 목록 화면에서 비활성/재생불가 마커까지 관리하기 위해 사용한다. (Firestore만 사용, 추가 비용 없음)
    const includeAll = searchParams.get("all") === "true";

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
    //   - all=true 이면 필터를 걸지 않고 전체 반환 (비활성/재생불가 포함, 관리자용)
    //   - 파라미터가 명시되면 그 값(true/false)으로 필터
    //   - 파라미터가 없으면 is_active !== false 인 것만 (기본적으로 활성 마커)
    if (includeAll) {
      // 필터 없음 (전체 반환)
    } else if (isActiveParam === "true" || isActiveParam === "false") {
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
//   body(JSON): youtube_url, location, lat, lng, city, country, is_live, tags
//   처리 순서:
//     1) youtube_url → video_id 추출 (실패 시 400)
//     2) getYoutubeInfo 로 제목/설명/채널명/썸네일 자동 수집 (1유닛)
//     3) country → continent 자동 계산
//     4) Firestore markers 컬렉션에 저장 (기본값 포함)
//     5) 저장된 문서 id 반환
// ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    // ─── 0) 로그인 관리자 검증 (맨 앞에서 차단) ────────────────
    // 유효한 관리자 토큰이 아니면 이후 로직(유튜브 조회/AI 생성/저장)을 실행하지 않는다.
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

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
      continent: continentInput,
      is_live,
      tags,
    } = body || {};

    // ─── 특성 태그 검증 (선택적, 최대 3개) ─────────────────────
    // 지역 분류(continent/country/city)와는 별개인 평평한 태그 배열.
    let tagsArr = Array.isArray(tags) ? tags : [];
    if (tagsArr.length > 3) {
      return Response.json(
        { ok: false, error: "특성 태그는 최대 3개까지 가능합니다." },
        { status: 400 }
      );
    }
    // 문자열로 정리하고 빈 값 제거
    tagsArr = tagsArr
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0);

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

    // ─── 3) continent 결정 (관리자 선택값 우선, 없으면 국가로 자동 계산) ──
    // 폼에서 대륙을 직접 선택해 보내면 그 값을 저장하고,
    // 값이 없거나 허용 목록에 없으면 국가코드로 자동 계산한다.
    const countryCode = String(country).toUpperCase();
    const VALID_CONTINENTS = [
      "asia",
      "europe",
      "north_america",
      "south_america",
      "africa",
      "oceania",
      "middleeast",
    ];
    let continent = null;
    if (
      typeof continentInput === "string" &&
      VALID_CONTINENTS.includes(continentInput)
    ) {
      continent = continentInput;
    } else {
      continent = getContinentByCountry(countryCode);
    }
    if (!continent) {
      // 대륙 선택도 없고 국가 매핑도 없으면 등록 불가
      return Response.json(
        {
          ok: false,
          error: `대륙을 선택했거나 country '${countryCode}' 로 대륙을 결정할 수 있어야 합니다. 대륙/국가를 확인하세요.`,
        },
        { status: 400 }
      );
    }

    // ─── 3.5) AI 장소 설명 생성 (등록당 정확히 1회 호출) ───────
    // getYoutubeInfo 로 제목/설명을 확보한 직후, AI로 ko/en 소개를 생성한다.
    // ⚠️ AI 호출이 실패해도 등록 자체는 진행되어야 하므로, 실패 시 빈 값으로 저장한다.
    //    generatePlaceDescription 은 내부적으로 실패해도 throw 하지 않고 { ko:"", en:"" }를 반환하지만,
    //    만일을 대비해 try-catch 로 한 번 더 감싼다.
    let aiDescription = { ko: "", en: "" };
    let aiGenerated = false;
    try {
      aiDescription = await generatePlaceDescription({
        title: ytInfo.title,
        description: ytInfo.description,
        location: location,
        city: city || "",
        country: countryCode,
        tags: tagsArr,
      });
      // ko/en 중 하나라도 채워졌으면 생성 성공으로 간주
      aiGenerated = !!(
        aiDescription &&
        ((aiDescription.ko && aiDescription.ko.length > 0) ||
          (aiDescription.en && aiDescription.en.length > 0))
      );
    } catch (aiError) {
      console.error("[api/markers][POST] AI 설명 생성 실패:", aiError); // TODO: 배포 전 제거
      aiDescription = { ko: "", en: "" };
      aiGenerated = false;
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

      // 장소 특성 태그 (지역 분류와 별개, 최대 3개, 기본 빈 배열)
      // (옛 category 필드는 태그로 통합되어 삭제됨)
      tags: tagsArr,

      // YouTube 정보 (입력 + 자동 수집)
      youtube_url: youtube_url,
      youtube_video_id: videoId,
      youtube_title: ytInfo.title,
      youtube_description: ytInfo.description,
      youtube_channel_name: ytInfo.channelName,
      youtube_thumbnail_url: ytInfo.thumbnailUrl,
      // 채널 정보 (재생불가 점검 시 채널로 바로 이동하기 위해 저장)
      youtube_channel_id: ytInfo.channelId,
      youtube_channel_url: ytInfo.channelUrl,

      // AI 자동 생성 소개 (관리자 확정 전 상태)
      description: {
        ko: aiDescription.ko || "",
        en: aiDescription.en || "",
      },

      // 상태 기본값
      is_active: true, // 지도/목록 표시 여부 (기본 활성)
      auto_disabled: false, // 자동 비활성화 여부 (재생 불가 자동 감지 시 true)
      is_live: is_live === undefined || is_live === null ? true : Boolean(is_live),
      description_confirmed: false, // 관리자 설명 확정 여부 (AI 생성 직후 false)

      // 타임스탬프 (서버 기준)
      created_at: now,
      updated_at: now,
    };

    // ─── 5) 저장 및 문서 id 반환 ───────────────────────────────
    const docRef = await adminDb.collection(COLLECTION).add(markerData);

    // 공개 마커 캐시 무효화 → 메인 페이지/목록에 즉시 반영 (5분 대기 없이)
    try {
      revalidateTag("public-markers");
    } catch (revalError) {
      console.error("[api/markers][POST] 재검증 실패:", revalError); // TODO: 배포 전 제거
    }

    return Response.json(
      {
        ok: true,
        id: docRef.id,
        message: "마커가 등록되었습니다.",
        // AI 설명이 실제로 생성됐는지 관리자에게 알려준다 (실패해도 등록은 성공).
        ai_description_generated: aiGenerated,
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
