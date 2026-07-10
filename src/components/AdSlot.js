// ─────────────────────────────────────────────────────────────
// AdSlot — 광고 슬롯 (공용)
//
// 실제 광고 코드(Klook 제휴 배너 / 애드센스 등)를 넣기 전까지 "광고 영역"임을
// 명확히 보여주는 자리표시(placeholder) 역할을 한다.
//
// ⚠️ CLAUDE.md 9장: 광고 슬롯에는 "광고" 라벨을 반드시 표기한다.
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
        // 세로 배너(120×600)는 화면이 짧아도 위부터 보이도록 상단 정렬 + 세로 스크롤,
        // "광고" 라벨과 겹치지 않게 상단 여백(pt-6). 가로 배너는 중앙 정렬.
        (isVertical
          ? "items-start justify-center overflow-y-auto pt-6"
          : "items-center justify-center overflow-hidden") +
        (className ? " " + className : "")
      }
      // 접근성: 광고 영역임을 명시
      role="complementary"
      aria-label="광고 영역"
    >
      {/* "광고" 라벨 (필수 표기) */}
      <span className="absolute left-1 top-1 z-10 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
        광고
      </span>

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
