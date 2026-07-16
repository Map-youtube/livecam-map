// ─────────────────────────────────────────────────────────────
// 자동 마커 단건 수정/삭제 API — /api/auto-channels/markers/[id]
//   (id = youtube_video_id = auto_markers 문서 ID)
//
// - PATCH  : AI가 채운 값을 관리자가 손보는 용도. 전달된 필드만 갱신
//            (location, city, country, continent, lat, lng, tags, description, is_active).
//            country 를 바꾸면서 continent 를 안 주면 국가코드로 대륙을 자동 파생한다.
//            ⚠️ '재생확인'(verify)은 자동 채널 방식에선 의미가 없어 제공하지 않는다(item 7).
// - DELETE : 마커 1개 삭제(채널은 유지). 다음 스캔에서 여전히 라이브면 재생성될 수 있다.
//
// 관리자 전용. Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { getContinentByCountry } from "@/lib/continentUtils";
import { normalizeCityName } from "@/lib/cityUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKERS = "auto_markers";

export async function PATCH(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(MARKERS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "마커를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(
        { ok: false, error: "요청 본문이 올바르지 않습니다" },
        { status: 400 }
      );
    }

    const update = { updated_at: FieldValue.serverTimestamp() };
    if (typeof body.location === "string") update.location = body.location.trim();
    if (typeof body.city === "string")
      update.city = normalizeCityName(body.city); // 도시명 표준형으로 저장
    if (typeof body.country === "string")
      update.country = body.country.trim().toUpperCase().slice(0, 2);
    if (typeof body.continent === "string")
      update.continent = body.continent.trim();
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;

    if (body.lat !== undefined) {
      const n = Number(body.lat);
      if (!Number.isNaN(n) && n >= -90 && n <= 90) update.lat = n;
    }
    if (body.lng !== undefined) {
      const n = Number(body.lng);
      if (!Number.isNaN(n) && n >= -180 && n <= 180) update.lng = n;
    }
    if (Array.isArray(body.tags)) {
      update.tags = body.tags
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 3);
    }
    if (body.description && typeof body.description === "object") {
      update.description = {
        ko: String(body.description.ko || "").trim(),
        en: String(body.description.en || "").trim(),
      };
    }

    // country 를 바꿨는데 continent 를 명시 안 했으면 대륙을 자동 파생(트리 분류 일관성)
    if (update.country && update.continent === undefined) {
      const c = getContinentByCountry(update.country);
      if (c) update.continent = c;
    }

    await ref.update(update);

    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels/markers/[id]][PATCH] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/markers/[id]][PATCH] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, context) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return Response.json({ ok: false, error: "id가 없습니다" }, { status: 400 });
    }

    const ref = adminDb.collection(MARKERS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return Response.json(
        { ok: false, error: "마커를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    await ref.delete();

    try {
      revalidateTag("auto-markers");
      revalidateTag("public-markers");
    } catch (revalErr) {
      console.error("[api/auto-channels/markers/[id]][DELETE] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, id }, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/markers/[id]][DELETE] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
