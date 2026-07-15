// ─────────────────────────────────────────────────────────────
// relatedChannels — 채널 상세 페이지의 "같은 분류의 다른 채널" 목록 (서버 전용)
//
// 선정 기준:
//   1) 같은 대분류 + 같은 중분류(국가)를 최우선
//   2) 그다음 같은 대분류
//   3) 그다음 나머지
//   같은 순위 안에서는 "현재 라이브 중인 채널"을 먼저(더 볼 게 있으므로).
//   현재 채널은 제외.
//
// 왜 필요한가:
//   채널이 지금 방송 중이 아니면 상세 페이지가 거의 비어(thin content) 방문자가 바로 이탈한다.
//   같은 분류의 다른 채널을 붙여 연속 탐색을 유도한다(이탈률 전략).
//
// ⚠️ 비용: getLiveChannels(tag "live-channels")와, 호출부가 이미 가진 byChannel(라이브 영상 30분 캐시)을
//    재사용하므로 추가 조회/API 비용이 없다.
// ─────────────────────────────────────────────────────────────

import { getLiveChannels } from "@/lib/getLiveChannels";

export async function getRelatedChannels(current, byChannel, limit = 8) {
  try {
    if (!current || !current.id) return [];

    const all = await getLiveChannels();
    const others = (Array.isArray(all) ? all : []).filter(
      (c) => c && c.id && c.id !== current.id
    );
    const counts = byChannel && typeof byChannel === "object" ? byChannel : {};

    const major = (current.major_category || "").trim();
    const middle = (current.middle_category || "").trim();

    // ⚠️ 각 채널은 "자기 자신의" 분류로 점수를 매긴다 (반복문 밖 고정값 참조 금지)
    const scored = others.map((c) => {
      const cMajor = (c.major_category || "").trim();
      const cMiddle = (c.middle_category || "").trim();
      let score = 1; // 그 외
      if (major && cMajor === major) {
        score = middle && cMiddle === middle ? 3 : 2; // 같은 대+중분류 : 같은 대분류
      }
      const liveCount = Array.isArray(counts[c.id]) ? counts[c.id].length : 0;
      return { channel: c, score, liveCount };
    });

    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.liveCount - a.liveCount ||
        (a.channel.channel_name || "").localeCompare(
          b.channel.channel_name || "",
          "ko"
        )
    );

    // 카드에서 라이브 개수를 바로 쓸 수 있도록 liveCount 를 붙여 반환
    return scored
      .slice(0, limit)
      .map((s) => ({ ...s.channel, liveCount: s.liveCount }));
  } catch (error) {
    console.error("[relatedChannels] 관련 채널 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}
