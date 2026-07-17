// ─────────────────────────────────────────────────────────────
// liveSnapshot — Firestore 기반 "시간제 스냅샷 캐시" (서버 전용)
//
// 목적: 라이브 영상 목록(방송/ISS)을 트래픽과 무관하게 refreshMs 마다 "딱 1번"만
//       YouTube(videos.list)로 재계산하고, 그 결과를 Firestore(live_snapshots/{docId})에
//       저장해 모든 방문자 요청은 Firestore 에서 읽어 내려준다(방문자 1명당 YouTube 호출 0).
//
// ⚠️ 왜 unstable_cache 를 안 쓰나:
//    Vercel 서버리스에서 unstable_cache 는 인스턴스/리전별로 따로 캐시돼(공유가 보장 안 됨),
//    방문자가 많아지면 videos.list 재계산이 방문자 수에 비례해 폭증한다.
//    실제로 하루 20,000+ 요청으로 무료 할당량(10,000유닛/일)을 2배 초과해 사이트 영상이
//    통째로 비는 사고가 났다. Firestore 문서 1개(+타임스탬프)로 "전역 단일 캐시"를 만들어
//    트래픽과 무관하게 1시간 1회로 고정한다. (Firestore 읽기는 무료 5만/일로 매우 넉넉)
//
// getTimedSnapshot({ docId, refreshMs, compute, isEmpty }):
//   - docId    : live_snapshots 컬렉션 문서 id (예: "broadcast", "iss")
//   - refreshMs: 재계산 주기(ms). 이 시간 안에는 저장된 값을 그대로 반환(YouTube 호출 0).
//   - compute  : 만료 시 실제 재계산 함수(YouTube 사용). throw 하지 않는 함수여야 함.
//   - isEmpty  : (선택) compute 결과가 "비었는지" 판정. 비었고 이전 정상값이 있으면 덮어쓰지 않음.
//
// ⚠️ compute 는 실패해도 빈 값을 반환(throw 금지)하도록 호출부에서 보장한다(사이트 안 죽게).
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// 결과가 "비었는지" 기본 판정(배열=길이0, 객체=키없음 또는 모든 값이 빈 배열).
function defaultIsEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const vals = Object.values(v);
    if (vals.length === 0) return true;
    return vals.every((x) => Array.isArray(x) && x.length === 0);
  }
  return false;
}

export async function getTimedSnapshot({
  docId,
  refreshMs,
  compute,
  isEmpty = defaultIsEmpty,
}) {
  const ref = adminDb.collection("live_snapshots").doc(docId);

  // 1) 저장된 스냅샷 읽기
  let stored = null;
  try {
    const snap = await ref.get();
    if (snap.exists) stored = snap.data();
  } catch (error) {
    console.error("[liveSnapshot] 읽기 실패:", docId, error); // TODO: 배포 전 제거
  }

  const updatedMs =
    stored && stored.updated_at && typeof stored.updated_at.toMillis === "function"
      ? stored.updated_at.toMillis()
      : 0;
  const hasData = stored && stored.data !== undefined && stored.data !== null;
  const fresh = hasData && Date.now() - updatedMs < refreshMs;

  // 2) 신선하면 저장값 그대로 반환 → YouTube 호출 0
  if (fresh) return stored.data;

  // 3) 만료됨: 여러 요청이 동시에 만료를 만나 중복 재계산(stampede)하지 않도록,
  //    이전 정상 데이터가 있으면 타임스탬프를 먼저 선점한다(다른 동시 요청은 저장값으로 통과).
  if (hasData) {
    try {
      await ref.set({ updated_at: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      /* 선점 실패는 무시(최악의 경우 중복 계산 1~2회) */
    }
  }

  // 4) 실제 재계산(YouTube 사용). compute 는 throw 하지 않는다고 가정.
  let computed;
  try {
    computed = await compute();
  } catch (error) {
    console.error("[liveSnapshot] compute 실패:", docId, error); // TODO: 배포 전 제거
    return hasData ? stored.data : null;
  }

  // 5) 결과가 비었고 이전 정상값이 있으면: 덮어쓰지 않고 이전 값 유지(일시적 실패에 강함).
  //    (타임스탬프는 위에서 갱신됐으므로 다음 주기에 다시 시도한다.)
  if (isEmpty(computed) && hasData) {
    return stored.data;
  }

  // 6) 정상 결과 저장 + 반환
  try {
    await ref.set(
      { data: computed, updated_at: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    console.error("[liveSnapshot] 쓰기 실패:", docId, error); // TODO: 배포 전 제거
  }
  return computed;
}
