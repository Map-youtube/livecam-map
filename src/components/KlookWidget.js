"use client";

// ─────────────────────────────────────────────────────────────
// KlookWidget — Klook 제휴 세로 배너 위젯 (120×600)
//
// Klook 위젯은 <ins class="klk-aff-widget"> 요소를 초기화 스크립트가
// iframe 으로 "교체"하는 방식이다. 이 iframe 을 React 가 재조정(re-render) 과정에서
// 지워버리지 않도록, <ins> 를 JSX 로 그리지 않고 ref 컨테이너에 직접 주입한다(React 관리 밖).
//
// ★ 초기화가 어긋나면(스크립트-마운트 경쟁, 컨테이너 조기 비움 등) iframe 이 안 뜨고
//   <ins> 안의 대체 링크 <a href="//www.klook.com/?aid=">(aid 비어있음)만 남는다.
//   이 상태에서 클릭하면 Klook 이 "Where did that page go?" 안내 후 홈으로 리다이렉트한다.
//   → 이를 막기 위해:
//     · 초기화 스크립트는 "페이지당 한 번만" 주입(모듈 플래그) — StrictMode 이중 실행 방지
//     · ins/iframe 이 이미 있으면 다시 주입하지 않음
//     · 언마운트 시 innerHTML 을 비우지 않음(스크립트가 만든 iframe 보존)
//
// ⚠️ 외부 스크립트/iframe 을 사용하므로 클라이언트 전용("use client")이며,
//    모든 처리는 try-catch 로 감싸 실패해도 화면이 깨지지 않게 한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

// Klook 위젯 파라미터.
// ★ data-lang 을 "en-BS"(영어-바하마) → "en-US" 로 변경:
//   위젯 iframe 은 data-* 값을 그대로 affiliate.klook.com/widget/render 로 넘기는데,
//   lang=en-BS 는 유효한 상품 링크를 만들지 못해 클릭 시 "Where did that page go?" 후
//   홈으로 리다이렉트되는 원인이었다. 계정을 식별하는 값은 data-wid(125414)이므로
//   lang 을 바꿔도 제휴 추적에는 영향이 없다.
const KLOOK_INS_HTML =
  '<ins class="klk-aff-widget" data-wid="125414" data-bgtype="Play" ' +
  'data-adid="1334464" data-lang="en-US" data-prod="banner" ' +
  'data-width="120" data-height="600">' +
  '<a href="//www.klook.com/?aid=">Klook.com</a></ins>';

// Klook 위젯 초기화 스크립트 URL
const KLOOK_SCRIPT_SRC =
  "https://affiliate.klook.com/widget/fetch-iframe-init.js";

// 초기화 스크립트를 "페이지당 한 번만" 주입하기 위한 모듈 레벨 플래그.
// (React StrictMode 의 개발 모드 이중 실행에도 스크립트가 중복 로드되지 않도록)
let klookScriptInjected = false;

export default function KlookWidget() {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    try {
      // 1) 아직 위젯(ins) 이나 교체된 iframe 이 없을 때만 ins 마크업을 주입한다.
      //    (StrictMode 재실행/리렌더 시 이미 만들어진 iframe 을 지우지 않기 위함)
      const hasWidget =
        el.querySelector("ins.klk-aff-widget") || el.querySelector("iframe");
      if (!hasWidget) {
        el.innerHTML = KLOOK_INS_HTML;
      }

      // 2) 초기화 스크립트는 페이지당 한 번만 주입.
      //    스크립트는 로드되면 문서의 .klk-aff-widget 을 스캔해 iframe 으로 렌더한다.
      if (!klookScriptInjected) {
        klookScriptInjected = true;
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = KLOOK_SCRIPT_SRC;
        document.body.appendChild(script);
      }
    } catch (error) {
      console.error("[KlookWidget] 위젯 초기화 실패:", error); // TODO: 배포 전 제거
    }

    // ⚠️ 여기서 innerHTML 을 비우지 않는다:
    //    Klook 스크립트가 ins 를 iframe 으로 교체한 것을 지우면 광고가 사라지고
    //    다시 대체 링크(깨진 aid)만 남게 되기 때문.
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
