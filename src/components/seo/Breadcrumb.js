// ─────────────────────────────────────────────────────────────
// Breadcrumb — 상위 카테고리 이동용 이동경로 네비게이션
//
// props.items: [{ label, href }] 배열. 마지막 항목(현재 페이지)은 링크 없이 강조 표시.
//   예: [{label:"홈", href:"/"}, {label:"아시아", href:"/asia"}, {label:"일본", href:"/asia/jp"}, {label:"도쿄"}]
//
// 각 단계 클릭 시 상위 목록으로 이동한다. (서버 컴포넌트)
// ─────────────────────────────────────────────────────────────

import Link from "next/link";

export default function Breadcrumb({ items }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <nav
      aria-label="이동경로"
      className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted"
    >
      {list.map((it, i) => {
        const isLast = i === list.length - 1;
        return (
          <span key={i} className="flex items-center gap-x-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-border">
                ›
              </span>
            )}
            {isLast || !it.href ? (
              <span className="font-semibold text-ink">{it.label}</span>
            ) : (
              <Link href={it.href} className="hover:text-brand hover:underline">
                {it.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
