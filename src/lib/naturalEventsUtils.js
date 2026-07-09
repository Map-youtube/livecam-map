// ─────────────────────────────────────────────────────────────
// naturalEventsUtils — NASA EONET 자연재해 카테고리별 아이콘 매핑
//
// getEventIcon(categoryId): EONET 카테고리 id → 이모지 아이콘 반환.
//   wildfires🔥 / volcanoes🌋 / severeStorms🌀 / floods🌊 / landslides⛰️ / seaLakeIce🧊
//   그 외(매핑 없음)는 📍 기본 아이콘.
// ─────────────────────────────────────────────────────────────

// EONET 카테고리 id → 이모지
const CATEGORY_ICONS = {
  wildfires: "🔥",
  volcanoes: "🌋",
  severeStorms: "🌀",
  floods: "🌊",
  landslides: "⛰️",
  seaLakeIce: "🧊",
};

// ─── 카테고리 id → 아이콘 이모지 ─────────────────────────────
export function getEventIcon(categoryId) {
  try {
    const key = String(categoryId || "").trim();
    return CATEGORY_ICONS[key] || "📍";
  } catch (error) {
    console.error("[naturalEventsUtils] getEventIcon 에러:", error); // TODO: 배포 전 제거
    return "📍";
  }
}
