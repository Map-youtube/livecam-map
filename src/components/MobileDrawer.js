"use client";

// ─────────────────────────────────────────────────────────────
// MobileDrawer — 모바일 전용 하단 드로어(바텀시트)
//
// 왜 직접 만들었나:
//   - shadcn 의 sheet 는 radix-ui 의존성을 새로 끌어온다. 이 화면은 지도(Leaflet/Cesium)가
//     이미 무거워서, 추후 앱(웹뷰/PWA) 전환을 고려하면 번들을 늘리지 않는 편이 낫다.
//   - 대신 접근성(ESC 닫기, 배경 클릭 닫기, aria-modal, 뒤 스크롤 잠금)은 직접 챙긴다.
//
// props:
//   - open     : 열림 여부
//   - onClose  : 닫기 콜백
//   - title    : 헤더 제목
//   - children : 시트 본문 (스크롤 영역)
//
// 데스크톱(lg 이상)에서는 CSS 로 완전히 숨긴다(lg:hidden) — 데스크톱은 좌측 사이드바 사용.
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";

export default function MobileDrawer({ open, onClose, title, children }) {
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
        className={
          "absolute inset-0 bg-black/40 transition-opacity duration-200 " +
          (open ? "opacity-100" : "opacity-0")
        }
      />

      {/* 바텀시트 본체 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          "safe-bottom absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col " +
          "rounded-t-lg border-t border-border bg-surface shadow-card " +
          "transition-transform duration-200 ease-out " +
          (open ? "translate-y-0" : "translate-y-full")
        }
      >
        {/* 손잡이(그랩바) — 앱의 바텀시트 느낌 */}
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* 헤더: 제목 + 닫기 */}
        <div className="flex items-center justify-between border-b border-border px-4 pb-2.5">
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="tap-target -mr-2 flex items-center justify-center rounded-md px-3 text-lg text-ink-muted transition hover:bg-secondary hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* 본문 (스크롤). overscroll-contain: 시트 끝에서 뒤 배경이 따라 스크롤되지 않게 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
