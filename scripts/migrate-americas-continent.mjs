// ─────────────────────────────────────────────────────────────
// migrate-americas-continent.mjs — 기존 "americas" 마커를 북/남아메리카로 재분류
//
// 아메리카 대륙을 north_america / south_america 로 분리하면서,
// Firestore markers 컬렉션에 continent:"americas" 로 저장된 기존 문서들을
// 각 문서의 country 필드 → continentUtils 새 매핑에 대조해 일괄 업데이트한다.
//
// ⚠️ 이 스크립트는 "1회성 로컬 관리 작업"이다. 배포 코드가 아니며, 실행 후 삭제/보관은 자유.
//
// 사용법(프로젝트 루트에서):
//   1) 먼저 몇 건이 대상인지 확인만 (실제 변경 없음):
//        node scripts/migrate-americas-continent.mjs
//   2) 결과 확인 후 실제 업데이트:
//        node scripts/migrate-americas-continent.mjs --apply
//
// 환경변수(FIREBASE_SERVICE_ACCOUNT_KEY 등)는 .env.local 에서 읽어온다.
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
      // 양쪽 따옴표 제거
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

  // env 설정 후 동적 import (firebaseAdmin 은 모듈 로드시 즉시 초기화되므로 순서 중요)
  const { adminDb } = await import("../src/lib/firebaseAdmin.js");
  const { getContinentByCountry } = await import(
    "../src/lib/continentUtils.js"
  );

  console.log(
    apply
      ? "[migrate] --apply 모드: 실제 업데이트를 진행합니다."
      : "[migrate] 미리보기 모드: 대상 건수만 확인합니다 (--apply 로 실제 변경)."
  );

  // continent === "americas" 인 문서 조회
  const snapshot = await adminDb
    .collection("markers")
    .where("continent", "==", "americas")
    .get();

  console.log(`[migrate] continent="americas" 문서: ${snapshot.size}건`);
  if (snapshot.size === 0) {
    console.log("[migrate] 대상 없음. 종료합니다.");
    return;
  }

  // 각 문서의 새 대륙 계산
  const plan = []; // { id, country, newContinent }
  let unresolved = 0;
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data() || {};
      const country = data.country || "";
      const newContinent = getContinentByCountry(country); // north_america | south_america | null
      if (
        newContinent === "north_america" ||
        newContinent === "south_america"
      ) {
        plan.push({ id: doc.id, country, newContinent });
      } else {
        // 매핑에 없는 국가코드 → 수동 확인 필요
        unresolved += 1;
        console.warn(
          `[migrate] ⚠️ 재분류 불가(수동 확인 필요): id=${doc.id} country="${country}"`
        );
      }
    } catch (innerError) {
      console.error("[migrate] 문서 처리 실패:", innerError);
    }
  }

  // 미리보기 요약
  const na = plan.filter((p) => p.newContinent === "north_america").length;
  const sa = plan.filter((p) => p.newContinent === "south_america").length;
  console.log(
    `[migrate] 재분류 예정 → 북아메리카 ${na}건 / 남아메리카 ${sa}건 / 미해결 ${unresolved}건`
  );

  if (!apply) {
    console.log(
      "[migrate] 미리보기 종료. 위 내용이 맞으면 `--apply` 로 다시 실행하세요."
    );
    return;
  }

  // 실제 업데이트 (배치 400개씩)
  let updated = 0;
  for (let i = 0; i < plan.length; i += 400) {
    const batch = adminDb.batch();
    for (const item of plan.slice(i, i + 400)) {
      const ref = adminDb.collection("markers").doc(item.id);
      batch.update(ref, { continent: item.newContinent });
    }
    await batch.commit();
    updated += Math.min(400, plan.length - i);
    console.log(`[migrate] ${updated}/${plan.length} 업데이트 완료`);
  }

  console.log(
    `[migrate] ✅ 완료: 총 ${updated}건 업데이트 (미해결 ${unresolved}건은 관리자 페이지에서 수동 수정 필요).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[migrate] 실행 중 오류:", error);
    process.exit(1);
  });
