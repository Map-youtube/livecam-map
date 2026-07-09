// ─────────────────────────────────────────────────────────────
// ISS TLE 프록시 API — 궤적선 계산 전용
//
// GET /api/iss/tle
//   - Celestrak(https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE) 를 서버에서 호출
//   - 텍스트(TLE) 파싱 → { name, line1, line2, fetchedAt, stale } JSON 반환
//   - 캐싱: { next: { revalidate: 21600 } } (6시간) — Celestrak 과호출/차단 예방
//   - 성공 시 Firestore system > iss_tle 문서에 { line1, line2, name, fetchedAt } 덮어쓰기 보관
//   - 실패 시 Firestore 보관본을 읽어 { stale: true } 로 반환.
//       · 단, 보관본 fetchedAt 이 7일 이상 경과했으면 사용하지 않고 503
//       · 보관본도 없으면 503
//
// firebase-admin(Node 전용) 사용 → Node.js 런타임 + force-dynamic.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TLE_URL =
  "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
const SYSTEM_COLLECTION = "system";
const TLE_DOC_ID = "iss_tle";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TLE_REVALIDATE_SEC = 21600; // 6시간

// ─── TLE 텍스트 파싱 ─────────────────────────────────────────
// 표준 TLE 는 3줄: name / "1 ..."(line1) / "2 ..."(line2)
function parseTle(text) {
  try {
    if (!text || typeof text !== "string") return null;
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let name = "ISS (ZARYA)";
    let line1 = null;
    let line2 = null;

    for (const l of lines) {
      if (l.startsWith("1 ") && !line1) {
        line1 = l;
      } else if (l.startsWith("2 ") && !line2) {
        line2 = l;
      } else if (!l.startsWith("1 ") && !l.startsWith("2 ")) {
        name = l; // 이름 줄 (보통 첫 줄)
      }
    }

    if (line1 && line2) return { name, line1, line2 };
    return null;
  } catch (error) {
    console.error("[api/iss/tle] TLE 파싱 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

export async function GET() {
  try {
    // ─── 1) Celestrak 호출 (6시간 캐시) ───────────────────────
    let fresh = null;
    try {
      const res = await fetch(TLE_URL, {
        next: { revalidate: TLE_REVALIDATE_SEC },
      });
      if (res.ok) {
        const text = await res.text();
        fresh = parseTle(text);
      }
    } catch (fetchError) {
      // 네트워크 오류 → 아래 보관본 폴백으로
      fresh = null;
    }

    const now = Date.now();

    // ─── 2) 성공 → Firestore 보관 후 반환 ─────────────────────
    if (fresh) {
      try {
        await adminDb
          .collection(SYSTEM_COLLECTION)
          .doc(TLE_DOC_ID)
          .set({
            name: fresh.name,
            line1: fresh.line1,
            line2: fresh.line2,
            fetchedAt: now, // epoch ms (7일 경과 판단용)
            updated_at: FieldValue.serverTimestamp(),
          });
      } catch (saveError) {
        // 보관 실패해도 응답 자체는 정상 반환
        console.error("[api/iss/tle] Firestore 보관 실패:", saveError); // TODO: 배포 전 제거
      }

      return Response.json(
        {
          ok: true,
          name: fresh.name,
          line1: fresh.line1,
          line2: fresh.line2,
          fetchedAt: now,
          stale: false,
        },
        { status: 200 }
      );
    }

    // ─── 3) 실패 → Firestore 보관본 폴백 ──────────────────────
    try {
      const snap = await adminDb
        .collection(SYSTEM_COLLECTION)
        .doc(TLE_DOC_ID)
        .get();
      if (snap.exists) {
        const d = snap.data() || {};
        const fetchedAt = typeof d.fetchedAt === "number" ? d.fetchedAt : 0;
        // 보관본이 유효하고 7일 이내면 사용
        if (d.line1 && d.line2 && fetchedAt && now - fetchedAt < SEVEN_DAYS_MS) {
          return Response.json(
            {
              ok: true,
              name: d.name || "ISS (ZARYA)",
              line1: d.line1,
              line2: d.line2,
              fetchedAt,
              stale: true,
            },
            { status: 200 }
          );
        }
      }
    } catch (readError) {
      console.error("[api/iss/tle] Firestore 보관본 읽기 실패:", readError); // TODO: 배포 전 제거
    }

    // ─── 4) 보관본도 없음/7일 경과 → 503 ─────────────────────
    return Response.json(
      { ok: false, error: "TLE 데이터를 가져오지 못했습니다." },
      { status: 503 }
    );
  } catch (error) {
    console.error("[api/iss/tle][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "TLE 조회 중 오류가 발생했습니다: " + error.message },
      { status: 503 }
    );
  }
}
