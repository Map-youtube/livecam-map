// ─────────────────────────────────────────────────────────────
// 기존 마커에서 채널 일괄 등록 API — /api/auto-channels/import-from-markers
//
// (item 13) 기존 markers 컬렉션의 영상들에서 소속 채널을 뽑아, 채널 단위로
// 중복 없이 auto_channels 에 등록한다. 재생/재생중지 상태와 무관하게 전부 대상.
//
// 채널을 알아내는 2단계:
//   1) 마커에 youtube_channel_id 가 이미 있으면 그대로 사용(추가 비용 0).
//   2) 없으면(레거시 마커) youtube_video_id 를 모아 videos.list 로 채널을 역추적한다.
//      - 50개 영상ID = 1유닛(배치). 예: 300개 → 약 6유닛(무료 10,000/일 중 0.06%).
//      - 삭제/비공개된 영상은 채널을 알 수 없어 스킵된다(라이브 종료만 된 영상은 역추적 가능).
//   → 이렇게 얻은 모든 채널ID 를 중복 제거하고, 이미 등록된 채널은 건너뛴 뒤 저장한다.
//
// 등록만 하고 스캔은 하지 않는다(대량 AI 호출 방지). 이후 크론/"지금 스캔"이 영상을 채운다.
// 90일간 라이브가 안 잡히는 채널은 스캔 시 자동 삭제되므로, 죽은 채널은 알아서 정리된다.
//
// 관리자 전용. Node.js 런타임.
// ─────────────────────────────────────────────────────────────

import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/authUtils";
import { getVideosChannelInfo } from "@/lib/youtubeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 영상 역추적(videos.list 배치)까지 하므로 넉넉한 시간 확보.
export const maxDuration = 300;

const CHANNELS = "auto_channels";
const MARKERS = "markers";

export async function POST(request) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.valid) {
      const status = authResult.reason === "not_admin" ? 403 : 401;
      return Response.json(
        { ok: false, error: authResult.error || "로그인이 필요합니다" },
        { status }
      );
    }

    // 1) 기존 auto_channels 의 channel_id 집합(중복 방지)
    const existingIds = new Set();
    try {
      const chSnap = await adminDb.collection(CHANNELS).get();
      for (const d of chSnap.docs) {
        const cid = d.data() && d.data().channel_id;
        if (cid) existingIds.add(cid);
      }
    } catch (e) {
      console.error("[import-from-markers] 기존 채널 조회 실패:", e); // TODO: 배포 전 제거
    }

    // 2) markers 순회:
    //    - channel_id 있는 마커 → byChannel 에 바로 담는다.
    //    - channel_id 없지만 video_id 있는 마커 → 역추적 대상으로 video_id 수집.
    const byChannel = new Map(); // channel_id → channel_name (대표)
    const videoToName = new Map(); // video_id → 마커 장소명(역추적 실패 시 참고용, 지금은 채널명 우선)
    let noChannelNoVideo = 0; // 채널ID·영상ID 둘 다 없어 손댈 수 없는 마커
    try {
      const mSnap = await adminDb.collection(MARKERS).get();
      for (const d of mSnap.docs) {
        const data = d.data() || {};
        const cid = String(data.youtube_channel_id || "").trim();
        if (cid) {
          if (!byChannel.has(cid)) {
            byChannel.set(cid, String(data.youtube_channel_name || "").trim());
          }
          continue;
        }
        const vid = String(data.youtube_video_id || "").trim();
        if (vid) {
          if (!videoToName.has(vid)) {
            videoToName.set(vid, String(data.location || "").trim());
          }
        } else {
          noChannelNoVideo += 1;
        }
      }
    } catch (e) {
      console.error("[import-from-markers] 마커 조회 실패:", e); // TODO: 배포 전 제거
      return Response.json(
        { ok: false, error: "마커 조회에 실패했습니다" },
        { status: 500 }
      );
    }

    // 3) 영상ID → 채널 역추적 (videos.list 배치, 약 ceil(영상수/50) 유닛)
    const distinctVideoIds = Array.from(videoToName.keys());
    const videosListUnits = Math.ceil(distinctVideoIds.length / 50);
    let resolvedFromVideos = 0; // 역추적으로 새로 알아낸 채널(마커) 수
    let unresolvedVideos = 0; // 삭제/비공개라 채널을 못 알아낸 영상 수
    if (distinctVideoIds.length > 0) {
      const infoMap = await getVideosChannelInfo(distinctVideoIds);
      for (const vid of distinctVideoIds) {
        const info = infoMap.get(vid);
        if (info && info.channelId) {
          resolvedFromVideos += 1;
          if (!byChannel.has(info.channelId)) {
            byChannel.set(info.channelId, info.channelName || "");
          }
        } else {
          unresolvedVideos += 1;
        }
      }
    }

    // 4) 신규 채널만 등록 (배치). 이미 auto_channels 에 있는 채널은 제외.
    const now = FieldValue.serverTimestamp();
    let created = 0;
    let skippedExisting = 0;
    const toCreate = [];
    for (const [cid, name] of byChannel.entries()) {
      if (existingIds.has(cid)) {
        skippedExisting += 1;
        continue;
      }
      toCreate.push({ cid, name });
    }

    for (let i = 0; i < toCreate.length; i += 450) {
      const batch = adminDb.batch();
      for (const { cid, name } of toCreate.slice(i, i + 450)) {
        const ref = adminDb.collection(CHANNELS).doc();
        batch.set(ref, {
          channel_id: cid,
          handle: "",
          channel_name: name || cid,
          is_active: true,
          source: "imported",
          last_seen_video_at: null,
          created_at: now,
          updated_at: now,
        });
        created += 1;
      }
      await batch.commit();
    }

    try {
      revalidateTag("auto-markers");
    } catch (revalErr) {
      console.error("[import-from-markers] 재검증 실패:", revalErr); // TODO: 배포 전 제거
    }

    return Response.json(
      {
        ok: true,
        created,
        skippedExisting,
        resolvedFromVideos, // 영상 링크로 채널을 되찾은 마커 수
        unresolvedVideos, // 삭제/비공개라 채널을 못 찾은 영상 수
        skippedNoChannelId: noChannelNoVideo, // 채널ID·영상ID 둘 다 없어 손댈 수 없던 마커
        videosListUnits, // 이번에 쓴 YouTube videos.list 유닛(≈영상수/50)
        message:
          `${created}개 채널을 새로 등록했습니다` +
          (videosListUnits > 0
            ? ` (영상 링크로 ${resolvedFromVideos}개 역추적, YouTube ${videosListUnits}유닛 사용).`
            : ".") +
          ` "지금 스캔"을 누르면 영상이 채워집니다.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/auto-channels/import-from-markers][POST] 에러:", error); // TODO: 배포 전 제거
    return Response.json(
      { ok: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
