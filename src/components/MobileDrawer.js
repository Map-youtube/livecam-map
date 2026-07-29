"use client";

// ─────────────────────────────────────────────────────────────
// MobileDrawer — 모바일 전용 하단 드로어(바텀시트)
//
// 왜 직접 만들었나:
//   - shadcn 의 sheet 는 radix-ui 의존성을 새로 끌어온다. 이 화면은 지도(Leaflet/Cesium)가
//     이미 무거워서, 추후 앱(웹뷰/PWA) 전환을 고려하면 번들을 늘리지 않는 편이 낫다.
//   - 대신 접근성(ESC 닫기, 배경 클릭 닫기, aria-modal, 뒤 스크롤 잠금)은 직접 챙긴다.
//
// 2026-07-29 추가 — 손가락으로 끌어내려 닫기(drag-to-dismiss):
//   손잡이(그랩바)/헤더를 잡고 아래로 끌면 시트가 손가락을 따라 내려오고,
//   충분히 내렸거나 빠르게 튕기면 닫힌다. 모자라면 원위치로 되돌아간다.
//   ⚠️ 본문(목록) 영역은 세로 스크롤이 우선이므로 드래그 핸들에서만 제스처를 받는다.
//      (목록을 스크롤하려다 시트가 닫히는 오작동 방지)
//   ⚠️ 데스크톱에는 영향이 없다 — 이 컴포넌트 자체가 lg:hidden 이다.
//
// props:
//   - open     : 열림 여부
//   - onClose  : 닫기 콜백
//   - title    : 헤더 제목
//   - children : 시트 본문 (스크롤 영역)
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

// 이 거리(px) 이상 끌어내리면 닫는다.
const CLOSE_DISTANCE_PX = 110;
// 짧게 끌었어도 이 속도(px/ms) 이상으로 튕기면 닫는다(플릭 제스처).
const CLOSE_VELOCITY = 0.5;

export default function MobileDrawer({ open, onClose, title, children }) {
  // 드래그 중 손가락을 따라 내려간 거리(px). 0 이면 제자리.
  const [dragY, setDragY] = useState(0);
  // 드래그 중에는 CSS transition 을 끄고 손가락에 즉시 붙게 한다.
  const [dragging, setDragging] = useState(false);

  // 제스처 추적용(리렌더 불필요한 값들)
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);

  // 열림/닫힘이 바뀌면 드래그 상태를 초기화(다음 열림이 내려간 채 시작하지 않게)
  useEffect(() => {
    setDragY(0);
    setDragging(false);
  }, [open]);

  // 열려 있는 동안: ESC 로 닫기 + 뒤 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    try {
      window.addEventListener("keydown", handleKeyDown);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    } catch (error) {
      console.error("[MobileDrawer] 이벤트 등록 실패:", error); // TODO: 배포 전 제거
      return undefined;
    }
  }, [open, onClose]);

  // ─── 드래그(터치/마우스 공통, Pointer Events) ─────────────────
  const handlePointerDown = useCallback((event) => {
    try {
      // 마우스는 주 버튼만
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const y = event.clientY;
      startYRef.current = y;
      lastYRef.current = y;
      startTimeRef.current = event.timeStamp;
      lastTimeRef.current = event.timeStamp;
      setDragging(true);
      // 포인터를 이 요소에 고정 → 손가락이 밖으로 나가도 move/up 을 계속 받는다.
      //   ⚠️ 실패해도 드래그 자체는 동작하므로(위 상태가 이미 설정됨) 조용히 넘어간다.
      //      합성 이벤트(자동화 테스트) 등 활성 포인터가 없을 때 NotFoundError 가 날 수 있다.
      try {
        const el = event.currentTarget;
        if (el && el.setPointerCapture) el.setPointerCapture(event.pointerId);
      } catch (captureError) {
        /* 포인터 고정 실패는 무시 — 드래그는 그대로 동작한다 */
      }
    } catch (error) {
      console.error("[MobileDrawer] 드래그 시작 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      if (!dragging) return;
      try {
        const delta = event.clientY - startYRef.current;
        lastYRef.current = event.clientY;
        lastTimeRef.current = event.timeStamp;
        // 아래로만 따라간다. 위로 당기면 살짝만 늘어나는 고무줄 효과(최대 -24px).
        setDragY(delta >= 0 ? delta : Math.max(delta / 3, -24));
      } catch (error) {
        console.error("[MobileDrawer] 드래그 이동 실패:", error); // TODO: 배포 전 제거
      }
    },
    [dragging]
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (!dragging) return;
      try {
        const delta = event.clientY - startYRef.current;
        const dt = Math.max(1, event.timeStamp - lastTimeRef.current);
        const velocity = (event.clientY - lastYRef.current) / dt; // px/ms (아래로 +)

        setDragging(false);
        // 충분히 내렸거나 아래로 빠르게 튕겼으면 닫는다
        if (delta > CLOSE_DISTANCE_PX || velocity > CLOSE_VELOCITY) {
          setDragY(0); // 닫힘 애니메이션은 translate-y-full 이 담당
          onClose();
        } else {
          setDragY(0); // 원위치로 되돌아감(transition 이 다시 켜져 부드럽게)
        }
      } catch (error) {
        console.error("[MobileDrawer] 드래그 종료 실패:", error); // TODO: 배포 전 제거
        setDragging(false);
        setDragY(0);
      }
    },
    [dragging, onClose]
  );

  // 시트 위치: 닫혀 있으면 화면 밖(100%), 열려 있으면 드래그한 만큼만 내려감
  const sheetStyle = open
    ? { transform: `translateY(${dragY}px)` }
    : { transform: "translateY(100%)" };

  // 끌어내린 만큼 배경 딤도 옅어져 "닫히는 중"이 느껴지게 한다
  const dimOpacity = open
    ? Math.max(0, 1 - Math.max(0, dragY) / (CLOSE_DISTANCE_PX * 2))
    : 0;

  return (
    <div
      className={
        "fixed inset-0 z-[2000] lg:hidden " +
        // 닫혀 있을 땐 클릭을 통과시켜 지도를 정상 조작할 수 있게 한다
        (open ? "" : "pointer-events-none")
      }
      aria-hidden={open ? undefined : true}
    >
      {/* 딤 배경 — 클릭하면 닫힘 */}
      <div
        onClick={onClose}
        style={{ opacity: dimOpacity }}
        className={
          "absolute inset-0 bg-black/40 " +
          (dragging ? "" : "transition-opacity duration-200")
        }
      />

      {/* 바텀시트 본체 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={sheetStyle}
        className={
          "safe-bottom absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col " +
          "rounded-t-lg border-t border-border bg-surface shadow-card " +
          // 드래그 중엔 transition 을 꺼서 손가락에 즉시 붙게 한다
          (dragging ? "" : "transition-transform duration-200 ease-out")
        }
      >
        {/* ── 드래그 손잡이 영역 ──────────────────────────────────
            손잡이와 헤더까지를 "잡는 곳"으로 삼아 엄지로 쉽게 내릴 수 있게 한다.
            touch-none: 이 영역에서는 브라우저 기본 스크롤/새로고침 제스처를 막는다. */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex-none cursor-grab touch-none select-none active:cursor-grabbing"
        >
          {/* 손잡이(그랩바) */}
          <div className="flex justify-center pb-1 pt-2.5">
            <span className="h-1.5 w-11 rounded-full bg-ink/20" />
          </div>

          {/* 헤더: 제목 + 닫기 */}
          <div className="flex items-center justify-between border-b border-border px-4 pb-2.5">
            <h2 className="font-display text-base font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              // 닫기 버튼 위에서 시작한 포인터는 드래그로 넘기지 않는다(버튼 클릭 우선)
              onPointerDown={(e) => e.stopPropagation()}
              className="tap-target -mr-2 flex items-center justify-center rounded-md px-3 text-lg text-ink-muted transition hover:bg-secondary hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 (스크롤). overscroll-contain: 시트 끝에서 뒤 배경이 따라 스크롤되지 않게 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
