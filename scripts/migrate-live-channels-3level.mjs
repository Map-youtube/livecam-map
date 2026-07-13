// ─────────────────────────────────────────────────────────────
// migrate-live-channels-3level.mjs
//   기존 라이브 채널(구 2단계: 대분류 방송 / 소분류 국가)을
//   신 3단계(대분류 방송 / 중분류 국가 / 소분류 채널이름)로 전환한다.
//
// 배경: 3단계 도입 전 등록된 방송 채널들은 minor_category 에 "국가"(미국/한국)가,
//   middle_category 는 비어 있다. 이 상태면 같은 국가의 여러 채널이 하나의 소분류로
//   묶여, 채널 마커를 눌러도 그 국가의 모든 채널(예: CNN)이 함께 열린다.
//   → 국가를 중분류로 옮기고, 소분류를 "채널 이름"으로 바꿔 채널별로 분리한다.
//
// 대상: channel_type !== "iss"(=고정 방송 채널) 이면서 middle_category 가 비어 있고
//       minor_category 가 있는 문서.
//   변환: middle_category = 기존 minor_category(국가)
//         minor_category  = channel_name (없으면 handle/channel_id)
//   (이미 middle_category 가 있는 문서는 3단계로 등록된 것이므로 건드리지 않는다.)
//
// 사용법(프로젝트 루트에서):
//   미리보기(변경 없음): node scripts/migrate-live-channels-3level.mjs
//   실제 적용:           node scripts/migrate-live-channels-3level.mjs --apply
//   환경변수(FIREBASE_SERVICE_ACCOUNT_KEY 등)는 .env.local 에서 읽어온다.
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
    console.log("[migrate] .env.local 로드 완료");
  } catch (error) {
    console.error("[migrate] .env.local 로드 실패:", error.message);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvLocal();

  const { adminDb } = await import("../src/lib/firebaseAdmin.js");
  const { FieldValue } = await import("firebase-admin/firestore");

  const col = adminDb.collection("live_channels");
  const snap = await col.get();

  const plan = [];
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    // ISS(추적 특수 채널)는 2단계 유지 → 제외
    if (d.channel_type === "iss") continue;
    // 이미 중분류가 있으면(3단계로 등록됨) 건드리지 않는다
    if (d.middle_category && String(d.middle_category).trim()) continue;
    const oldMinor = String(d.minor_category || "").trim(); // 국가로 쓰이던 값
    if (!oldMinor) continue; // 소분류가 비어 있으면 전환 대상 아님

    const newMinor =
      String(d.channel_name || "").trim() ||
      String(d.handle || "").trim() ||
      String(d.channel_id || "").trim();
    if (!newMinor) continue; // 채널 이름을 알 수 없으면 건너뜀(안전)

    plan.push({
      id: doc.id,
      channel_name: d.channel_name || "",
      before: `${d.major_category || ""} > ${oldMinor}`,
      after: `${d.major_category || ""} > ${oldMinor} > ${newMinor}`,
      update: { middle_category: oldMinor, minor_category: newMinor },
    });
  }

  if (plan.length === 0) {
    console.log("[migrate] 전환할 채널이 없습니다. (이미 3단계이거나 대상 없음)");
    return;
  }

  console.log(`[migrate] 전환 대상 ${plan.length}개:`);
  for (const p of plan) {
    console.log(`  - ${p.channel_name}\n      전: ${p.before}\n      후: ${p.after}`);
  }

  if (!apply) {
    console.log("\n[migrate] 미리보기 모드입니다. 실제 적용하려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  const batch = adminDb.batch();
  const now = FieldValue.serverTimestamp();
  for (const p of plan) {
    batch.update(col.doc(p.id), { ...p.update, updated_at: now });
  }
  await batch.commit();
  console.log(`\n[migrate] 완료: ${plan.length}개 채널을 3단계로 전환했습니다.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[migrate] 실패:", error);
    process.exit(1);
  });
