// ─────────────────────────────────────────────────────────────
// autoMarkerScan — 지역 자동 채널 스캔 코어 (서버 전용)
//
// scanChannels(channelDocs, opts):
//   등록된 auto_channels 문서 배열을 받아,
//   1) 각 채널의 라이브 후보 videoId 를 (RSS+streams, 무료) 모으고
//   2) 모든 채널의 후보를 "전역 50개 배칭"으로 videos.list 1회씩 검증(getLiveVideos)해
//      현재 라이브 중인 영상만 추린다(유닛 = ceil(전체후보/50), 채널 수와 무관).
//   3) 아직 auto_markers 에 없는 "새 영상"만 Gemini 로 1회 채워 저장(비용의 핵심).
//   4) 더 이상 라이브가 아닌 기존 auto_markers 는 is_live:false 로 숨김(문서는 보존 → 재라이브 시 AI 재호출 0).
//   5) 라이브가 하나라도 잡힌 채널은 last_seen_video_at 갱신.
//
// ⚠️ 비용 방어:
//   - videos.list: 전역 배칭으로 하루 수백 유닛 이내(무료 10,000 대비 여유).
//   - Gemini: "새 영상"에만, 그리고 opts.aiCap(일일 상한)까지만 호출. 초과분은 다음 스캔.
//   - 이미 채운 영상은 절대 재호출하지 않는다.
//
// ⚠️ Firestore/Gemini 모두 firebase-admin(Node 전용)·서버 키를 쓰므로 Node.js 런타임에서만 호출.
// ─────────────────────────────────────────────────────────────

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getLiveVideos, getThumbnailUrl } from "@/lib/youtubeUtils";
import { getChannelCandidateVideoIds } from "@/lib/liveChannelUtils";
import { enrichVideosToMarkers } from "@/lib/autoMarkerAi";

const MARKERS = "auto_markers";
const CHANNELS = "auto_channels";

// 사이트 태그 목록 조회 (AI 가 이 목록 안에서만 태그를 고르도록 전달)
async function fetchTagNames() {
  try {
    const snap = await adminDb.collection("tags").get();
    return snap.docs
      .map((d) => (d.data() && d.data().name) || "")
      .filter(Boolean);
  } catch (error) {
    console.error("[autoMarkerScan] 태그 목록 조회 실패:", error); // TODO: 배포 전 제거
    return [];
  }
}

// ─── 90일 이상 라이브가 없던 채널 자동 삭제 (+ 그 마커) ────────
// 판정 기준: (last_seen_video_at 또는 created_at) 이 cutoff 보다 오래됐으면 삭제.
//   - last_seen_video_at 은 라이브가 잡힐 때만 갱신되므로, 등록 후 90일간 한 번도
//     라이브가 없던 채널은 created_at 기준으로 걸러진다.
// 반환: { deletedChannels, deletedMarkers }
export async function cleanupStaleChannels(days = 90) {
  const out = { deletedChannels: 0, deletedMarkers: 0 };
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const snap = await adminDb.collection(CHANNELS).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const lastSeen =
        (data.last_seen_video_at &&
          typeof data.last_seen_video_at.toMillis === "function" &&
          data.last_seen_video_at.toMillis()) ||
        (data.created_at &&
          typeof data.created_at.toMillis === "function" &&
          data.created_at.toMillis()) ||
        0;
      // 타임스탬프를 못 읽으면(0) 방금 만든 것일 수 있으니 건드리지 않는다.
      if (!lastSeen || lastSeen >= cutoff) continue;

      // 이 채널의 자동 마커 삭제
      try {
        const markerSnap = await adminDb
          .collection(MARKERS)
          .where("source_channel_id", "==", doc.id)
          .get();
        const docs = markerSnap.docs;
        for (let i = 0; i < docs.length; i += 450) {
          const batch = adminDb.batch();
          for (const d of docs.slice(i, i + 450)) batch.delete(d.ref);
          await batch.commit();
        }
        out.deletedMarkers += docs.length;
      } catch (mErr) {
        console.error("[autoMarkerScan] 만료 채널 마커 삭제 실패:", doc.id, mErr); // TODO: 배포 전 제거
      }

      await doc.ref.delete();
      out.deletedChannels += 1;
    }
  } catch (error) {
    console.error("[autoMarkerScan] cleanupStaleChannels 예외:", error); // TODO: 배포 전 제거
  }
  return out;
}

// ─── 채널 배열 스캔 ───────────────────────────────────────────
// channelDocs: [{ id, channel_id, handle, channel_name, ... }]
// opts: { existingTags?, aiCap=Infinity }
// 반환(보고용): 유닛/신규/실패/숨김 카운트
export async function scanChannels(channelDocs, opts = {}) {
  const report = {
    channelsScanned: 0,
    candidateIdCount: 0,
    videosListUnits: 0, // ceil(candidate/50) — 소모한 YouTube 유닛 추정
    liveVideoCount: 0,
    newEnriched: 0,
    enrichFailed: 0,
    reused: 0, // 이미 있던 영상 재활용(AI 재호출 없음)
    skippedNoLocation: 0, // AI가 위치를 특정 못한 영상(월드 모음 등) — 숨김 캐시
    markedEnded: 0,
    aiCapReached: false,
  };

  try {
    const channels = (Array.isArray(channelDocs) ? channelDocs : []).filter(
      (c) => c && c.channel_id
    );
    if (channels.length === 0) return report;
    report.channelsScanned = channels.length;

    const aiCap = Number.isFinite(opts.aiCap) ? opts.aiCap : Infinity;
    const existingTags =
      Array.isArray(opts.existingTags) && opts.existingTags.length > 0
        ? opts.existingTags
        : await fetchTagNames();

    // 1) 채널별 후보 videoId 수집 (무료 스크래핑). candidateId → channelDoc 매핑.
    const idToChannel = new Map();
    await Promise.all(
      channels.map(async (ch) => {
        const ids = await getChannelCandidateVideoIds({
          channelId: ch.channel_id,
          handle: ch.handle,
          // 씨앗 영상ID(기존 마커에서 온 검증된 영상)를 항상 후보 맨 앞에 포함시킨다.
          //   → 오래된 24/7 스트림이 RSS/streams 스크래핑에 안 잡혀도 원본 영상을 매 스캔 재확인.
          fallbackIds: Array.isArray(ch.seed_video_ids) ? ch.seed_video_ids : [],
        });
        for (const id of ids) {
          if (!idToChannel.has(id)) idToChannel.set(id, ch);
        }
      })
    );

    // 기존 auto_markers 중 "라이브로 표시 중"인 것도 후보에 포함해야
    // (RSS/streams 에서 빠져도) 종료 여부를 판정할 수 있다.
    const activeByChannel = new Map(); // channelDocId → [{videoId, ref}]
    await Promise.all(
      channels.map(async (ch) => {
        try {
          const snap = await adminDb
            .collection(MARKERS)
            .where("source_channel_id", "==", ch.id)
            .get();
          const list = [];
          for (const d of snap.docs) {
            const data = d.data() || {};
            list.push({ videoId: d.id, isLive: data.is_live === true });
            if (data.is_live === true && !idToChannel.has(d.id)) {
              idToChannel.set(d.id, ch); // 종료 판정 위해 후보에 추가
            }
          }
          activeByChannel.set(ch.id, list);
        } catch (error) {
          console.error(
            "[autoMarkerScan] 기존 마커 조회 실패:",
            ch.id,
            error
          ); // TODO: 배포 전 제거
        }
      })
    );

    const allIds = [...idToChannel.keys()];
    report.candidateIdCount = allIds.length;
    report.videosListUnits = Math.ceil(allIds.length / 50);
    if (allIds.length === 0) return report;

    // 2) 전역 50개 배칭으로 "현재 라이브" 검증 (getLiveVideos 가 내부에서 50개씩 처리)
    const liveVideos = await getLiveVideos(allIds); // [{videoId,title,thumbnailUrl,channelName}]
    report.liveVideoCount = liveVideos.length;
    const liveIdSet = new Set(liveVideos.map((v) => v.videoId));

    // 채널별 "이번에 라이브로 확인된 videoId" 모음 (last_seen 갱신·종료판정용)
    const liveByChannel = new Map();
    for (const v of liveVideos) {
      const ch = idToChannel.get(v.videoId);
      if (!ch) continue;
      if (!liveByChannel.has(ch.id)) liveByChannel.set(ch.id, new Set());
      liveByChannel.get(ch.id).add(v.videoId);
    }

    // 3) 라이브 영상 처리
    //   3-a) 먼저 "이미 있는 영상"은 AI 없이 재활용, "새 영상"만 추려낸다(일일 상한까지).
    //   3-b) 새 영상들을 배치로 한 번에 Gemini 처리(분당 15회 제한 우회).
    //   3-c) 배치 결과를 각 문서로 저장.
    const toEnrich = []; // { v, ch, ref }
    for (const v of liveVideos) {
      const ch = idToChannel.get(v.videoId);
      if (!ch) continue;
      const ref = adminDb.collection(MARKERS).doc(v.videoId);
      try {
        const existing = await ref.get();
        if (existing.exists) {
          // 이미 있는 영상 → AI 재호출 없이 라이브 상태만 복원(비용 0)
          const data = existing.data() || {};
          const patch = { last_checked_at: FieldValue.serverTimestamp() };
          if (data.is_live !== true) patch.is_live = true;
          // 위치를 못 찾아 숨겨둔(ai_unlocatable) 영상은 다시 켜지 않는다.
          if (
            data.ai_unlocatable !== true &&
            data.is_active !== true &&
            data.auto_disabled !== true
          )
            patch.is_active = true;
          await ref.update(patch);
          report.reused += 1;
          continue;
        }
        // 새 영상 → 일일 AI 상한 확인 후 배치 대상에 추가
        if (toEnrich.length >= aiCap) {
          report.aiCapReached = true;
          continue; // 이번엔 건너뛰고 다음 스캔에서 처리
        }
        toEnrich.push({ v, ch, ref });
      } catch (error) {
        console.error("[autoMarkerScan] 기존 문서 조회 실패:", v.videoId, error); // TODO: 배포 전 제거
        report.enrichFailed += 1;
      }
    }

    // 3-b) 새 영상들을 배치로 Gemini 처리 (videoId → 결과 Map)
    const enrichedMap =
      toEnrich.length > 0
        ? await enrichVideosToMarkers(
            toEnrich.map(({ v, ch }) => ({
              videoId: v.videoId,
              title: v.title,
              channelName: v.channelName || ch.channel_name || "",
            })),
            existingTags
          )
        : new Map();

    // 3-c) 결과 저장
    for (const { v, ch, ref } of toEnrich) {
      const ai = enrichedMap.get(v.videoId);
      if (!ai || !ai.ok) {
        report.enrichFailed += 1;
        continue; // AI 매칭 실패 → 마커 안 만듦(빈 마커 방지). 다음 스캔 재시도.
      }
      const now = FieldValue.serverTimestamp();

      // 위치 특정 여부: 국가·좌표가 유효하고 (0,0) "널섬"이 아니어야 지도에 올린다.
      // (월드 모음/여러 장소 편집본 등은 AI 가 위치를 안 주므로 여기서 걸러진다.)
      const located =
        !!ai.country &&
        typeof ai.lat === "number" &&
        typeof ai.lng === "number" &&
        !(ai.lat === 0 && ai.lng === 0);

      try {
        if (!located) {
          // 위치 미상 → 숨김 상태로 "캐시"만 한다(is_active:false).
          //   → 지도/목록엔 안 뜨고, 다음 스캔에서 다시 AI 를 부르지도 않는다(비용 0).
          await ref.set({
            location: ai.location || v.title || "",
            description: ai.description || { ko: "", en: "" },
            description_confirmed: true,
            youtube_video_id: v.videoId,
            youtube_url: `https://www.youtube.com/watch?v=${v.videoId}`,
            youtube_title: v.title || "",
            youtube_channel_name: v.channelName || ch.channel_name || "",
            youtube_thumbnail_url: v.thumbnailUrl || getThumbnailUrl(v.videoId),
            is_live: true,
            is_active: false, // 숨김
            auto_disabled: false,
            ai_unlocatable: true, // 위치 미상 표식(재호출 방지)
            source_channel_id: ch.id,
            source_channel_youtube_id: ch.channel_id,
            ai_enriched: true,
            ai_model: ai.model || "",
            ai_enriched_at: now,
            last_checked_at: now,
            created_at: now,
            updated_at: now,
          });
          report.skippedNoLocation += 1;
          continue;
        }

        await ref.set({
          // 위치/분류 (AI)
          lat: ai.lat,
          lng: ai.lng,
          location: ai.location || v.title || "",
          city: ai.city || "",
          country: ai.country || "",
          continent: ai.continent || "",
          tags: Array.isArray(ai.tags) ? ai.tags : [],
          description: ai.description || { ko: "", en: "" },
          // 자동 마커는 수동 검토 단계가 없으므로 AI 설명을 확정으로 본다
          //   → 상세 SEO 페이지가 설명을 렌더(SEO/애드센스). 관리자가 목록에서 수정 가능.
          description_confirmed: true,
          // 유튜브 정보
          youtube_video_id: v.videoId,
          youtube_url: `https://www.youtube.com/watch?v=${v.videoId}`,
          youtube_title: v.title || "",
          youtube_channel_name: v.channelName || ch.channel_name || "",
          youtube_thumbnail_url: v.thumbnailUrl || getThumbnailUrl(v.videoId),
          // 상태
          is_live: true,
          is_active: true,
          auto_disabled: false,
          // 출처/메타
          source_channel_id: ch.id,
          source_channel_youtube_id: ch.channel_id,
          ai_enriched: true,
          ai_model: ai.model || "",
          ai_enriched_at: now,
          last_checked_at: now,
          created_at: now,
          updated_at: now,
        });
        report.newEnriched += 1;
      } catch (error) {
        console.error("[autoMarkerScan] 영상 저장 실패:", v.videoId, error); // TODO: 배포 전 제거
        report.enrichFailed += 1;
      }
    }

    // 4) 더 이상 라이브가 아닌 기존 마커 → is_live:false (문서 보존)
    for (const ch of channels) {
      const list = activeByChannel.get(ch.id) || [];
      for (const item of list) {
        if (item.isLive && !liveIdSet.has(item.videoId)) {
          try {
            await adminDb.collection(MARKERS).doc(item.videoId).update({
              is_live: false,
              last_checked_at: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp(),
            });
            report.markedEnded += 1;
          } catch (error) {
            console.error(
              "[autoMarkerScan] 종료 표시 실패:",
              item.videoId,
              error
            ); // TODO: 배포 전 제거
          }
        }
      }
    }

    // 5) 라이브가 잡힌 채널은 last_seen_video_at 갱신 (90일 자동삭제 판정 기준)
    for (const ch of channels) {
      const liveSet = liveByChannel.get(ch.id);
      if (liveSet && liveSet.size > 0) {
        try {
          await adminDb.collection(CHANNELS).doc(ch.id).update({
            last_seen_video_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        } catch (error) {
          console.error(
            "[autoMarkerScan] last_seen 갱신 실패:",
            ch.id,
            error
          ); // TODO: 배포 전 제거
        }
      }
    }
  } catch (error) {
    console.error("[autoMarkerScan] scanChannels 예외:", error); // TODO: 배포 전 제거
  }

  return report;
}
