// ─────────────────────────────────────────────────────────────
// getLiveChannels — 공개(사용자용) 자동 라이브 채널 조회 (서버 전용, 5분 캐싱)
//
// - Firestore "live_channels" 컬렉션에서 is_active !== false 인 채널만 조회.
// - getPublicMarkers 와 동일하게 unstable_cache(revalidate 300s, tag "live-channels")로 캐싱.
//   → 관리자가 채널을 추가/수정/삭제하면 라우트가 revalidateTag("live-channels") 로 무효화.
// - 실패 시 빈 배열 반환.
//
// 컬렉션 문서 필드:
//   channel_id(UC…), handle(@…, 선택), channel_name,
//   major_category(대분류), minor_category(소분류),
//   lat, lng, location(선택 표시명),
//   channel_type: "fixed"(고정 마커) | "iss"(움직이는 추적 마커),
//   fallback_video_ids: string[](선택, iss 등 상시 라이브 폴백),
//   is_active, created_at, updated_at
// ─────────────────────────────────────────────────────────────

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { getTimedSnapshot } from "@/lib/liveSnapshot";

// 채널 목록을 담아두는 전역 공유 스냅샷 문서 id (live_snapshots/{id})
const SNAPSHOT_DOC_ID = "public_live_channels";
// 기존 unstable_cache(revalidate 300) 와 동일한 주기 → 신선도 회귀 없음.
const SNAPSHOT_REFRESH_MS = 5 * 60 * 1000; // 5분

// Firestore Timestamp 등 직렬화 불가 값을 순수 값으로 변환
function toPlainValue(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

function serializeChannel(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    console.error("[getLiveChannels] 직렬화 실패:", error); // TODO: 배포 전 제거
  }
  return out;
}

async function fetchActiveChannels() {
  try {
    const snapshot = await adminDb
      .collection("live_channels")
      .where("is_active", "!=", false)
      .get();
    return snapshot.docs.map((doc) => serializeChannel(doc.id, doc.data()));
  } catch (error) {
    console.error("[getLiveChannels] Firestore 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ⚠️ Firestore 읽기 절감(2026-07-29, 실측 대응):
//    unstable_cache 는 Vercel 서버리스 인스턴스별로 분리돼 콜드 렌더마다 재조회된다
//    (지역 소개글·방송 목록에서 확인된 것과 같은 원인). 홈·채널 페이지·사이트맵이 모두
//    이 함수를 쓰므로, 콜드 렌더마다 live_channels 를 통째로(53개) 다시 읽고 있었다.
//    → Firestore 시간제 스냅샷 경유로 바꿔 53 읽기 → 1 읽기.
//
//    ⚠️ 반환 배열의 내용·순서·필터 규칙(is_active !== false)은 기존과 완전히 동일하다.
//       → 이 목록을 쓰는 라이브 영상 수집(getLiveChannelVideos)의 대상 채널이 바뀌지 않으므로
//         YouTube videos.list 호출 대상·유닛도 그대로다.
//    ⚠️ 관리자가 채널을 추가/수정/삭제하거나 분류명을 바꾸면 해당 라우트가
//       invalidateLiveChannelsSnapshot() 으로 즉시 만료시킨다(4곳 전부 연결).
//    ⚠️ 계산 결과가 빈 배열이면 이전 정상값을 유지한다(일시적 조회 실패로 채널이
//       통째로 사라지는 것을 막는다 — getTimedSnapshot 규칙).
//    ⚠️ 실측 크기 21.5KB (Firestore 1MB 한도의 2%).
// ─────────────────────────────────────────────────────────────
async function fetchActiveChannelsShared() {
  try {
    const data = await getTimedSnapshot({
      docId: SNAPSHOT_DOC_ID,
      refreshMs: SNAPSHOT_REFRESH_MS,
      compute: fetchActiveChannels, // 실패해도 [] 반환(throw 안 함)
      isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("[getLiveChannels] 스냅샷 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// 채널이 추가/수정/삭제되면 스냅샷을 즉시 만료시킨다(다음 렌더에서 재계산).
export async function invalidateLiveChannelsSnapshot() {
  try {
    await adminDb.collection("live_snapshots").doc(SNAPSHOT_DOC_ID).delete();
  } catch (error) {
    // 실패해도 최대 SNAPSHOT_REFRESH_MS 뒤 자연 갱신되므로 조용히 넘어간다.
    console.error("[getLiveChannels] 스냅샷 무효화 실패:", error); // TODO: 배포 전 제거
  }
}

// ⚠️ Firestore 읽기 폭증 방지(2026-07-16 사고 대응): unstable_cache(시간 기준 캐시)만으로는
//    같은 채널 페이지의 generateMetadata+본문+관련채널조회에서 각각 재조회되는 걸 못 막는다
//    (Vercel 서버리스 인스턴스별 캐시 분리 — YouTube 유닛 사고와 동일 원인). React cache() 로
//    한 번 더 감싸 "요청(렌더) 1회당 실제 조회는 1번만" 되도록 강제한다.
export const getLiveChannels = cache(
  unstable_cache(
    fetchActiveChannelsShared,
    ["live-channels"],
    {
      revalidate: 300, // 5분
      tags: ["live-channels"],
    }
  )
);
