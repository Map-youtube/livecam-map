// ─────────────────────────────────────────────────────────────
// 지역 자동 채널 전체 스캔 API — /api/auto-channels/scan
//
// 등록된 모든 활성 auto_channels 를 스캔해:
//   1) 현재 라이브 영상을 전역 50-ID 배칭으로 감지(getLiveVideos)
//   2) 새 영상만 Gemini 로 채워 auto_markers 생성(일일 상한 DAILY_AI_CAP 까지)
//   3) 종료된 영상 숨김 / last_seen 갱신
//   4) 90일 이상 무영상 채널 자동 삭제
//   5) 공개 캐시(auto-markers, public-markers) 무효화 → 지도/트리/정적페이지 갱신
//
// 트리거:
//   - Vercel Cron (하루 1회 등, vercel.json). 크론은 GET 으로 호출한다.
//   - 관리자 "지금 스캔" 버튼(관리자 토큰 첨부).
//
// 인증(둘 중 하나):
//   - ?secret=REVALIDATE_SECRET  (크론/서버 트리거용. Vercel Cron 은 이 쿼리로 호출하게 설정)
//   - 또는 Authorization: Bearer <관리자 토큰>  (관리자 수동 실행)
//
// ⚠️ YouTube videos.list·Gemini·Firestore 모두 서버 전용 → Node.js 런타임.
// ⚠️ 비용 방어: 새 영상에만, 그리고 하루 DAILY_AI_CAP 까지만 Gemini 호출. 초과분은 다음 스캔.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";
import { scanChannels, cleanupStaleChannels } from "@/lib/autoMarkerScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 스캔은 채널 스크래핑 + AI 호출로 시간이 걸릴 수 있어 최대 실행시간을 늘린다.
export const maxDuration = 300;

const COLLECTION = "auto_channels";
// 하루 Gemini 호출 상한(무료 RPD 방어). 초과분은 다음 스캔에서 처리된다.
const DAILY_AI_CAP = 500;

function toPlain(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

// 요청이 스캔을 실행할 권한이 있는지
//   1) ?secret=REVALIDATE_SECRET (서버/수동 트리거)
//   2) Authorization: Bearer <CRON_SECRET> (Vercel Cron 이 자동으로 붙이는 헤더)
//   3) Authorization: Bearer <관리자 Firebase 토큰> (관리자 수동 실행)
async function isAuthorized(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = (searchParams.get("secret") || "").trim();
    const expected = (process.env.REVALIDATE_SECRET || "").trim();
    if (expected && secret && secret === expected) return true;

    // Vercel Cron: CRON_SECRET 이 설정돼 있으면 Bearer 로 그 값을 보낸다.
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    const authHeader =
      (request.headers && request.headers.get("authorization")) || "";
    if (
      cronSecret &&
      authHeader.startsWith("Bearer ") &&
      authHeader.slice(7).trim() === cronSecret
    ) {
      return true;
    }
  } catch (error) {
    // 무시하고 관리자 토큰 검사로 진행
  }
  const authResult = await verifyAdminRequest(request);
  return authResult.valid === true;
}

async function runScan() {
  // 활성 채널만
  const snapshot = await adminDb
    .collection(COLLECTION)
    .where("is_active", "!=", false)
    .get();
  const channels = snapshot.docs.map((d) => {
    const data = d.data() || {};
    const out = { id: d.id };
    for (const [k, v] of Object.entries(data)) out[k] = toPlain(v);
    return out;
  });

  // 스캔 + 90일 정리
  const scan = await scanChannels(channels, { aiCap: DAILY_AI_CAP });
  const cleanup = await cleanupStaleChannels(90);

  // 공개 캐시 무효화
  try {
    revalidateTag("auto-markers");
    revalidateTag("public-markers");
  } catch (revalErr) {
    console.error("[api/auto-channels/scan] 재검증 실패:", revalErr); // TODO: 배포 전 제거
  }

  return { ok: true, scannedChannels: channels.length, scan, cleanup };
}

// Vercel Cron 은 GET 으로 호출
export async function GET(request) {
  try {
    if (!(await isAuthorized(request))) {
      return Response.json(
        { ok: false, error: "권한이 없습니다" },
        { status: 401 }
      );
    }
    const result = await runScan();
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[api/auto-channels/scan][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "스캔 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// 관리자 "지금 스캔" 버튼용 (POST)
export async function POST(request) {
  return GET(request);
}
