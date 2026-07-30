// ─────────────────────────────────────────────────────────────
// 태풍(열대저기압) API — src/app/api/typhoons/route.js
//
// GET /api/typhoons
//   전 지구 활성 태풍의 "현재 위치 + 강도 + 예상경로 + 사분면별 풍속반경"을 반환한다.
//
// 데이터 출처 (전부 무료 · API 키 불필요 · 공식 기관):
//   1) NHC  (미국 국립허리케인센터) — 대서양 · 동태평양
//        https://www.nhc.noaa.gov/CurrentStorms.json → 각 폭풍의 forecastAdvisory(TCM) 텍스트
//   2) JTWC (미해군 합동태풍경보센터) — 서태평양(한국·일본) · 인도양 · 남반구
//        RSS 로 현재 경보 제품(.txt) 링크를 찾아 각각 파싱
//        ⚠️ 제품 URL 을 추측해서 만들면 403 이 난다(실측). 반드시 RSS 에 실린 링크만 사용한다.
//   3) NASA EONET — "과거 경로"(관측 이력) 보강용. 태풍의 지난 궤적을 선으로 그리는 데 쓴다.
//        ⚠️ EONET 에는 미래(예보) 좌표가 없다(실측 확인) → 예상경로는 1)2)에서만 온다.
//
// ⚠️ 여기서 나가는 예상경로/풍속반경은 전부 기관 발표 원문값이다. 우리가 추정·보간하지 않는다.
//    (유일한 추정은 "ddhhmmZ" 표기에 연·월이 없어 월을 보정하는 부분 — typhoonUtils 주석 참고)
//
// ⚠️ 비용: 외부 공개 자료만 사용. Firestore·YouTube·AI 호출 0. 캐시 30분으로 기관 서버 부담도 낮춘다.
// ⚠️ 어떤 출처가 실패해도 나머지로 응답한다(부분 실패 허용). 전부 실패하면 빈 배열.
//
// 외부 fetch → Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import {
  parseNhcAdvisory,
  parseJtwcWarning,
  typhoonCategory,
} from "@/lib/typhoonUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기관 서버 부담을 줄이고 응답을 빠르게 하기 위한 캐시 (예보는 6시간마다 갱신되므로 30분이면 충분히 신선)
const CACHE_SECONDS = 30 * 60;

// 유튜브와 마찬가지로 기본 UA 는 차단될 수 있어 브라우저 UA 를 명시한다.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const NHC_LIST = "https://www.nhc.noaa.gov/CurrentStorms.json";
const JTWC_RSS = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss?tropics";
const EONET_STORMS =
  "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&category=severeStorms";

// 과거경로(EONET)와 예보(NHC/JTWC)를 "같은 태풍"으로 볼 최대 거리(km)
const MATCH_MAX_KM = 500;

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    return null;
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}

// NHC 는 등급을 약어 코드로 준다(HU/TS/TD…). JTWC 의 풀텍스트 표기와 통일해 화면에서 같은
// 어휘로 보이게 한다. 모르는 코드는 원문 그대로 통과시킨다(임의로 지어내지 않는다).
const NHC_CLASS = {
  HU: "HURRICANE",
  TS: "TROPICAL STORM",
  TD: "TROPICAL DEPRESSION",
  STS: "SUBTROPICAL STORM",
  STD: "SUBTROPICAL DEPRESSION",
  PTC: "POST-TROPICAL CYCLONE",
  PT: "POST-TROPICAL CYCLONE",
  DB: "DISTURBANCE",
  LO: "LOW",
};

// 두 좌표 사이 거리(km) — 과거경로 매칭용
function distanceKm(lat1, lng1, lat2, lng2) {
  try {
    const R = 6371;
    const toRad = (d) => (Number(d) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  } catch (error) {
    return Infinity;
  }
}

// ─── NHC: 대서양 · 동태평양 ───────────────────────────────────
async function collectNhc() {
  const out = [];
  try {
    const data = await fetchJson(NHC_LIST);
    const storms = data && Array.isArray(data.activeStorms) ? data.activeStorms : [];

    // 각 폭풍의 예보전문을 병렬로 가져온다(보통 0~5개라 부담 없음).
    const jobs = storms.map(async (s) => {
      try {
        const advUrl = s && s.forecastAdvisory && s.forecastAdvisory.url;
        if (!advUrl) return null;
        const text = await fetchText(advUrl);
        if (!text) return null;

        const parsed = parseNhcAdvisory(text);
        if (!parsed.current) return null;

        return {
          id: `nhc-${s.id || s.binNumber || s.name}`,
          name: String(s.name || "").trim(),
          basin: String(s.id || "").slice(0, 2).toUpperCase() || "AL",
          source: "NHC",
          sourceName: "NOAA National Hurricane Center",
          sourceUrl: advUrl,
          classification:
            NHC_CLASS[String(s.classification || "").toUpperCase()] ||
            String(s.classification || ""),
          lat: parsed.current.lat,
          lng: parsed.current.lng,
          maxWindKt: parsed.current.maxWindKt,
          gustKt: parsed.current.gustKt ?? null,
          movementDeg: parsed.current.movementDeg ?? null,
          movementKt: parsed.current.movementKt ?? null,
          advisoryAt: parsed.current.validAt || null,
          currentRadii: parsed.current.radii || {},
          forecast: parsed.forecast || [],
          observedTrack: [], // 아래에서 EONET 으로 보강
        };
      } catch (innerError) {
        return null;
      }
    });

    for (const r of await Promise.all(jobs)) {
      if (r) out.push(r);
    }
  } catch (error) {
    console.error("[api/typhoons] NHC 수집 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// ─── JTWC: 서태평양 · 인도양 · 남반구 ────────────────────────
async function collectJtwc() {
  const out = [];
  try {
    const rss = await fetchText(JTWC_RSS);
    if (!rss) return out;

    // ⚠️ RSS 에 실제로 실린 제품 링크만 사용한다(URL 추측 금지 — 실측에서 403).
    //    형식 예: https://www.metoc.navy.mil/jtwc/products/wp1226web.txt
    const links = [
      ...new Set(
        [...rss.matchAll(/https?:\/\/[^\s"'<>]*?\/products\/[a-z]{2}\d{4}web\.txt/gi)].map(
          (m) => m[0]
        )
      ),
    ];

    const jobs = links.map(async (url) => {
      try {
        const text = await fetchText(url);
        if (!text) return null;
        const parsed = parseJtwcWarning(text);
        if (!parsed.current) return null;

        // 파일명에서 해역/번호 추출 (wp1226web.txt → basin WP, 12번, 2026년)
        const fm = url.match(/\/products\/([a-z]{2})(\d{2})(\d{2})web\.txt/i);
        const basin = fm ? fm[1].toUpperCase() : "";
        const stormNo = fm ? fm[2] : "";

        // 태풍 이름/등급: 본문 첫머리 "SUPER TYPHOON 12W (DOLPHIN) WARNING NR 013" 형태.
        // ⚠️ 등급을 그냥 전체 본문에서 찾으면 발신 기관명 "JOINT TYPHOON WARNING CENTER" 의
        //    TYPHOON 이 먼저 걸려, 30kt 열대저기압까지 "TYPHOON" 으로 표기된다(2026-07-30 실측 버그).
        //    → 반드시 "등급 + 폭풍번호(12W)" 형태로 함께 묶어서 잡는다.
        const desig = text.match(
          /(SUPER TYPHOON|TYPHOON|SEVERE TROPICAL STORM|TROPICAL STORM|TROPICAL DEPRESSION|SUPER CYCLONIC STORM|CYCLONIC STORM|CYCLONE)\s+(\d{1,2}[A-Z])\b\s*(?:\(([^)]+)\))?/i
        );
        let classification = desig ? desig[1].toUpperCase() : "";
        let name = desig && desig[3] ? desig[3].trim() : "";
        // 이름이 없으면(무명 저기압) 해역+번호로 표기
        if (!name) name = desig ? desig[2].toUpperCase() : `${basin}${stormNo}`;

        return {
          id: `jtwc-${basin}${stormNo}`,
          name,
          basin,
          source: "JTWC",
          sourceName: "Joint Typhoon Warning Center",
          sourceUrl: url,
          classification,
          lat: parsed.current.lat,
          lng: parsed.current.lng,
          maxWindKt: parsed.current.maxWindKt,
          gustKt: parsed.current.gustKt ?? null,
          movementDeg: parsed.current.movementDeg ?? null,
          movementKt: parsed.current.movementKt ?? null,
          advisoryAt: parsed.current.validAt || null,
          currentRadii: parsed.current.radii || {},
          forecast: parsed.forecast || [],
          observedTrack: [],
        };
      } catch (innerError) {
        return null;
      }
    });

    for (const r of await Promise.all(jobs)) {
      if (r) out.push(r);
    }
  } catch (error) {
    console.error("[api/typhoons] JTWC 수집 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

// ─── EONET: 과거 경로 보강 ───────────────────────────────────
// EONET severeStorms 의 geometry 배열이 곧 관측 궤적이다. 예보 태풍과 위치로 매칭한다.
async function attachObservedTracks(typhoons) {
  try {
    if (typhoons.length === 0) return;
    const data = await fetchJson(EONET_STORMS);
    const events = data && Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) return;

    // 각 EONET 이벤트를 궤적으로 변환
    const tracks = [];
    for (const e of events) {
      const geom = Array.isArray(e.geometry) ? e.geometry : [];
      const pts = [];
      for (const g of geom) {
        const c = Array.isArray(g.coordinates) ? g.coordinates : [];
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        pts.push({
          lat,
          lng,
          date: g.date || "",
          windKt:
            typeof g.magnitudeValue === "number" ? g.magnitudeValue : null,
        });
      }
      if (pts.length > 0) {
        tracks.push({ title: e.title || "", pts, last: pts[pts.length - 1] });
      }
    }

    // ⚠️ 각 태풍은 자기 자신의 좌표로 가장 가까운 궤적을 찾는다(반복문 밖 고정값 참조 금지).
    for (const ty of typhoons) {
      let best = null;
      let bestKm = Infinity;
      for (const tr of tracks) {
        const km = distanceKm(ty.lat, ty.lng, tr.last.lat, tr.last.lng);
        if (km < bestKm) {
          bestKm = km;
          best = tr;
        }
      }
      if (best && bestKm <= MATCH_MAX_KM) {
        ty.observedTrack = best.pts;
        if (!ty.eonetTitle) ty.eonetTitle = best.title;
      }
    }
  } catch (error) {
    console.error("[api/typhoons] EONET 과거경로 보강 실패:", error); // TODO: 배포 전 제거
  }
}

export async function GET() {
  try {
    // 두 기관을 병렬로 (한쪽이 죽어도 다른 쪽은 살린다)
    const [nhc, jtwc] = await Promise.all([collectNhc(), collectJtwc()]);
    const typhoons = [...nhc, ...jtwc];

    // 같은 태풍이 두 기관에 겹칠 수 있다(경계 해역). 위치가 아주 가까우면 하나만 남긴다.
    const deduped = [];
    for (const ty of typhoons) {
      // ⚠️ 각 항목은 자기 좌표로 판정한다.
      const dup = deduped.find(
        (x) => distanceKm(x.lat, x.lng, ty.lat, ty.lng) < 150
      );
      if (dup) continue;
      deduped.push(ty);
    }

    // 강도 등급 부여 (표시용 색/라벨 키)
    for (const ty of deduped) {
      const cat = typhoonCategory(ty.maxWindKt);
      ty.categoryKey = cat.key;
      ty.categoryColor = cat.color;
    }

    // 과거 경로 보강
    await attachObservedTracks(deduped);

    // 강한 태풍부터
    deduped.sort((a, b) => (Number(b.maxWindKt) || 0) - (Number(a.maxWindKt) || 0));

    return Response.json({ ok: true, typhoons: deduped }, { status: 200 });
  } catch (error) {
    console.error("[api/typhoons][GET] 에러:", error); // TODO: 배포 전 제거
    return Response.json({ ok: true, typhoons: [] }, { status: 200 });
  }
}
