"use client";

// ─────────────────────────────────────────────────────────────
// KlookWidget — Klook 제휴 세로 배너 위젯 (120×600)
//
// Klook 위젯은 <ins class="klk-aff-widget"> 요소를 초기화 스크립트가
// iframe 으로 "교체"하는 방식이다. 이 iframe 을 React 가 재조정(re-render) 과정에서
// 지워버리지 않도록, <ins> 를 JSX 로 그리지 않고 ref 컨테이너에 innerHTML 로 직접
// 주입한다(= React 관리 밖에 둔다). 그 뒤 초기화 스크립트를 주입하면 위젯이 렌더된다.
//
// ⚠️ 외부 스크립트/iframe 을 사용하므로 클라이언트 전용("use client")이며,
//    모든 처리는 try-catch 로 감싸 실패해도 화면이 깨지지 않게 한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

// Klook 이 제공한 위젯 파라미터 (제공받은 코드 그대로 사용)
const KLOOK_INS_HTML =
  '<ins class="klk-aff-widget" data-wid="125414" data-bgtype="Play" ' +
  'data-adid="1334464" data-lang="en-BS" data-prod="banner" ' +
  'data-width="120" data-height="600">' +
  '<a href="//www.klook.com/?aid=">Klook.com</a></ins>';

// Klook 위젯 초기화 스크립트 URL
const KLOOK_SCRIPT_SRC =
  "https://affiliate.klook.com/widget/fetch-iframe-init.js";

export default function KlookWidget() {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    try {
      // 1) <ins> 마크업을 컨테이너에 직접 주입 (React 재조정에서 제외)
      el.innerHTML = KLOOK_INS_HTML;

      // 2) 초기화 스크립트 주입 → 로드되면 위 <ins> 를 iframe 으로 렌더한다.
      //    (스크립트는 로드 시 문서의 .klk-aff-widget 요소를 스캔해 초기화한다)
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = KLOOK_SCRIPT_SRC;
      document.body.appendChild(script);
    } catch (error) {
      console.error("[KlookWidget] 위젯 초기화 실패:", error); // TODO: 배포 전 제거
    }

    // 언마운트 시 컨테이너 비움 (중복 위젯 생성 방지)
    return () => {
      try {
        if (el) el.innerHTML = "";
      } catch (e) {
        // 정리 실패는 무시
      }
    };
  }, []);

  // 위젯 실제 크기(120×600)에 맞춘 컨테이너
  return (
    <div
      ref={containerRef}
      className="flex justify-center"
      style={{ width: 120, minHeight: 600 }}
    />
  );
}
