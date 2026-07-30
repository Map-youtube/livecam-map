// ─────────────────────────────────────────────────────────────
// launchData — 로켓 발사 일정 조회 (서버 전용)
//
// 왜 필요한가 (2026-07-30 신설):
//   NASA/SpaceX 발사는 발생할 때마다 전 세계 검색량이 폭증한다. 그런데 지진과 달리
//   **발사는 날짜가 미리 공개된다.** 즉 이벤트가 터지기 며칠 전에 페이지를 만들어
//   검색엔진에 미리 색인시켜 둘 수 있다 — 검색량이 몰리는 순간엔 이미 순위에 올라가 있다.
//   (지진은 사후 대응이라 색인 속도 싸움이지만, 발사는 사전 준비로 이길 수 있다.)
//
// 데이터: The Space Devs "Launch Library 2" — 무료, API 키 불필요.
//   https://ll.thespacedevs.com/2.2.0/launch/upcoming/
//   https://ll.thespacedevs.com/2.2.0/launch/previous/
//
// ⚠️ 비용: 외부 API 는 무료다. 다만 익명 호출은 시간당 요청 수 제한이 있으므로,
//    방문자 수와 무관하게 "주기당 1번"만 호출되도록 Firestore 시간제 스냅샷을 거친다
//    (방송/ISS·사이트맵과 동일한 패턴). 방문자는 스냅샷 문서 1개만 읽는다.
// ⚠️ 이 파일의 compute 안에서는 Firestore 를 읽지 않는다(외부 API 전용).
//    발사장 인근 라이브캠 계산은 호출부가 넘겨준 마커 배열로만 한다(아래 getNearbyForLaunch).
// ─────────────────────────────────────────────────────────────

import { getTimedSnapshot } from "@/lib/liveSnapshot";
import { findNearestMarkers } from "@/lib/earthquakeAlert";

const API_BASE = "https://ll.thespacedevs.com/2.2.0/launch";
// 유튜브와 마찬가지로 기본 UA 로 요청하면 차단될 수 있어 브라우저 UA 를 명시한다.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// 스냅샷 설정 — 발사 일정은 분 단위로 바뀌지 않지만 "연기"가 잦아 하루 몇 번은 갱신한다.
const SNAPSHOT_DOC_ID = "rocket_launches";
const SNAPSHOT_REFRESH_MS = 3 * 60 * 60 * 1000; // 3시간

// 가져올 개수 (앞으로 예정 / 최근 완료)
const UPCOMING_LIMIT = 40;
const PREVIOUS_LIMIT = 12;

// ─── 발사장 인근 라이브캠 기준 거리 ───────────────────────────
// ⚠️ 왜 150km 인가 (2026-07-30 실측 후 300km → 150km 로 좁힘):
//    처음 300km 로 두고 화면을 확인했더니 반덴버그(미국 캘리포니아) 발사의 "가장 가까운
//    라이브캠"으로 195km 떨어진 **고양이 보호소 영상**이 붙었다. 발사를 보러 온 방문자에게
//    아무 쓸모가 없고, 이런 페이지가 색인되면 사이트 전체 품질 평가에 해롭다(thin content).
//    150km 로 좁히면 "발사장과 같은 지역"이라 부를 수 있는 곳만 남는다:
//      케이프커내버럴 17km(NASA·SpaceX 전용 24시간 라이브캠) / 스타베이스 0km(Starship 전용)
//      / 다네가시마 136km(가고시마 — JAXA 발사 관문 지역)
//    → 반덴버그(195km)·원창(429km)·기아나·바이코누르는 제외되어 페이지를 만들지 않는다.
//    ⚠️ 이 값을 다시 늘리려면 "그 거리의 영상이 발사와 실제로 관련 있는가"를 먼저 확인할 것.
//       거리만 넓히면 위 고양이 보호소 사례가 그대로 재발한다.
export const LAUNCH_NEAR_KM = 150;
// 한 페이지에 보여줄 인근 라이브캠 최대 개수
const NEARBY_LIMIT = 8;

// 발사 시각이 이 정도로는 특정돼야 페이지를 만든다(TBD/월 단위만 나온 건은 제외).
//   Launch Library 의 net_precision.name 값. 목록에 없으면(=알 수 없음) 보수적으로 포함한다.
const VAGUE_PRECISIONS = new Set([
  "Month",
  "Quarter",
  "Year",
  "Fiscal Year",
  "Half",
]);

// 과거 발사는 이 기간까지만 유지한다(발사 직후 "성공했나?" 검색 대응).
const PAST_KEEP_MS = 7 * 24 * 60 * 60 * 1000; // 7일
// 미래 발사는 이 기간까지만 페이지를 만든다(너무 먼 미래는 일정이 계속 바뀜).
const FUTURE_KEEP_MS = 60 * 24 * 60 * 60 * 1000; // 60일

// ─── 단일 발사 객체 정규화 (직렬화 가능한 평범한 값만) ─────────
function normalizeLaunch(r) {
  try {
    if (!r || !r.slug || !r.net) return null;

    const pad = r.pad || {};
    const lat = Number(pad.latitude);
    const lng = Number(pad.longitude);
    // 좌표가 없으면 "인근 라이브캠"을 계산할 수 없다 → 이 서비스에선 의미가 없으므로 제외.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const netMs = Date.parse(r.net);
    if (!Number.isFinite(netMs)) return null;

    const mission = r.mission || {};
    const status = r.status || {};
    const precision = (r.net_precision && r.net_precision.name) || "";

    return {
      id: String(r.id || ""),
      slug: String(r.slug),
      name: String(r.name || ""),
      netMs,
      netPrecision: precision,
      statusName: String(status.name || ""),
      statusAbbrev: String(status.abbrev || ""),
      provider: String(
        (r.launch_service_provider && r.launch_service_provider.name) || ""
      ),
      rocket: String(
        (r.rocket && r.rocket.configuration && r.rocket.configuration.full_name) ||
          ""
      ),
      missionName: String(mission.name || ""),
      missionType: String(mission.type || ""),
      missionDescription: String(mission.description || ""),
      padName: String(pad.name || ""),
      padLocation: String((pad.location && pad.location.name) || ""),
      padWiki: String(pad.wiki_url || ""),
      lat,
      lng,
      image: String(r.image || ""),
      // 공식 중계 링크는 발사 직전에야 채워지는 경우가 많다(비어 있을 수 있음).
      webcastUrls: Array.isArray(r.vidURLs)
        ? r.vidURLs.map((v) => String((v && v.url) || "")).filter(Boolean)
        : [],
    };
  } catch (error) {
    console.error("[launchData] 정규화 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 외부 API 호출 (throw 하지 않는다 — 실패 시 빈 배열) ───────
async function fetchFrom(pathname, limit) {
  try {
    const res = await fetch(`${API_BASE}/${pathname}/?limit=${limit}&mode=detailed`, {
      headers: { "User-Agent": BROWSER_UA },
      // 외부 API 자체도 캐시해 스냅샷 재계산 때의 호출을 아낀다.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error("[launchData] API 응답 오류:", pathname, res.status); // TODO: 배포 전 제거
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (error) {
    console.error("[launchData] API 호출 실패:", pathname, error); // TODO: 배포 전 제거
    return [];
  }
}

// 예정 + 최근 완료 발사를 합쳐 정규화·중복제거한다.
async function computeLaunches() {
  const [upcoming, previous] = await Promise.all([
    fetchFrom("upcoming", UPCOMING_LIMIT),
    fetchFrom("previous", PREVIOUS_LIMIT),
  ]);

  const now = Date.now();
  const bySlug = new Map();

  // ⚠️ 각 항목은 자기 자신의 데이터로만 판정한다(반복문 밖 고정값 참조 금지).
  for (const raw of [...upcoming, ...previous]) {
    const item = normalizeLaunch(raw);
    if (!item) continue;

    // 시각이 너무 모호한 건(월/분기/연 단위) 제외 — 얇은 페이지 방지
    if (VAGUE_PRECISIONS.has(item.netPrecision)) continue;

    // 기간 밖(너무 먼 과거/미래) 제외
    const delta = item.netMs - now;
    if (delta < -PAST_KEEP_MS) continue;
    if (delta > FUTURE_KEEP_MS) continue;

    // upcoming/previous 에 같은 발사가 겹쳐 올 수 있으므로 slug 기준으로 합친다.
    if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
  }

  // 발사 시각 순 정렬(가까운 것부터)
  return [...bySlug.values()].sort((a, b) => a.netMs - b.netMs);
}

// ─── 공개 API ─────────────────────────────────────────────────

// 발사 목록 전체(스냅샷 경유 — 방문자당 Firestore 읽기 1건)
export async function getLaunches() {
  try {
    const list = await getTimedSnapshot({
      docId: SNAPSHOT_DOC_ID,
      refreshMs: SNAPSHOT_REFRESH_MS,
      compute: computeLaunches, // throw 하지 않음
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error("[launchData] 목록 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// slug 로 발사 1건 조회 (없으면 null)
export async function getLaunchBySlug(slug) {
  try {
    const key = String(slug || "").trim();
    if (!key) return null;
    const list = await getLaunches();
    return list.find((x) => x && x.slug === key) || null;
  } catch (error) {
    console.error("[launchData] 단건 조회 실패:", slug, error); // TODO: 배포 전 제거
    return null;
  }
}

// 발사장 인근 라이브캠 (가까운 순). markers 는 호출부가 넘긴다(이 파일은 Firestore 를 읽지 않음).
//   ⚠️ 각 발사는 "자기 발사장"의 좌표로만 계산한다.
export function getNearbyForLaunch(launch, markers) {
  try {
    if (!launch) return [];
    return findNearestMarkers(markers, launch.lat, launch.lng, {
      limit: NEARBY_LIMIT,
      maxKm: LAUNCH_NEAR_KM,
    });
  } catch (error) {
    console.error("[launchData] 인근 라이브캠 계산 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 발사 시각이 지났는지 (지났으면 "완료", 아니면 "예정")
export function isPast(launch, now = Date.now()) {
  return !!launch && typeof launch.netMs === "number" && launch.netMs < now;
}
