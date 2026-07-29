"use client";

// ─────────────────────────────────────────────────────────────
// MobileBrowseHandle — 모바일 전용 "카테고리 목록" 열기 손잡이 (지도 하단)
//
// 왜 만들었나 (2026-07-29):
//   기존에는 지도 하단 중앙에 작은 알약 버튼("☰ 탐색")이 떠 있었다. 실측·검토 결과
//     1) "탐색"이 무엇을 여는지 알기 어렵고,
//     2) 눌러야 하는 버튼처럼 보이지도 않아 발견되기 어려웠다.
//   → 화면 아래에 "시트가 살짝 걸쳐 있는" 모양으로 바꿔, 위로 끌어올리면 열린다는 것을
//     생김새만으로 알 수 있게 한다(모바일 앱의 바텀시트 관습).
//
// 동작 (둘 다 열림):
//   - 그냥 탭 → 열림 (기존 사용자가 하던 동작을 그대로 유지)
//   - 위로 끌어올리기 → 열림 (끄는 동안 손잡이가 따라 올라와 피드백을 준다)
//
// ⚠️ 모바일 전용. lg 이상에서는 렌더 자체를 하지 않는다(호출부에서 lg:hidden).
// ⚠️ 데스크톱 좌측 사이드바 동작에는 전혀 관여하지 않는다.
// ─────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
import { ChevronUp, LayoutList } from "lucide-react";

// 이 거리(px) 이상 위로 끌면 연다.
const OPEN_DISTANCE_PX = 40;
// 짧게 끌었어도 이 속도(px/ms) 이상으로 위로 튕기면 연다(플릭).
const OPEN_VELOCITY = 0.4;
// 이 정도 움직임/시간 이내면 "탭"으로 본다.
const TAP_MOVE_PX = 10;
const TAP_TIME_MS = 600;

export default function MobileBrowseHandle({ onOpen, label, hint }) {
  // 끄는 동안 손잡이가 따라 올라간 거리(px, 양수 = 위로)
  const [liftY, setLiftY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);

  const finish = useCallback(
    (shouldOpen) => {
      setDragging(false);
      setLiftY(0);
      if (shouldOpen && typeof onOpen === "function") onOpen();
    },
    [onOpen]
  );

  const handlePointerDown = useCallback((event) => {
    try {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startYRef.current = event.clientY;
      lastYRef.current = event.clientY;
      startTimeRef.current = event.timeStamp;
      lastTimeRef.current = event.timeStamp;
      setDragging(true);
      // ⚠️ 포인터 고정은 실패해도 드래그 동작에 지장이 없으므로 조용히 넘어간다.
      try {
        const el = event.currentTarget;
        if (el && el.setPointerCapture) el.setPointerCapture(event.pointerId);
      } catch (captureError) {
        /* 무시 */
      }
    } catch (error) {
      console.error("[MobileBrowseHandle] 드래그 시작 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      if (!dragging) return;
      try {
        const up = startYRef.current - event.clientY; // 위로 끌면 +
        lastYRef.current = event.clientY;
        lastTimeRef.current = event.timeStamp;
        // 위로만 따라 올라간다(최대 72px). 아래로는 움직이지 않는다.
        setLiftY(Math.max(0, Math.min(up, 72)));
      } catch (error) {
        console.error("[MobileBrowseHandle] 드래그 이동 실패:", error); // TODO: 배포 전 제거
      }
    },
    [dragging]
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (!dragging) return;
      try {
        const up = startYRef.current - event.clientY;
        const dt = Math.max(1, event.timeStamp - lastTimeRef.current);
        const velocityUp = (lastYRef.current - event.clientY) / dt; // px/ms, 위로 +
        const elapsed = event.timeStamp - startTimeRef.current;
        const isTap = Math.abs(up) < TAP_MOVE_PX && elapsed < TAP_TIME_MS;

        finish(isTap || up > OPEN_DISTANCE_PX || velocityUp > OPEN_VELOCITY);
      } catch (error) {
        console.error("[MobileBrowseHandle] 드래그 종료 실패:", error); // TODO: 배포 전 제거
        finish(false);
      }
    },
    [dragging, finish]
  );

  return (
    <div
      // 지도 하단에 "시트가 걸쳐 있는" 모양. 화면 폭 전체를 쓴다.
      className="absolute inset-x-0 bottom-0 z-[1000] lg:hidden"
      style={{ transform: `translateY(${-liftY}px)` }}
    >
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => finish(false)}
        aria-label={label}
        aria-haspopup="dialog"
        className={
          "safe-bottom flex w-full touch-none select-none flex-col items-center " +
          "rounded-t-lg border-t border-border bg-surface/95 px-4 pb-2 pt-2 " +
          "shadow-[0_-4px_16px_-6px_rgba(18,24,31,0.18)] backdrop-blur-sm " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand " +
          (dragging ? "" : "transition-transform duration-200 ease-out")
        }
      >
        {/* 손잡이(그랩바) — 은은하게 위아래로 움직여 "잡아서 올리는 것"임을 알린다.
            끄는 중에는 애니메이션을 멈춰 손가락 움직임과 충돌하지 않게 한다. */}
        <span
          aria-hidden="true"
          className={
            "mb-1.5 h-1.5 w-11 flex-none rounded-full bg-ink/20 " +
            (dragging ? "" : "grab-hint")
          }
        />

        {/* 라벨 + 위 방향 화살표 */}
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <LayoutList className="h-4 w-4 text-brand" aria-hidden="true" />
          {label}
          <ChevronUp className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        </span>

        {/* 보조 안내 — "끌어올려 열기" */}
        {hint ? (
          <span className="mt-0.5 text-[11px] leading-none text-ink-muted">
            {hint}
          </span>
        ) : null}
      </button>
    </div>
  );
}
