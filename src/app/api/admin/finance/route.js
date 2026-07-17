// ─────────────────────────────────────────────────────────────
// 관리자 재무 수동입력 API — /api/admin/finance (관리자 전용)
//
// 서버 비용(Vercel/Firebase)·애드센스 수입은 외부 데이터라 자동 수집이 안 된다.
// (Vercel 요금 API / GCP 결제 내보내기 / AdSense Management API 연동은 별도 큰 작업)
// → 그때까지 관리자가 "매월 실제 금액"을 직접 입력해 대시보드에 반영한다.
//
// 저장 위치: finance/{YYYY-MM}
//   { month, vercel_usd, firebase_usd, adsense_usd, updated_at }
//
// GET  : 입력된 월 목록 반환(관리자 폼 초기값/표)
// POST : 특정 월(YYYY-MM)의 금액 upsert (set merge). 음수/비정상 값은 0 처리.
//
// ⚠️ 금액은 "월 단위 실제 청구/수입액"(USD). 대시보드는 이 값을 그대로 표시한다.
// ⚠️ 관리자 인증 필수(verifyAdminRequest). 일반 사용자 접근 불가.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

// 숫자 정규화: 유한한 0 이상 숫자만 통과(그 외 0). 소수 둘째자리까지.
function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function GET(request) {
  try {
    const auth = await verifyAdminRequest(request);
    if (!auth.valid) {
      return Response.json(
        { ok: false, error: auth.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    const snap = await adminDb.collection("finance").get();
    const months = [];
    for (const d of snap.docs) {
      if (!MONTH_RE.test(d.id)) continue;
      const data = d.data() || {};
      months.push({
        month: d.id,
        vercel: money(data.vercel_usd),
        firebase: money(data.firebase_usd),
        adsense: money(data.adsense_usd),
      });
    }
    months.sort((a, b) => a.month.localeCompare(b.month));

    return Response.json({ ok: true, months }, { status: 200 });
  } catch (error) {
    console.error("[api/admin/finance] GET 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "재무 데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAdminRequest(request);
    if (!auth.valid) {
      return Response.json(
        { ok: false, error: auth.error || "로그인이 필요합니다" },
        { status: 401 }
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch (parseError) {
      return Response.json(
        { ok: false, error: "요청 본문(JSON)이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const month = String(body.month || "").trim();
    if (!MONTH_RE.test(month)) {
      return Response.json(
        { ok: false, error: "month 는 YYYY-MM 형식이어야 합니다." },
        { status: 400 }
      );
    }

    const payload = {
      month,
      vercel_usd: money(body.vercel),
      firebase_usd: money(body.firebase),
      adsense_usd: money(body.adsense),
      updated_at: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("finance").doc(month).set(payload, { merge: true });

    return Response.json(
      {
        ok: true,
        month: {
          month,
          vercel: payload.vercel_usd,
          firebase: payload.firebase_usd,
          adsense: payload.adsense_usd,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/admin/finance] POST 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "재무 데이터 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
