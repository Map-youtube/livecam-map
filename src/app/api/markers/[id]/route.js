// ─────────────────────────────────────────────────────────────
// 마커 단건 수정/삭제 API (서버 전용 Route Handler)
//
// - PATCH  /api/markers/[id] : 전달된 필드만 골라 수정
//     · location, city, country, category, is_live, youtube_url 만 허용
//     · youtube_url 이 "기존 저장값과 다를 때만" videos.list(1유닛) 재호출 → 비용 절약
//     · country 가 바뀐 경우에만 continent 재계산
//     · updated_at 은 항상 서버 타임스탬프로 갱신
// - DELETE /api/markers/[id] : 해당 문서 완전 삭제
//
// 존재하지 않는 id → 404.
// firebase-admin(Node 전용) 사용 → Node.js 런타임 명시.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { extractVideoId, getYoutubeInfo } from "@/lib/youtubeUtils";
import { getContinentByCountry } from "@/lib/continentUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "markers";

// ─────────────────────────────────────────────────────────────
// PATCH: 마커 수정
// ─────────────────────────────────────────────────────────────
export async function PATCH(request, context) {
  try {
    // Next.js 16 App Router: 동적 세그먼트 params 는 비동기이므로 await 한다.
    const { id } = await context.params;
    if (!id) {
      return Response.json(
        { ok: false, error: "마커 id가 필요합니다." },
        { status: 400 }
      );
    }

    // 요청 body 파싱
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return Response.json(
        { ok: false, error: "요청 본문(JSON)을 파싱하지 못했습니다." },
        { status: 400 }
      );
    }

    // 대상 문서 조회 (존재 확인)
    const docRef = adminDb.collection(COLLECTION).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "해당 id의 마커를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const existing = snap.data() || {};

    // 허용된 필드만 골라 updates 구성
    const {
      location,
      city,
      country,
      category,
      is_live,
      youtube_url,
      lat,
      lng,
      description,
      description_confirmed,
    } = body || {};
    const updates = {};

    if (typeof location === "string") updates.location = location;
    if (typeof city === "string") updates.city = city;
    if (typeof category === "string") updates.category = category;
    if (typeof is_live === "boolean") updates.is_live = is_live;

    // ─── AI 설명(ko/en) 및 확정 여부 처리 ──────────────────────
    // 단순 텍스트/플래그 저장이므로 유튜브 API 재호출과 무관하다. (아래 youtube_url 로직은 그대로)
    if (description && typeof description === "object") {
      updates.description = {
        ko: typeof description.ko === "string" ? description.ko : "",
        en: typeof description.en === "string" ? description.en : "",
      };
    }
    if (typeof description_confirmed === "boolean") {
      updates.description_confirmed = description_confirmed;
    }

    // ─── 위도/경도 처리 (지도 클릭/직접 입력으로 위치 변경 가능) ──
    // 값이 전달되면 숫자로 변환해 저장한다. (0도 유효하므로 undefined/null 만 무시)
    if (lat !== undefined && lat !== null) {
      const latNum = Number(lat);
      if (Number.isNaN(latNum)) {
        return Response.json(
          { ok: false, error: "lat(위도) 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }
      updates.lat = latNum;
    }
    if (lng !== undefined && lng !== null) {
      const lngNum = Number(lng);
      if (Number.isNaN(lngNum)) {
        return Response.json(
          { ok: false, error: "lng(경도) 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }
      updates.lng = lngNum;
    }

    // ─── country 처리: 바뀐 경우에만 continent 재계산 ──────────
    if (typeof country === "string" && country) {
      const cc = country.toUpperCase();
      updates.country = cc;
      if (cc !== existing.country) {
        const continent = getContinentByCountry(cc);
        if (!continent) {
          return Response.json(
            {
              ok: false,
              error: `country '${cc}' 에 해당하는 대륙 매핑을 찾을 수 없습니다.`,
            },
            { status: 400 }
          );
        }
        updates.continent = continent;
      }
    }

    // ─── youtube_url 처리: "실제로 바뀐 경우에만" videos.list 재호출 ──
    // (장소명/도시/국가/카테고리만 바뀐 경우엔 아래 블록을 건너뛰어 API 비용 0)
    if (
      typeof youtube_url === "string" &&
      youtube_url &&
      youtube_url !== existing.youtube_url
    ) {
      // 1) video_id 추출
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

      // 2) videos.list(1유닛)로 메타데이터 재수집
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

      // 3) 유튜브 관련 필드 일괄 갱신 (channelId/channelUrl 포함)
      updates.youtube_url = youtube_url;
      updates.youtube_video_id = videoId;
      updates.youtube_title = ytInfo.title;
      updates.youtube_description = ytInfo.description;
      updates.youtube_channel_name = ytInfo.channelName;
      updates.youtube_thumbnail_url = ytInfo.thumbnailUrl;
      updates.youtube_channel_id = ytInfo.channelId;
      updates.youtube_channel_url = ytInfo.channelUrl;
    }

    // updated_at 은 항상 갱신
    updates.updated_at = FieldValue.serverTimestamp();

    // 실제 수정 반영
    await docRef.update(updates);

    // 수정된 최신 문서 반환 (문서 id 포함)
    const updatedSnap = await docRef.get();
    return Response.json(
      {
        ok: true,
        id,
        marker: { id, ...updatedSnap.data() },
        // youtube_url 이 바뀌었는지(=videos.list 호출 여부) 참고용으로 알려준다.
        youtube_refetched: Object.prototype.hasOwnProperty.call(
          updates,
          "youtube_video_id"
        ),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers/[id]][PATCH] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "마커 수정 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE: 마커 삭제
// ─────────────────────────────────────────────────────────────
export async function DELETE(request, context) {
  try {
    const { id } = await context.params;
    if (!id) {
      return Response.json(
        { ok: false, error: "마커 id가 필요합니다." },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection(COLLECTION).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "해당 id의 마커를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 삭제 전 요약 정보 확보 (응답용)
    const data = snap.data() || {};
    const deletedSummary = { id, location: data.location || "" };

    // 완전 삭제
    await docRef.delete();

    return Response.json(
      {
        ok: true,
        id,
        deleted: deletedSummary,
        message: "마커가 삭제되었습니다.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/markers/[id]][DELETE] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "마커 삭제 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
