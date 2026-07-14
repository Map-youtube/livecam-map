// ─────────────────────────────────────────────────────────────
// uiClasses — 여러 화면에서 공유하는 Tailwind 클래스 모음
//
// 컴포넌트로 만들 만큼 크지 않지만 여러 곳에서 똑같이 써야 하는 스타일을 한 곳에 모은다.
// (같은 문자열을 파일마다 복붙하면 나중에 한쪽만 바뀌어 디자인이 어긋난다)
// ─────────────────────────────────────────────────────────────

// 네이티브 <select> 공통 스타일 (shadcn Input 과 시각적으로 동일하게 보이도록 맞춤)
//
// shadcn Select 를 쓰지 않고 네이티브 <select> 를 유지하는 이유:
//   - 모바일에서 OS 기본 피커가 떠서 터치 사용성이 더 좋다 (추후 앱 전환 대비).
//   - 기존 onChange 로직을 그대로 쓸 수 있어 동작이 바뀔 위험이 없다.
export const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
