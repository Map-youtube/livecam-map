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

// ─── 상시 라벨 텍스트 포맷 (카테고리별 추가 정보 포함) ────────
// EONET geometry 에 이미 들어있는 magnitudeValue/magnitudeUnit 을 활용해
// 태풍(최대풍속)·산불(면적) 등 추가 정보를 이름 옆에 상시 표시한다.
//   - severeStorms + 규모값: "🌀 {title} · 최대풍속 {value}{unit}"
//   - wildfires   + 규모값: "🔥 {title} · {value(천단위)}{unit}"
//   - seaLakeIce           : "🧊 {title}" (규모 데이터 보통 없음)
//   - 그 외 / 규모값 없음   : "{이모지} {title}"  (빈 규모 노출 금지)
// t: 현재 언어 번역 함수(선택). 없으면 "최대풍속"(한국어) 기본값.
export function formatEventLabel(event, t) {
  try {
    if (!event) return "";
    const emoji = getEventIcon(event.category);
    const title = String(event.title || "").trim();
    const value = event.magnitudeValue;
    const unit = event.magnitudeUnit ? String(event.magnitudeUnit) : "";
    const hasMag = typeof value === "number" && !Number.isNaN(value);
    const maxWindLabel =
      typeof t === "function" ? t("maxWindSpeed") : "최대풍속";

    if (event.category === "severeStorms" && hasMag) {
      return `${emoji} ${title} · ${maxWindLabel} ${value}${unit}`;
    }
    if (event.category === "wildfires" && hasMag) {
      return `${emoji} ${title} · ${value.toLocaleString()}${unit}`;
    }
    if (event.category === "seaLakeIce") {
      return `${emoji} ${title}`;
    }
    // 그 외 카테고리 또는 규모값 없음 → 이름만
    return `${emoji} ${title}`;
  } catch (error) {
    console.error("[naturalEventsUtils] formatEventLabel 에러:", error); // TODO: 배포 전 제거
    return "";
  }
}
