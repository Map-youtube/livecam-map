// ─────────────────────────────────────────────────────────────
// markerDesc — 마커(영상)의 "표시용 설명" 한 곳에서 뽑기 (클라이언트 안전, 순수 함수)
//
// 우선순위: description.ko → description.en → description(문자열) → youtube_description.
//   VideoListPanel(표시)과 MainMapView(번역 배치)가 "완전히 같은 문자열"을 쓰도록
//   이 함수를 공용으로 사용한다(둘이 달라지면 번역 매칭이 깨진다).
// ─────────────────────────────────────────────────────────────

export function pickVideoDesc(marker) {
  try {
    if (!marker) return "";
    const d = marker.description;
    let text = "";
    if (d && typeof d === "object") {
      text = d.ko || d.en || "";
    } else if (typeof d === "string") {
      text = d;
    }
    if (!text) text = marker.youtube_description || "";
    return String(text || "").trim();
  } catch (error) {
    return "";
  }
}
