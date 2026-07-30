// ─────────────────────────────────────────────────────────────
// indexNow — 새 페이지를 검색엔진에 "즉시" 통보 (서버 전용)
//
// 왜 필요한가 (2026-07-30 신설):
//   지진·로켓 발사처럼 이벤트성 페이지는 검색량이 몇 시간 안에 몰렸다 빠진다. 사이트맵만
//   두면 크롤러가 다시 올 때까지 기다려야 해서 그 피크를 놓칠 수 있다. IndexNow 는 새 URL 을
//   검색엔진에 곧바로 알려주는 무료 규격이라 이 대기 시간을 줄인다.
//
// ⚠️ 정직하게: 구글은 IndexNow 를 지원하지 않는다(2026-07 기준). 지원하는 곳은 Bing·Yandex·
//    Naver·Seznam 등이며, 한 번 제출하면 참여 엔진에 함께 전파된다. 이 사이트의 주 유입이
//    구글이라 효과는 제한적이지만, 비용이 0이고 구현이 단순해 "해두면 손해 없는" 항목이다.
//
// 소유권 확인 방식:
//   https://도메인/{키}.txt 가 그 키를 그대로 반환하면 소유자로 인정된다.
//   → public/9dc6d1b9cff24f1ffdb9491f290120b7.txt 로 커밋해 두었다(같은 커밋).
//     이미 있는 public/google...html(구글 사이트 확인 파일)과 완전히 같은 방식이다.
//
// ⚠️ 이 키는 "비밀번호가 아니다". 규격상 누구나 볼 수 있게 공개 파일로 올려야 소유권이
//    증명되는 구조라, 커밋해도 보안 문제가 없다(API 키 하드코딩 금지 규칙의 대상이 아님).
//    키로 할 수 있는 일은 "이 사이트에 실제로 존재하는 URL 을 크롤해달라"는 요청뿐이다.
//
// ⚠️ 키를 바꾸려면 반드시 두 곳을 함께 바꿔야 한다(하나만 바꾸면 소유권 확인 실패):
//    ① 환경변수 INDEXNOW_KEY  ② public/{새키}.txt 파일
//    환경변수를 안 넣으면 아래 기본값(커밋된 파일과 같은 값)을 쓰므로 설정 없이 바로 동작한다.
//
// ⚠️ 이 함수는 절대 throw 하지 않는다. 통보 실패가 페이지 렌더/응답을 깨면 안 된다.
// ⚠️ Firestore 를 읽지 않는다(비용 0).
// ─────────────────────────────────────────────────────────────

const ENDPOINT = "https://api.indexnow.org/indexnow";

// 1회 제출 최대 URL 수 (규격 상한 10,000이지만 넉넉히 낮춰 안전하게)
const MAX_URLS = 100;

// public/9dc6d1b9cff24f1ffdb9491f290120b7.txt 와 반드시 같은 값이어야 한다.
const DEFAULT_KEY = "9dc6d1b9cff24f1ffdb9491f290120b7";

function getKey() {
  const raw = String(process.env.INDEXNOW_KEY || DEFAULT_KEY).trim();
  // 규격: 영숫자·하이픈 8~128자
  if (!/^[A-Za-z0-9-]{8,128}$/.test(raw)) return null;
  return raw;
}

// 키가 설정돼 있는지 (라우트에서 404 판단용)
export function getIndexNowKey() {
  return getKey();
}

// URL 목록을 IndexNow 에 제출한다. 반환: { ok, skipped, submitted, status }
export async function submitToIndexNow(urls) {
  try {
    const key = getKey();
    if (!key) {
      // 키 미설정 = 기능 꺼짐. 정상 상황이므로 에러가 아니다.
      return { ok: false, skipped: true, submitted: 0, reason: "no_key" };
    }

    const siteUrl = String(
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.tripbyclip.com"
    );
    let host;
    try {
      host = new URL(siteUrl).host;
    } catch (error) {
      return { ok: false, skipped: true, submitted: 0, reason: "bad_site_url" };
    }

    // 우리 도메인 URL 만, 중복 제거해서 보낸다(규격 위반 방지).
    const list = [];
    const seen = new Set();
    for (const u of Array.isArray(urls) ? urls : []) {
      const s = String(u || "").trim();
      if (!s || seen.has(s)) continue;
      try {
        if (new URL(s).host !== host) continue; // 남의 도메인은 제출 불가
      } catch (error) {
        continue;
      }
      seen.add(s);
      list.push(s);
      if (list.length >= MAX_URLS) break;
    }
    if (list.length === 0) {
      return { ok: false, skipped: true, submitted: 0, reason: "empty" };
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${siteUrl.replace(/\/$/, "")}/${key}.txt`,
        urlList: list,
      }),
      cache: "no-store",
    });

    // 200/202 는 접수됨. 그 외는 실패로 보되 throw 하지 않는다.
    const ok = res.status === 200 || res.status === 202;
    if (!ok) {
      console.error("[indexNow] 제출 실패 status:", res.status); // TODO: 배포 전 제거
    }
    return { ok, skipped: false, submitted: ok ? list.length : 0, status: res.status };
  } catch (error) {
    console.error("[indexNow] 제출 중 오류:", error); // TODO: 배포 전 제거
    return { ok: false, skipped: false, submitted: 0, reason: "error" };
  }
}
