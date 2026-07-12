// ─────────────────────────────────────────────────────────────
// seed-iss-channel.mjs — ISS(NASA) 를 live_channels 컬렉션의 특수 채널로 시드
//
// "통합" 결정에 따라, 하드코딩돼 있던 우주>ISS 를 새 자동 라이브 채널 시스템의
// 데이터(대분류 "우주" / 소분류 "ISS", channel_type:"iss")로 넣는다.
//   - channel_type:"iss" → 고정 마커가 아니라 기존 ISS 실시간 추적 마커로 표시.
//   - fallback_video_ids → 24/7 ISS 라이브(오래 켜둔 스트림)를 항상 후보에 포함.
//
// 사용법(프로젝트 루트에서):
//   미리보기(변경 없음): node scripts/seed-iss-channel.mjs
//   실제 적용:           node scripts/seed-iss-channel.mjs --apply
//   환경변수(FIREBASE_SERVICE_ACCOUNT_KEY 등)는 .env.local 에서 읽어온다.
// ⚠️ 이미 같은 channel_id 의 ISS 채널이 있으면 새로 만들지 않는다(중복 방지).
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── .env.local 로드 (firebaseAdmin 이 process.env 를 참조하므로 import 전에 설정) ──
function loadEnvLocal() {
  try {
    const path = join(process.cwd(), ".env.local");
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    console.log("[seed] .env.local 로드 완료");
  } catch (error) {
    console.error("[seed] .env.local 로드 실패:", error.message);
  }
}

// ISS(NASA) 채널 시드 값
const ISS_CHANNEL = {
  channel_id: "UCLA_DiR1FfKNvjuUpBHmylQ", // 기존 iss 라우트가 RSS 에 쓰던 NASA 채널 ID
  handle: "@NASA",
  channel_name: "NASA",
  major_category: "우주",
  minor_category: "ISS",
  channel_type: "iss", // 고정 마커가 아니라 실시간 추적 마커
  fallback_video_ids: [
    "awQzjn72bI0", // Live High-Definition Views from the ISS
    "uwXgcTc8oY8", // Live Video from the International Space Station
    "DIgkvm2nmHc",
    "P9C25Un7xaM",
    "21X5lGlDOfg",
  ],
  lat: null, // ISS 는 고정 위치가 없음(추적)
  lng: null,
  is_active: true,
};

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvLocal();

  // env 설정 후 동적 import (firebaseAdmin 은 모듈 로드시 즉시 초기화되므로 순서 중요)
  const { adminDb } = await import("../src/lib/firebaseAdmin.js");
  const { FieldValue } = await import("firebase-admin/firestore");

  const col = adminDb.collection("live_channels");

  // 중복 확인 (channel_id 기준)
  const dup = await col
    .where("channel_id", "==", ISS_CHANNEL.channel_id)
    .limit(1)
    .get();
  if (!dup.empty) {
    console.log(
      "[seed] 이미 ISS 채널이 존재합니다 (docId:",
      dup.docs[0].id,
      "). 아무 것도 하지 않습니다."
    );
    return;
  }

  if (!apply) {
    console.log(
      "[seed] 미리보기 모드: 아래 문서를 추가할 예정입니다 (--apply 로 실제 적용)."
    );
    console.log(JSON.stringify(ISS_CHANNEL, null, 2));
    return;
  }

  const now = FieldValue.serverTimestamp();
  const ref = await col.add({
    ...ISS_CHANNEL,
    created_at: now,
    updated_at: now,
  });
  console.log("[seed] ISS 채널 추가 완료. docId:", ref.id);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] 실패:", error);
    process.exit(1);
  });
