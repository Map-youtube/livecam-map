"use client";

// ─────────────────────────────────────────────────────────────
// StepHeader — 관리자 폼의 "단계 카드" 헤더
//
// 마커 등록 폼과 채널 등록 폼이 똑같은 형식을 쓰도록 한 곳에 모았다.
// (번호 뱃지 + 제목 + 필수 표시 + 설명)
//
// props:
//   - step     : 단계 번호 (1, 2, 3 ...)
//   - title    : 제목
//   - required : true 면 제목 옆에 * 표시
//   - children : 설명 문구 (선택)
//
// 사용: <Card><StepHeader step={1} title="..." required>설명</StepHeader><CardContent>...</CardContent></Card>
// ─────────────────────────────────────────────────────────────

import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StepHeader({ step, title, required, children }) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {step}
        </span>
        <span>{title}</span>
        {required && (
          <span className="text-sm font-normal text-live" aria-label="필수">
            *
          </span>
        )}
      </CardTitle>
      {children && <CardDescription>{children}</CardDescription>}
    </CardHeader>
  );
}
