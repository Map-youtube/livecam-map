"use client";

// ─────────────────────────────────────────────────────────────
// SiteHeader — SEO 정적 페이지 공통 상단 헤더 (로고 + 대륙 네비게이션 + 언어)
//
// 왜 필요한가:
//   검색으로 /asia/jp/tokyo 같은 페이지에 들어온 방문자가 지금은 다른 지역으로 갈 방법이
//   브레드크럼의 "홈" 하나뿐이라 그대로 이탈한다. 헤더에서 바로 다른 대륙/국가로 이동하게 해
//   연속 탐색을 유도한다(이탈률 전략).
//
// props:
//   - nav: getSeoNav() 결과 [{ continent, total, countries: [{code, count}] }, ...]
//          서버(SeoPageShell)에서 만들어 넘긴다. 국가/대륙 "이름"은 여기서 번역한다.
//
// ⚠️ 메인 지도 화면(/)과 카테고리 트리는 이 컴포넌트와 무관하다(건드리지 않음).
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import LiveDot from "@/components/LiveDot";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useI18n } from "@/components/i18n/LanguageProvider";

export default function SiteHeader({ nav }) {
  const { t, tContinent, countryName } = useI18n();

  // 데스크톱: 현재 열린 대륙 드롭다운 (null = 닫힘)
  const [openContinent, setOpenContinent] = useState(null);
  // 모바일: 햄버거 메뉴 펼침 여부
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef(null);

  const closeAll = useCallback(() => {
    setOpenContinent(null);
    setMobileOpen(false);
  }, []);

  // 바깥 클릭 / ESC 로 닫기
  useEffect(() => {
    function handlePointerDown(event) {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        closeAll();
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") closeAll();
    }
    try {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    } catch (error) {
      console.error("[SiteHeader] 이벤트 등록 실패:", error); // TODO: 배포 전 제거
      return undefined;
    }
  }, [closeAll]);

  const list = Array.isArray(nav) ? nav : [];

  return (
    <header
      ref={headerRef}
      className="safe-top sticky top-0 z-[900] flex-shrink-0 border-b border-border bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6">
        {/* 로고 → 메인 지도 */}
        <Link
          href="/"
          onClick={closeAll}
          className="flex flex-none items-center gap-1.5"
          title={t("tagline")}
        >
          <LiveDot size="sm" />
          {/* 브랜드 워드마크: Trip = 잉크, by = 옅게, Clip = 브랜드 청록 강조 */}
          <span className="font-display text-[17px] font-semibold tracking-tight text-ink">
            Trip <span className="font-normal text-ink-muted">by</span>{" "}
            <span className="text-brand">Clip</span>
          </span>
        </Link>

        {/* ── 데스크톱: 대륙 네비게이션 (md 이상) ── */}
        <nav className="ml-2 hidden items-center gap-0.5 md:flex">
          {list.map((item) => {
            // ⚠️ 각 버튼/링크는 반복문 안 "자기 항목(item)"의 대륙 코드만 참조한다.
            const isOpen = openContinent === item.continent;
            return (
              <div key={item.continent} className="relative">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() =>
                    setOpenContinent(isOpen ? null : item.continent)
                  }
                  className={
                    "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition " +
                    (isOpen
                      ? "bg-brand-light text-brand"
                      : "text-ink hover:bg-secondary")
                  }
                >
                  {tContinent(item.continent)}
                  <span
                    aria-hidden="true"
                    className="text-[10px] text-ink-muted"
                  >
                    ▾
                  </span>
                </button>

                {/* 드롭다운: 대륙 전체 보기 + 국가 목록 */}
                {isOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-60 rounded-md border border-border bg-surface p-1.5 shadow-card">
                    <Link
                      href={`/${item.continent}`}
                      onClick={closeAll}
                      className="flex items-center justify-between rounded-sm px-2.5 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand-light"
                    >
                      <span>{tContinent(item.continent)} 전체</span>
                      <span className="font-mono text-xs tabular-nums text-ink-muted">
                        {item.total}
                      </span>
                    </Link>

                    <div className="my-1 border-t border-border" />

                    {/* 국가가 많을 수 있으므로 스크롤 */}
                    <div className="max-h-72 overflow-y-auto">
                      {item.countries.map((c) => (
                        // 각 링크는 자기 국가코드(c.code)로만 이동한다.
                        <Link
                          key={c.code}
                          href={`/${item.continent}/${c.code.toLowerCase()}`}
                          onClick={closeAll}
                          className="flex items-center justify-between rounded-sm px-2.5 py-1.5 text-sm text-ink transition hover:bg-secondary"
                        >
                          <span className="truncate">
                            {countryName(c.code)}
                          </span>
                          <span className="ml-2 flex-none font-mono text-xs tabular-nums text-ink-muted">
                            {c.count}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── 우측: 언어 선택 + (모바일) 메뉴 버튼 ── */}
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <LanguageSelector />
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label={t("browse")}
            onClick={() => setMobileOpen((v) => !v)}
            className="tap-target flex items-center justify-center rounded-md px-2 text-lg text-ink transition hover:bg-secondary md:hidden"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* ── 모바일: 펼침 메뉴 (md 미만) ── */}
      {mobileOpen && (
        <div className="border-t border-border bg-surface md:hidden">
          <div className="mx-auto max-h-[70vh] w-full max-w-5xl overflow-y-auto overscroll-contain px-4 py-2">
            {list.map((item) => (
              <div
                key={item.continent}
                className="border-b border-border py-2.5 last:border-0"
              >
                <Link
                  href={`/${item.continent}`}
                  onClick={closeAll}
                  className="flex items-center gap-1.5 text-sm font-bold text-ink"
                >
                  {tContinent(item.continent)}
                  <span className="font-mono text-xs tabular-nums text-ink-muted">
                    ({item.total})
                  </span>
                </Link>
                {/* 국가는 칩으로 나열 (터치로 누르기 쉽게) */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.countries.map((c) => (
                    <Link
                      key={c.code}
                      href={`/${item.continent}/${c.code.toLowerCase()}`}
                      onClick={closeAll}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-ink transition hover:bg-brand-light hover:text-brand"
                    >
                      {countryName(c.code)}{" "}
                      <span className="font-mono tabular-nums text-ink-muted">
                        {c.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
