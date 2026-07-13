// ─────────────────────────────────────────────────────────────
// 카테고리(대분류/소분류) 일괄 이름변경 API — /api/live-channels/rename-category
//
// 카테고리는 각 채널 문서에 문자열로 저장되므로, 이름변경 = 해당 이름을 쓰는 모든
// 채널 문서를 일괄 수정하는 것.
//
// POST body:
//   { scope: "major",  major, newName }                    → 대분류 이름변경(그 대분류의 모든 채널)
//   { scope: "middle", major, middle, newName }            → 중분류 이름변경(그 대+중분류의 모든 채널)
//   { scope: "minor",  major, middle, minor, newName }     → 소분류 이름변경(그 대+중+소분류의 모든 채널)
//
// 관리자 전용. Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "live_channels";

export async function POST(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json({ ok: false, error: authResult.error || "로그인이 필요합니다" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json({ ok: false, error: "요청 본문이 올바르지 않습니다" }, { status: 400 });
    }

    const scope = body.scope;
    const major = String(body.major || "").trim();
    const middle = String(body.middle || "").trim();
    const minor = String(body.minor || "").trim();
    const newName = String(body.newName || "").trim();

    if (!newName) {
      return Response.json({ ok: false, error: "새 이름을 입력하세요" }, { status: 400 });
    }
    if (scope !== "major" && scope !== "middle" && scope !== "minor") {
      return Response.json({ ok: false, error: "scope 가 올바르지 않습니다" }, { status: 400 });
    }
    if (!major) {
      return Response.json({ ok: false, error: "대분류가 필요합니다" }, { status: 400 });
    }
    // 중분류(국가)는 3단계(방송)에서만 존재. middle 스코프는 필수,
    // minor 스코프는 선택(2단계 우주/ISS 는 middle 이 비어 있음).
    if (scope === "middle" && !middle) {
      return Response.json({ ok: false, error: "중분류가 필요합니다" }, { status: 400 });
    }
    if (scope === "minor" && !minor) {
      return Response.json({ ok: false, error: "소분류가 필요합니다" }, { status: 400 });
    }

    // 대상 채널 조회 (범위에 따라 대/중/소분류로 좁힘)
    let query = adminDb.collection(COLLECTION).where("major_category", "==", major);
    // middle 이 지정된 경우에만 중분류로 좁힌다(2단계 카테고리는 필터하지 않음).
    if ((scope === "middle" || scope === "minor") && middle) {
      query = query.where("middle_category", "==", middle);
    }
    if (scope === "minor") {
      query = query.where("minor_category", "==", minor);
    }
    const snap = await query.get();
    if (snap.empty) {
      return Response.json({ ok: true, updated: 0 }, { status: 200 });
    }

    // 일괄 업데이트 (batch)
    const batch = adminDb.batch();
    const now = FieldValue.serverTimestamp();
    for (const doc of snap.docs) {
      const update = { updated_at: now };
      if (scope === "major") update.major_category = newName;
      else if (scope === "middle") update.middle_category = newName;
      else update.minor_category = newName;
      batch.update(doc.ref, update);
    }
    await batch.commit();

    try {
      revalidateTag("live-channels");
    } catch (revalErr) {
      console.error("[api/live-channels/rename-category] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json({ ok: true, updated: snap.size }, { status: 200 });
  } catch (error) {
    console.error("[api/live-channels/rename-category][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: false, error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
