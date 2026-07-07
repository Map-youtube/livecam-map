// ─────────────────────────────────────────────────────────────
// 태그 목록 조회/추가 API (서버 전용 Route Handler)
//
// - GET  : tags 컬렉션의 모든 태그를 이름 가나다순으로 반환 [{ id, name }, ...] (로그인 불필요)
// - POST : 새 태그 추가 (관리자 전용, verifyAdminRequest 로 보호)
//          같은 이름(대소문자/공백 무시)의 태그가 이미 있으면 새로 만들지 않고 기존 것 반환.
//
// Firestore 컬렉션: "tags" (문서: { name, created_at })
// firebase-admin(Node 전용) → Node.js 런타임 명시.
// ⚠️ 유튜브/AI API 호출 없음 (Firestore 만 사용) → 추가 비용 없음.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "tags";

// 이름 정규화: 앞뒤 공백 제거 + 소문자 + 내부 공백 제거 (중복 비교용)
function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

// ─────────────────────────────────────────────────────────────
// GET: 태그 전체 조회 (가나다순)
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const snapshot = await adminDb.collection(COLLECTION).get();
    const tags = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: (doc.data() && doc.data().name) || "",
    }));

    // 이름 기준 한국어 가나다순 정렬
    tags.sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return Response.json({ ok: true, tags }, { status: 200 });
  } catch (error) {
    console.error("[api/tags][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "태그 목록을 불러오지 못했습니다: " + error.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST: 새 태그 추가 (관리자 전용)
// ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    // ─── 0) 로그인 관리자 검증 ─────────────────────────────────
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      return Response.json(
        { ok: false, error: "로그인이 필요합니다" },
        { status: 401 }
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

    const name = body && typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json(
        { ok: false, error: "태그 이름을 입력하세요." },
        { status: 400 }
      );
    }

    // ─── 중복 확인 (대소문자/공백 무시) ────────────────────────
    // tags 컬렉션은 규모가 작으므로 전체를 읽어 정규화 비교한다. (Firestore 만 사용)
    const target = normalizeName(name);
    const snapshot = await adminDb.collection(COLLECTION).get();
    const existing = snapshot.docs.find(
      (doc) => normalizeName(doc.data() && doc.data().name) === target
    );

    // 이미 있으면 새로 만들지 않고 기존 것을 반환
    if (existing) {
      return Response.json(
        {
          ok: true,
          tag: { id: existing.id, name: existing.data().name },
          created: false,
        },
        { status: 200 }
      );
    }

    // 없으면 새로 생성
    const docRef = await adminDb.collection(COLLECTION).add({
      name,
      created_at: FieldValue.serverTimestamp(),
    });

    return Response.json(
      {
        ok: true,
        tag: { id: docRef.id, name },
        created: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/tags][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "태그 추가 중 오류가 발생했습니다: " + error.message },
      { status: 500 }
    );
  }
}
