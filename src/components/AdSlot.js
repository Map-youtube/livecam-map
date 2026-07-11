// ─────────────────────────────────────────────────────────────
// AdSlot — 광고 슬롯 (공용)
//
// 실제 광고 코드(Klook 제휴 배너 / 애드센스 등)를 담는 래퍼.
// 광고 코드가 없으면 "광고 영역" 자리표시(placeholder)를 보여준다.
//
// ※ 배너별 "제휴 링크" 개별 라벨은 제거함(배너형 광고는 시각적으로 이미 광고임이
//    명확하여 별도 표시 불필요). 사이트 전체 수익 구조 고지는 푸터의 "제휴 링크 고지"
//    페이지(/affiliate-disclosure)로 대체한다.
//
// props:
//   - orientation : "horizontal"(가로 배너) | "vertical"(세로 배너) — 자리표시 안내문/기본 크기 문구
//   - children    : 실제 광고 마크업(있으면 자리표시 대신 이것을 렌더)
//   - className   : 바깥 컨테이너 추가 클래스(부모가 크기를 지정)
// ─────────────────────────────────────────────────────────────

export default function AdSlot({
  orientation = "horizontal",
  children,
  className = "",
}) {
  const isVertical = orientation === "vertical";

  return (
    <div
      className={
        "relative flex h-full w-full bg-surface " +
        // 세로 배너(120×600)는 영역 세로 기준 가운데 정렬(+ 화면이 짧을 때를 대비해 세로 스크롤).
        // 가로 배너도 중앙 정렬.
        (isVertical
          ? "items-center justify-center overflow-y-auto py-2"
          : "items-center justify-center overflow-hidden") +
        (className ? " " + className : "")
      }
      // 접근성: 광고 영역임을 명시
      role="complementary"
      aria-label="광고 영역"
    >
      {children ? (
        // 실제 광고 코드가 주입되면 그대로 렌더
        children
      ) : (
        // 자리표시(placeholder) — 실제 광고 삽입 전
        <div
          className={
            "flex h-full w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 text-center text-[11px] text-ink-muted"
          }
        >
          <span>광고 영역</span>
          <span className="text-ink-muted/70">
            {isVertical ? "세로 배너 (예: 120×600)" : "가로 배너 (예: 728×90)"}
          </span>
        </div>
      )}
    </div>
  );
}
