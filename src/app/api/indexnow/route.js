// ─────────────────────────────────────────────────────────────
// IndexNow 통보 API — /api/indexnow  (관리자/크론 전용)
//
// 이벤트성 페이지(지진·로켓 발사) 중 "아직 통보하지 않은 URL"만 골라 IndexNow 에 제출한다.
// 검색엔진이 사이트맵을 다시 읽으러 올 때까지 기다리지 않고 즉시 알린다.
//
// 인증(auto-channels/scan 과 동일 규칙):
//   1) ?secret=REVALIDATE_SECRET
//   2) Authorization: Bearer <CRON_SECRET>   (Vercel Cron)
//   3) Authorization: Bearer <관리자 Firebase 토큰>
//
// ⚠️ 중복 제출 방지: 이미 보낸 URL 을 live_snapshots/indexnow_submitted 문서에 기록해 두고
//    새로 생긴 것만 보낸다. 같은 URL 을 반복 제출하면 검색엔진에서 불이익을 받을 수 있다.
//    ⚠️ 이 목록은 무한히 커지면 안 된다(Firestore 1MB 한도) → 최근 MAX_REMEMBER 개만 유지한다.
//
// ⚠️ 비용: Firestore 읽기 1 + 쓰기 1 (기록 문서 1개). 마커 청크 인덱스 몇 건.
//    YouTube/AI 호출 0. IndexNow 자체도 무료.
// ⚠️ 구글은 IndexNow 를 지원하지 않는다(Bing·Yandex·Naver·Seznam 등만) — 효과는 제한적이다.
// firebase-admin(Node 전용) → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authUtils";
import { submitToIndexNow } from "@/lib/indexNow";
import { getLaunches, getNearbyForLaunch } from "@/lib/launchData";
import { getMapMarkers } from "@/lib/getMapMarkers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com"
).replace(/\/$/, "");

// 이미 통보한 URL 을 기억해 두는 문서
const STATE_COLLECTION = "live_snapshots";
const STATE_DOC = "indexnow_submitted";
// 기억할 최대 URL 수 (문서 크기 방어 — 오래된 것부터 버린다)
const MAX_REMEMBER = 500;

// 요청 권한 확인 (auto-channels/scan 과 동일 규칙)
async function isAuthorized(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = (searchParams.get("secret") || "").trim();
    const expected = (process.env.REVALIDATE_SECRET || "").trim();
    if (expected && secret && secret === expected) return true;

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

// 지금 통보 대상이 되는 URL 목록을 만든다(지진 + 로켓 발사).
async function collectCandidateUrls() {
  const urls = [];

  // ─ 지진: USGS significant 피드 (Firestore 안 읽음) ─
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      for (const f of Array.isArray(data.features) ? data.features : []) {
        if (f && f.id) urls.push(`${SITE_URL}/earthquake/${f.id}`);
      }
    }
  } catch (error) {
    console.error("[api/indexnow] 지진 목록 조회 실패:", error); // TODO: 배포 전 제거
  }

  // ─ 로켓 발사: 인근 라이브캠이 있는 발사만(색인 대상과 동일 기준) ─
  try {
    const [launches, markers] = await Promise.all([
      getLaunches(),
      getMapMarkers().catch(() => []),
    ]);
    for (const launch of Array.isArray(launches) ? launches : []) {
      // ⚠️ 각 발사는 자기 발사장 좌표로 판정한다(반복문 밖 고정값 참조 금지).
      if (getNearbyForLaunch(launch, markers).length === 0) continue;
      urls.push(`${SITE_URL}/launch/${launch.slug}`);
    }
  } catch (error) {
    console.error("[api/indexnow] 발사 목록 조회 실패:", error); // TODO: 배포 전 제거
  }

  return urls;
}

async function run() {
  const candidates = await collectCandidateUrls();
  if (candidates.length === 0) {
    return { ok: true, submitted: 0, newUrls: 0, reason: "no_candidates" };
  }

  // 이미 보낸 목록 읽기
  const ref = adminDb.collection(STATE_COLLECTION).doc(STATE_DOC);
  let sent = [];
  try {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    if (data && Array.isArray(data.urls)) sent = data.urls;
  } catch (error) {
    console.error("[api/indexnow] 기록 조회 실패:", error); // TODO: 배포 전 제거
  }

  const sentSet = new Set(sent);
  const fresh = candidates.filter((u) => !sentSet.has(u));
  if (fresh.length === 0) {
    return { ok: true, submitted: 0, newUrls: 0, reason: "all_already_sent" };
  }

  const result = await submitToIndexNow(fresh);

  // 성공한 경우에만 기록에 추가(실패하면 다음 실행에서 다시 시도하도록)
  if (result.ok) {
    try {
      // 오래된 것부터 버려 문서 크기를 제한한다.
      const merged = [...sent, ...fresh].slice(-MAX_REMEMBER);
      await ref.set(
        { urls: merged, updated_at: new Date() },
        { merge: true }
      );
    } catch (error) {
      console.error("[api/indexnow] 기록 저장 실패:", error); // TODO: 배포 전 제거
    }
  }

  return {
    ok: result.ok,
    submitted: result.submitted || 0,
    newUrls: fresh.length,
    skipped: result.skipped === true,
    reason: result.reason || null,
    status: result.status || null,
  };
}

export async function GET(request) {
  return handle(request);
}
export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  try {
    if (!(await isAuthorized(request))) {
      return Response.json(
        { ok: false, error: "권한이 없습니다" },
        { status: 401 }
      );
    }
    const result = await run();
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[api/indexnow] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "IndexNow 통보 중 오류: " + error.message },
      { status: 500 }
    );
  }
}
