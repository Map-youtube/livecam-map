// ─────────────────────────────────────────────────────────────
// LiveDot — 라이브 신호점 (재사용 컴포넌트)
//
// 작은 빨간 점 하나가 은은하게 바깥으로 퍼지며 사라지는 pulse 애니메이션.
// 실제 애니메이션/스타일은 globals.css 의 `.live-dot` 에 정의되어 있으며,
// prefers-reduced-motion 을 존중해 모션 최소화 설정 시 정적인 점만 표시된다.
//
// props:
//   - size : "sm" | "md" (기본 md) — 점 크기만 조절
// ─────────────────────────────────────────────────────────────

export default function LiveDot({ size = "md" }) {
  // sm=6px, md=9px
  const px = size === "sm" ? 6 : 9;
  return (
    <span
      className="live-dot"
      style={{ width: `${px}px`, height: `${px}px` }}
      aria-hidden="true"
    />
  );
}
