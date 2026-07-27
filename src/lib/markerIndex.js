// ─────────────────────────────────────────────────────────────
// markerIndex — 공개 마커 "청크 인덱스" (서버 전용)
//
// 왜 필요한가 (2026-07-26, 대량 확장 대비):
//   지금까지는 홈 지도·사이트맵·헤더 네비·국가/대륙 목록이 필요할 때마다 markers +
//   auto_markers 컬렉션을 "통째로" 읽었다. 마커가 늘수록 이 전체 스캔 1회의 비용이 그대로
//   커져서(마커 3만 개 = 스캔 1회에 3만 읽기), 재계산이 하루 수십 번 일어나면 무료 한도
//   (5만 읽기/일)를 수십 배 초과한다. 게다가 대륙별 스냅샷 1개가 Firestore 문서 한도(1MB)를
//   넘어가 저장이 실패하면, 매 렌더가 다시 전체 스캔으로 되돌아가는 최악 상태가 된다.
//
// 해결(이 파일):
//   공개 마커 전체를 "1MB 미만 청크 문서 여러 개"(marker_index/chunk_N)에 저장해 두고,
//   읽을 때는 컬렉션 스캔 대신 이 청크 문서 몇 개만 읽는다.
//     - 마커 3만 개여도 읽기는 "청크 수"(수십 개)로 고정 — 마커 수와 무관.
//   갱신은 "증분(incremental)"이 기본이다:
//     - 마지막 동기화 이후 updated_at 이 바뀐 문서만 조회해 청크에 반영한다.
//       → 평소엔 바뀐 게 없으므로 조회 결과 0건(사실상 읽기 없음).
//     - 7일에 한 번은 전체 재구축(full)으로 정합성을 맞춘다(하드 삭제 등 증분이 놓치는 변화 반영).
//
// 저장 구조 (컬렉션 marker_index):
//   meta      : { chunk_count, total, last_sync_ms, last_full_ms, updated_at }
//   chunk_0.. : { markers: [ ...공개 마커 객체... ] }   ← 각 문서 600KB 이하로 분할
//
// ⚠️ 저장하는 마커 객체는 기존 getPublicMarkers/getAutoMarkers 가 반환하던 것과 "완전히 동일"하다
//    (필드를 빼지 않는다). 소비하는 화면(홈 지도/트리/SEO 목록)의 동작이 달라지지 않게 하기 위함.
// ⚠️ 표시 규칙(공개 여부·중복 제거)도 기존과 동일하게 이 파일 안에서 한 번에 적용한다:
//      수동: is_active !== false && auto_disabled !== true
//      자동: is_live === true && is_active !== false && auto_disabled !== true && lat/lng 숫자
//      중복: 같은 youtube_video_id 가 수동에 있으면 자동 쪽 제외(수동 우선)
// ⚠️ 마커 상세 페이지는 이 인덱스를 쓰지 않고 여전히 문서를 직접 읽으므로(getPublicMarkerById),
//    인덱스가 잠깐 낡아도 상세 페이지는 항상 최신이다.
// ─────────────────────────────────────────────────────────────

import { cache } from "react";
import { adminDb } from "@/lib/firebaseAdmin";
import { hasLocation } from "@/lib/hasLocation";

const COLLECTION = "marker_index";
const META_DOC = "meta";
const CHUNK_PREFIX = "chunk_";

// 문서 1개 목표 크기(Firestore 한도 1MB 대비 충분한 여유). 초과 전에 다음 청크로 넘긴다.
const MAX_CHUNK_BYTES = 600 * 1024;
// 증분 동기화 주기: 이 시간이 지난 뒤 읽기 요청이 오면 "바뀐 것만" 반영한다.
const SYNC_INTERVAL_MS = 60 * 1000; // 60초
// 전체 재구축 주기: 증분이 놓치는 변화(하드 삭제 등)를 정기적으로 정합화.
const FULL_REBUILD_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// ─── 직렬화 (기존 getPublicMarkers/getAutoMarkers 와 동일 규칙) ──
function toPlainValue(value) {
  try {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value._seconds === "number") return value._seconds * 1000;
    return value;
  } catch (error) {
    return null;
  }
}

function serializeMarker(id, data) {
  const out = { id };
  try {
    for (const [key, val] of Object.entries(data || {})) {
      out[key] = toPlainValue(val);
    }
  } catch (error) {
    console.error("[markerIndex] 직렬화 실패:", id, error); // TODO: 배포 전 제거
  }
  return out;
}

// ─── 공개 여부 판정 (기존 규칙 + 장소 특정 여부) ───────────────
// ⚠️ hasLocation: continent 가 비어있으면(AI 가 장소를 특정 못 함) 카테고리 트리에
//    "unknown" 가지를 만들므로 공개 목록에서 제외한다(hasLocation.js 주석 참고).
function manualVisible(m) {
  return !!m && m.is_active !== false && m.auto_disabled !== true && hasLocation(m);
}
function autoVisible(m) {
  return (
    !!m &&
    m.is_live === true &&
    m.is_active !== false &&
    hasLocation(m) &&
    m.auto_disabled !== true &&
    typeof m.lat === "number" &&
    typeof m.lng === "number"
  );
}

// updated_at(ms) 최댓값 — 증분 동기화의 다음 기준점
function maxUpdatedMs(list) {
  let max = 0;
  for (const m of list) {
    const v = typeof m.updated_at === "number" ? m.updated_at : 0;
    if (v > max) max = v;
  }
  return max;
}

// 수동 ∪ 자동 을 "공개 규칙 + 전역 중복제거"로 합친다 (기존 getMapMarkers 와 동일 결과)
function combinePublic(manualAll, autoAll) {
  const manual = manualAll.filter(manualVisible);
  const manualVideoIds = new Set(
    manual.map((m) => m.youtube_video_id).filter(Boolean)
  );
  const auto = autoAll
    .filter(autoVisible)
    .filter(
      (m) => !(m.youtube_video_id && manualVideoIds.has(m.youtube_video_id))
    );
  return [...manual, ...auto];
}

// ─── 청크 쓰기 ────────────────────────────────────────────────
// markers 배열을 600KB 이하 청크로 나눠 저장하고 meta 를 갱신한다.
// 이전보다 청크 수가 줄면 남는 청크 문서를 삭제해 낡은 데이터가 읽히지 않게 한다.
async function writeChunks(markers, { lastSyncMs, lastFullMs, prevChunkCount }) {
  const chunks = [];
  let cur = [];
  let curBytes = 0;
  for (const m of markers) {
    let size = 0;
    try {
      size = JSON.stringify(m).length;
    } catch (error) {
      size = 1000; // 직렬화 실패 시 보수적으로 큰 값 가정
    }
    if (cur.length > 0 && curBytes + size > MAX_CHUNK_BYTES) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(m);
    curBytes += size;
  }
  if (cur.length > 0) chunks.push(cur);
  if (chunks.length === 0) chunks.push([]); // 마커 0개여도 청크 1개는 유지

  const batch = adminDb.batch();
  chunks.forEach((list, i) => {
    batch.set(adminDb.collection(COLLECTION).doc(`${CHUNK_PREFIX}${i}`), {
      markers: list,
      count: list.length,
      updated_at: new Date(),
    });
  });
  // 줄어든 청크 정리
  const prev = typeof prevChunkCount === "number" ? prevChunkCount : 0;
  for (let i = chunks.length; i < prev; i++) {
    batch.delete(adminDb.collection(COLLECTION).doc(`${CHUNK_PREFIX}${i}`));
  }
  batch.set(adminDb.collection(COLLECTION).doc(META_DOC), {
    chunk_count: chunks.length,
    total: markers.length,
    last_sync_ms: lastSyncMs,
    last_full_ms: lastFullMs,
    updated_at: new Date(),
  });
  await batch.commit();

  return { chunkCount: chunks.length, total: markers.length };
}

async function readMeta() {
  try {
    const snap = await adminDb.collection(COLLECTION).doc(META_DOC).get();
    if (!snap.exists) return null;
    return snap.data() || null;
  } catch (error) {
    console.error("[markerIndex] meta 읽기 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 전체 재구축 ──────────────────────────────────────────────
// 컬렉션 2개를 통째로 읽는 유일한 지점(7일에 1번, 또는 인덱스가 없을 때).
export async function buildMarkerIndex() {
  const [manualSnap, autoSnap] = await Promise.all([
    adminDb.collection("markers").get(),
    adminDb.collection("auto_markers").get(),
  ]);
  const manualAll = manualSnap.docs.map((d) => serializeMarker(d.id, d.data()));
  const autoAll = autoSnap.docs.map((d) => serializeMarker(d.id, d.data()));

  // 다음 증분의 기준점은 "숨김 문서 포함" 전체의 최신 updated_at 이어야 한다
  // (숨겨진 문서가 나중에 공개로 바뀌는 변화를 놓치지 않기 위함).
  const syncMs = Math.max(maxUpdatedMs(manualAll), maxUpdatedMs(autoAll), 0);
  const combined = combinePublic(manualAll, autoAll);

  const prev = await readMeta();
  const now = Date.now();
  const res = await writeChunks(combined, {
    lastSyncMs: syncMs || now,
    lastFullMs: now,
    prevChunkCount: prev && prev.chunk_count,
  });
  return { mode: "full", ...res, scanned: manualAll.length + autoAll.length };
}

// ─── 증분 동기화 ──────────────────────────────────────────────
// 마지막 동기화 이후 updated_at 이 바뀐 문서만 읽어 청크에 반영한다.
// 바뀐 게 없으면 청크를 읽지도, 쓰지도 않는다(가장 흔한 경우 → 사실상 비용 0).
export async function syncMarkerIndex() {
  const meta = await readMeta();
  const now = Date.now();

  // 인덱스가 없거나, 전체 재구축 주기가 지났으면 full
  if (!meta || !meta.chunk_count) return buildMarkerIndex();
  if (now - (meta.last_full_ms || 0) > FULL_REBUILD_MS) return buildMarkerIndex();

  const since = new Date(meta.last_sync_ms || 0);
  let manualChanged = [];
  let autoChanged = [];
  try {
    const [mSnap, aSnap] = await Promise.all([
      adminDb.collection("markers").where("updated_at", ">", since).get(),
      adminDb.collection("auto_markers").where("updated_at", ">", since).get(),
    ]);
    manualChanged = mSnap.docs.map((d) => serializeMarker(d.id, d.data()));
    autoChanged = aSnap.docs.map((d) => serializeMarker(d.id, d.data()));
  } catch (error) {
    // updated_at 필드/인덱스 문제 등 → 안전하게 전체 재구축으로 폴백
    console.error("[markerIndex] 증분 조회 실패 → 전체 재구축:", error); // TODO: 배포 전 제거
    return buildMarkerIndex();
  }

  const changedCount = manualChanged.length + autoChanged.length;
  if (changedCount === 0) {
    // 변화 없음: 다음 확인 시각만 갱신(청크는 그대로) → 읽기/쓰기 최소화
    try {
      await adminDb
        .collection(COLLECTION)
        .doc(META_DOC)
        .set({ last_sync_ms: now, updated_at: new Date() }, { merge: true });
    } catch (error) {
      /* 갱신 실패는 무시 — 다음 요청에서 다시 시도 */
    }
    return { mode: "incremental", changed: 0, total: meta.total || 0 };
  }

  // 바뀐 게 있으면 현재 청크를 읽어 병합한다(청크 수만큼만 읽음 — 컬렉션 스캔 아님).
  const current = (await fetchIndexMarkersRaw(meta)) || [];

  // id → 마커 맵으로 만들고, 바뀐 문서로 갱신/삭제한다.
  const byId = new Map(current.map((m) => [m.id, m]));
  // 바뀐 문서는 일단 전부 제거한 뒤, 공개 대상만 다시 넣는다(숨김 처리도 자연히 반영).
  for (const m of [...manualChanged, ...autoChanged]) byId.delete(m.id);

  // 기존 목록에서 수동/자동을 구분하기 위해, 바뀐 문서들을 규칙에 맞춰 필터한다.
  const visibleManualChanged = manualChanged.filter(manualVisible);
  const visibleAutoChanged = autoChanged.filter(autoVisible);
  for (const m of [...visibleManualChanged, ...visibleAutoChanged]) {
    byId.set(m.id, m);
  }

  // 전역 중복 제거를 다시 적용(수동 우선). 인덱스에 들어있는 "수동 마커"의 video_id 기준.
  const merged = [...byId.values()];
  const manualVideoIds = new Set(
    merged
      .filter((m) => m && m.youtube_video_id && isManualDoc(m))
      .map((m) => m.youtube_video_id)
  );
  const deduped = merged.filter((m) => {
    if (!m) return false;
    if (isManualDoc(m)) return true;
    return !(m.youtube_video_id && manualVideoIds.has(m.youtube_video_id));
  });

  const syncMs =
    Math.max(
      maxUpdatedMs(manualChanged),
      maxUpdatedMs(autoChanged),
      meta.last_sync_ms || 0
    ) || now;

  const res = await writeChunks(deduped, {
    lastSyncMs: syncMs,
    lastFullMs: meta.last_full_ms || now,
    prevChunkCount: meta.chunk_count,
  });
  return { mode: "incremental", changed: changedCount, ...res };
}

// 수동 마커인지 판정: 자동 마커에만 있는 필드(source_channel_id / ai_enriched)로 구분한다.
//   (auto_markers 문서는 스캔이 항상 source_channel_id 를 넣는다)
function isManualDoc(m) {
  return !(m && (m.source_channel_id || m.ai_enriched === true));
}

// ─── 읽기 ─────────────────────────────────────────────────────
// meta 의 chunk_count 만큼 청크 문서를 한 번에 읽어 마커 배열로 되돌린다.
async function fetchIndexMarkersRaw(meta) {
  try {
    const n = (meta && meta.chunk_count) || 0;
    if (!n) return null;
    const refs = [];
    for (let i = 0; i < n; i++) {
      refs.push(adminDb.collection(COLLECTION).doc(`${CHUNK_PREFIX}${i}`));
    }
    const snaps = await adminDb.getAll(...refs);
    const out = [];
    for (const s of snaps) {
      const d = s.exists ? s.data() : null;
      if (d && Array.isArray(d.markers)) out.push(...d.markers);
    }
    return out;
  } catch (error) {
    console.error("[markerIndex] 청크 읽기 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// 공개 마커 전체를 인덱스에서 가져온다.
//   - 인덱스가 없으면 최초 1회 전체 재구축을 수행한다.
//   - 마지막 동기화가 SYNC_INTERVAL_MS 보다 오래됐으면 증분 동기화를 먼저 수행한다
//     (변화 없으면 조회 0건이라 비용이 사실상 없다).
//   - 실패하면 null 을 반환한다 → 호출부가 기존 방식(컬렉션 스캔)으로 폴백한다.
async function fetchIndexedPublicMarkers() {
  try {
    let meta = await readMeta();

    if (!meta || !meta.chunk_count) {
      // 인덱스 최초 생성
      await buildMarkerIndex();
      meta = await readMeta();
      if (!meta) return null;
    } else if (Date.now() - (meta.last_sync_ms || 0) > SYNC_INTERVAL_MS) {
      // 낡았으면 증분 동기화 후 meta 재확인
      try {
        await syncMarkerIndex();
        meta = (await readMeta()) || meta;
      } catch (error) {
        console.error("[markerIndex] 동기화 실패(기존 청크 사용):", error); // TODO: 배포 전 제거
      }
    }

    const list = await fetchIndexMarkersRaw(meta);
    return Array.isArray(list) ? list : null;
  } catch (error) {
    console.error("[markerIndex] 인덱스 조회 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// 같은 렌더(요청) 안에서는 실제 조회를 1번만 수행한다.
//   (한 페이지가 메타데이터+본문+관련목록에서 여러 번 불러도 청크 읽기는 1회)
export const getIndexedPublicMarkers = cache(fetchIndexedPublicMarkers);
