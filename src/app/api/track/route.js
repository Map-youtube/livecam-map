// ─────────────────────────────────────────────────────────────
// 방문 추적 비콘 API — /api/track  (공개, 인증 없음)
//
// 방문자/지도클릭을 analytics 컬렉션에 집계한다(대시보드가 이 데이터를 읽음).
//   - analytics/{YYYY-MM-DD} : daily_visitors, daily_map_clicks, countries{}, cities{}
//   - analytics/_summary      : total_visitors, total_map_clicks, countries{}, cities{}(누적)
//
// 국가/도시는 Vercel 이 붙여주는 지역 헤더에서 읽는다(추가 비용 0):
//   x-vercel-ip-country, x-vercel-ip-city (localhost/미배포 환경엔 없음 → ZZ/미기록).
//
// ⚠️ 쓰기량: 방문 1회당 문서 2개(일별+요약) 증가. 소규모 트래픽엔 무료 한도 내(하루 수백 쓰기).
// ⚠️ 실패해도 사용자 화면에 영향 없도록 항상 조용히 처리(ok:false 200).
// firebase-admin(Node 전용) → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 오늘 날짜(UTC, YYYY-MM-DD)
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Firestore 맵 키에 못 쓰는 문자 제거( . ~ * / [ ] ) + 길이 제한
function sanitizeKey(s) {
  return String(s || "")
    .replace(/[.~*/[\]]/g, "")
    .trim()
    .slice(0, 60);
}

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }
    const type = body && body.type === "mapclick" ? "mapclick" : "visit";

    const h = request.headers;
    const country =
      sanitizeKey((h.get("x-vercel-ip-country") || "").toUpperCase()) || "ZZ";
    let city = "";
    try {
      city = sanitizeKey(decodeURIComponent(h.get("x-vercel-ip-city") || ""));
    } catch (e) {
      city = sanitizeKey(h.get("x-vercel-ip-city") || "");
    }

    const date = todayStr();
    const dayRef = adminDb.collection("analytics").doc(date);
    const sumRef = adminDb.collection("analytics").doc("_summary");

    if (type === "mapclick") {
      await dayRef.set(
        { date, daily_map_clicks: FieldValue.increment(1) },
        { merge: true }
      );
      await sumRef.set(
        { total_map_clicks: FieldValue.increment(1) },
        { merge: true }
      );
    } else {
      const dayData = {
        date,
        daily_visitors: FieldValue.increment(1),
        countries: { [country]: FieldValue.increment(1) },
      };
      const sumData = {
        total_visitors: FieldValue.increment(1),
        countries: { [country]: FieldValue.increment(1) },
      };
      if (city) {
        dayData.cities = { [city]: FieldValue.increment(1) };
        sumData.cities = { [city]: FieldValue.increment(1) };
      }
      await dayRef.set(dayData, { merge: true });
      await sumRef.set(sumData, { merge: true });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[api/track] 에러:", error); // TODO: 배포 전 제거
    // 실패해도 화면엔 영향 없게 200 으로 조용히 반환
    return Response.json({ ok: false }, { status: 200 });
  }
}
