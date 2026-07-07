// ─────────────────────────────────────────────────────────────
// 기본 태그 시드 스크립트 (일회성, 재실행 안전)
//
// Firestore "tags" 컬렉션에 기본 특성 태그를 심는다.
// 이미 같은 이름의 태그가 있으면 건너뛴다(중복 생성 방지 → 여러 번 실행해도 안전).
//
// 실행: node scripts/seedTags.js  (프로젝트 루트에서)
//   - .env.local 의 FIREBASE_SERVICE_ACCOUNT_KEY 를 직접 읽어 firebase-admin 초기화.
//
// ⚠️ 유튜브/AI API 를 호출하지 않는다. Firestore 쓰기만 수행 → 추가 비용 없음.
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// ─── .env.local 에서 서비스 계정 JSON 로드 ────────────────────
function loadServiceAccount() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  const line = text
    .split(/\r?\n/)
    .find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  if (!line) {
    throw new Error(".env.local 에서 FIREBASE_SERVICE_ACCOUNT_KEY 를 찾지 못했습니다.");
  }
  let raw = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length).trim();
  // 감싸는 작은따옴표 제거
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
  const sa = JSON.parse(raw);
  // private_key 의 리터럴 \n 을 실제 줄바꿈으로 복원
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

// ─── 심을 기본 태그 목록 ───────────────────────────────────────
const DEFAULT_TAGS = [
  "공항", "동물", "수족관", "천문", "바/레스토랑", "만(바다)", "해변",
  "조류급식장", "조류", "보트", "다리", "비즈니스", "크리스마스", "교회",
  "도시전경", "공사현장", "제방", "물고기", "낚시", "분수", "정원", "항구",
  "호텔", "섬", "호수", "풍경", "마리나", "기념물", "산", "박물관", "자연",
  "새해맞이", "공원", "종교", "강", "바다전경", "상점", "명소", "스키장",
  "스포츠", "광장", "서핑", "수영장", "교통", "기차", "수중", "화산",
  "날씨", "야생동물", "동물원",
];

async function main() {
  try {
    const serviceAccount = loadServiceAccount();
    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({ credential: cert(serviceAccount) });

    const db = getFirestore(app);
    const col = db.collection("tags");

    let created = 0;
    let skipped = 0;

    for (const rawName of DEFAULT_TAGS) {
      const name = rawName.trim();
      if (!name) continue;

      // 같은 이름(정확 일치)이 이미 있으면 건너뛴다
      const snap = await col.where("name", "==", name).limit(1).get();
      if (!snap.empty) {
        skipped++;
        continue;
      }

      await col.add({
        name,
        created_at: FieldValue.serverTimestamp(),
      });
      created++;
    }

    console.log(`시드 완료 — 생성: ${created}개, 건너뜀(이미 존재): ${skipped}개`);
    process.exit(0);
  } catch (error) {
    console.error("시드 실패:", error.message);
    process.exit(1);
  }
}

main();
