// ─────────────────────────────────────────────────────────────
// EmptyState — 마커가 없는 지역(국가/도시) 목록의 빈 상태 UI
//
// props: message(안내 문구), backHref/backLabel(상위로 돌아가는 링크, 선택)
// ─────────────────────────────────────────────────────────────

import Link from "next/link";

export default function EmptyState({ message, backHref, backLabel }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
      <span className="text-3xl" aria-hidden="true">
        📭
      </span>
      <p className="text-sm text-ink-muted">
        {message || "아직 등록된 라이브캠이 없습니다."}
      </p>
      {backHref && (
        <Link href={backHref} className="text-sm text-brand hover:underline">
          {backLabel || "← 돌아가기"}
        </Link>
      )}
    </div>
  );
}
