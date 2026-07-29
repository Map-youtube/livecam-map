// ─────────────────────────────────────────────────────────────
// getPublicTags — 공개 화면(홈)용 특성 태그 목록 (서버 전용)
//
// 반환: [{ id, name }] — 한국어 가나다순 정렬. 기존 src/app/page.js 의 getPublicTags 와 동일.
//
// ⚠️ Firestore 읽기 절감(2026-07-29, 실측 대응):
//    이 목록은 홈(/)이 렌더될 때마다 필요한데, 예전에는 tags 컬렉션(현재 53개)을 통째로
//    스캔했다. unstable_cache(10분)만으로는 Vercel 서버리스 인스턴스별로 캐시가 분리돼
//    콜드 렌더마다 재조회된다(지역 소개글·방송 목록에서 확인된 것과 같은 원인).
//    → 지역 소개글과 동일하게 Firestore 시간제 스냅샷(liveSnapshot)으로 전환한다.
//      전체 스캔은 주기당 1회, 그 외 렌더는 스냅샷 문서 1개만 읽는다. 53 읽기 → 1 읽기.
//
// ⚠️ 반환 형태·정렬·실패 시 동작([] 반환)은 기존과 완전히 동일하다(화면 변화 없음).
// ⚠️ 관리자가 태그를 새로 만들면 /api/tags POST 가 invalidatePublicTagsSnapshot() 으로
//    즉시 만료시킨다 → 기존(최대 10분 지연)보다 오히려 빨라진다.
// ⚠️ 실측 크기 2.5KB (Firestore 1MB 한도의 0.2%).
// ─────────────────────────────────────────────────────────────

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

const COLLECTION = "tags";
const SNAPSHOT_DOC_ID = "public_tags";
// 기존 unstable_cache(revalidate 600) 와 동일한 주기를 유지한다(신선도 회귀 없음).
const SNAPSHOT_REFRESH_MS = 10 * 60 * 1000; // 10분

// 실제 조회 — 기존 page.js 의 구현과 동일(id, name 만 사용 → 타임스탬프 직렬화 문제 없음).
//   ⚠️ throw 하지 않는다(getTimedSnapshot 규약). 실패 시 [] 반환.
async function fetchTags() {
  try {
    const snapshot = await adminDb.collection(COLLECTION).get();
    const tags = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: (doc.data() && doc.data().name) || "",
    }));
    // 한국어 가나다순 정렬 (기존과 동일)
    tags.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return tags;
  } catch (error) {
    console.error("[getPublicTags] 태그 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

async function fetchTagsShared() {
  try {
    const data = await getTimedSnapshot({
      docId: SNAPSHOT_DOC_ID,
      refreshMs: SNAPSHOT_REFRESH_MS,
      compute: fetchTags,
      // 빈 배열이면 "계산 실패"로 보고 이전 정상값을 유지한다(일시적 오류 방어).
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[getPublicTags] 스냅샷 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 태그가 추가되면 스냅샷을 즉시 만료시킨다(다음 렌더에서 재계산).
export async function invalidatePublicTagsSnapshot() {
  try {
    await adminDb.collection("live_snapshots").doc(SNAPSHOT_DOC_ID).delete();
  } catch (error) {
    // 실패해도 최대 SNAPSHOT_REFRESH_MS 뒤 자연 갱신되므로 조용히 넘어간다.
    console.error("[getPublicTags] 스냅샷 무효화 실패:", error); // TODO: 배포 전 제거
  }
}

// 같은 렌더 안에서는 1회만 + 시간 캐시(기존 태그/주기 유지 → revalidateTag("tags") 호환)
export const getPublicTags = cache(
  unstable_cache(fetchTagsShared, ["public-tags"], {
    revalidate: 600,
    tags: ["tags"],
  })
);
