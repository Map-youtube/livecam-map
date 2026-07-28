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

// ─────────────────────────────────────────────────────────────
// 아래 3개 분류 함수는 모두 "고정된 몇 개의 값"만 돌려준다.
// ⚠️ 이유(중요): 집계는 Firestore 문서 안의 맵 필드에 쌓인다. 만약 URL 원문이나 리퍼러
//    원문을 키로 쓰면 마커 900개·지진 페이지 등으로 키가 무한히 늘어 문서가 1MB 한도를
//    넘겨 터진다. 그래서 반드시 "분류값"으로 축약해 키 개수를 고정한다(총 38개).
//    이렇게 하면 트래픽이 아무리 늘어도 문서 크기가 커지지 않는다.
// ─────────────────────────────────────────────────────────────

// 봇 구분 — 구글봇/애드센스봇이 방문자 수를 부풀리는 문제를 걸러내기 위함.
//   (자바스크립트를 실행하는 크롤러는 이 API 를 호출하므로 사람과 섞인다)
function classifyBot(ua) {
  const s = String(ua || "").toLowerCase();
  if (!s) return "unknown";
  // 애드센스/광고 심사 크롤러
  if (s.includes("adsbot") || s.includes("mediapartners")) return "adsbot";
  // 구글 검색 크롤러
  if (s.includes("googlebot") || s.includes("google-inspectiontool")) return "googlebot";
  // 그 외 알려진 봇 패턴
  if (/bot|crawler|spider|slurp|bingpreview|headlesschrome|python-requests|curl|wget/.test(s)) {
    return "otherbot";
  }
  return "human";
}

// 방문한 페이지의 "종류" (경로 원문 대신 6가지로 축약)
function classifyPath(path) {
  const p = String(path || "").split("?")[0];
  if (!p || p === "/") return "home";
  if (p.startsWith("/marker/")) return "marker";
  if (p.startsWith("/earthquake/")) return "earthquake";
  if (p.startsWith("/channel/")) return "channel";
  // /asia, /asia/jp, /asia/jp/tokyo 같은 지역 SEO 페이지
  if (/^\/(asia|europe|north_america|south_america|africa|oceania|middleeast)(\/|$)/.test(p)) {
    return "region";
  }
  return "other";
}

// 유입 경로 (리퍼러 원문 대신 4가지로 축약)
function classifySource(referrer, host) {
  const r = String(referrer || "").toLowerCase();
  if (!r) return "direct"; // 주소 직접 입력·북마크·앱 등
  try {
    const rHost = new URL(r).hostname.toLowerCase();
    if (host && rHost === String(host).toLowerCase()) return "internal"; // 사이트 내부 이동
    if (rHost.includes("google.")) return "google";
    if (rHost.includes("naver.")) return "naver";
    return "other";
  } catch (e) {
    return "other";
  }
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

    // ─── 추가 분류값 (2026-07-28) ───────────────────────────────
    //   "방문자 수가 늘었는데 봇인지 사람인지, 어디로 들어왔는지" 를 알 수 없어서 추가.
    //   ⚠️ 비용: 아래 값들은 "기존 set() 호출에 필드만 더하는 것"이라 쓰기 횟수는 그대로 2회다.
    //      Firestore 는 문서 쓰기 1회 단위로 과금하므로 추가 요금이 없다(필드 수는 무관).
    const botKind = classifyBot(h.get("user-agent"));
    const pageKind = classifyPath(body && body.path);
    const srcKind = classifySource(body && body.referrer, h.get("host"));
    const hourKey = String(new Date().getUTCHours()).padStart(2, "0"); // UTC 시(00~23)

    if (type === "mapclick") {
      await dayRef.set(
        {
          date,
          daily_map_clicks: FieldValue.increment(1),
          // 지도클릭도 봇/사람을 구분해 둔다(사람 참여도 판단용)
          click_bots: { [botKind]: FieldValue.increment(1) },
        },
        { merge: true }
      );
      await sumRef.set(
        {
          total_map_clicks: FieldValue.increment(1),
          click_bots: { [botKind]: FieldValue.increment(1) },
        },
        { merge: true }
      );
    } else {
      const dayData = {
        date,
        daily_visitors: FieldValue.increment(1),
        countries: { [country]: FieldValue.increment(1) },
        // ↓ 새로 추가되는 집계 (키 개수가 고정이라 문서가 커지지 않음)
        bots: { [botKind]: FieldValue.increment(1) },
        pageTypes: { [pageKind]: FieldValue.increment(1) },
        sources: { [srcKind]: FieldValue.increment(1) },
        hours: { [hourKey]: FieldValue.increment(1) },
      };
      const sumData = {
        total_visitors: FieldValue.increment(1),
        countries: { [country]: FieldValue.increment(1) },
        bots: { [botKind]: FieldValue.increment(1) },
        pageTypes: { [pageKind]: FieldValue.increment(1) },
        sources: { [srcKind]: FieldValue.increment(1) },
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
