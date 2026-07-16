// ─────────────────────────────────────────────────────────────
// 지역 소개글 생성 API — /api/region-descriptions/generate
//
// 설명이 아직 없는 지역(대륙/국가/주요도시)을 Gemini 로 채워 저장한다.
//   - 한 번에 cap(기본 40)개까지만 생성 → 무료 RPD/실행시간 방어. 남으면 다시 실행.
//   - 이미 생성된 지역은 건너뛴다(1회성 비용).
//
// 인증(둘 중 하나):
//   - ?secret=REVALIDATE_SECRET (서버/크론 트리거)
//   - Authorization: Bearer <관리자 토큰> (관리자 수동 실행)
//
// ⚠️ Gemini·Firestore 서버 전용 → Node.js 런타임. 생성이 오래 걸릴 수 있어 maxDuration 확대.
// ─────────────────────────────────────────────────────────────

import { verifyAdminRequest } from "@/lib/authUtils";
import { runRegionDescriptionFill } from "@/lib/regionDescriptionRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = (searchParams.get("secret") || "").trim();
    const expected = (process.env.REVALIDATE_SECRET || "").trim();
    if (expected && secret && secret === expected) return true;
  } catch (error) {
    /* 무시하고 관리자 토큰 검사 */
  }
  const authResult = await verifyAdminRequest(request);
  return authResult.valid === true;
}

async function handle(request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ ok: false, error: "권한이 없습니다" }, { status: 401 });
  }

  // cap 은 쿼리로 조정 가능(기본 40, 최대 120)
  let cap = 40;
  try {
    const { searchParams } = new URL(request.url);
    const q = parseInt(searchParams.get("cap") || "", 10);
    if (Number.isFinite(q) && q > 0) cap = Math.min(q, 120);
  } catch (error) {
    /* 기본값 사용 */
  }

  const report = await runRegionDescriptionFill({ cap });
  return Response.json(report, { status: report.ok ? 200 : 500 });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  return handle(request);
}
