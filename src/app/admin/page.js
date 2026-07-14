"use client";

// ─────────────────────────────────────────────────────────────
// 관리자 페이지 — 마커 등록 + 등록된 마커 목록 (로그인 보호 적용)
//
// 로그인 보호: 전체 내용을 AdminGuard 로 감싼다.
//   - 로그인 안 된 상태로 접근하면 AdminGuard 가 /admin/login 으로 보냄.
// 상단에 로그인된 관리자 이메일 표시 + 로그아웃 버튼 제공.
//
// 구성(2단 레이아웃):
//   - 왼쪽 절반 : "마커 등록" 폼 → 구분선 → "자동 라이브 채널 관리"
//   - 오른쪽 절반 : "등록된 마커 목록"(양이 많아 별도 컬럼으로 분리, 한눈에 보기 쉽게)
// (구 "측정 지표" 영역은 제거 — 접속자수/API 소비량 통계는 추후 별도 반영 예정)
// 등록 폼에서 등록 성공 시 refreshSignal 을 증가시켜 목록이 자동 갱신되도록 연동한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AdminGuard from "@/components/AdminGuard";
import MarkerForm from "@/components/MarkerForm";
import MarkerList from "@/components/MarkerList";
import LiveChannelSection from "@/components/LiveChannelSection";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ─── 섹션 제목 (제목 + 한 줄 설명) ────────────────────────────
// 관리자 화면의 각 영역을 같은 형식으로 통일해 위계를 명확히 한다.
function SectionTitle({ title, desc }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-bold tracking-tight text-ink">
        {title}
      </h2>
      {desc && <p className="mt-1 text-sm text-ink-muted">{desc}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();

  // 값이 바뀌면 MarkerList 가 목록을 다시 불러온다 (등록 성공 시 +1).
  const [refreshSignal, setRefreshSignal] = useState(0);
  // 로그인된 관리자 이메일 (상단 표시용)
  const [adminEmail, setAdminEmail] = useState("");

  // ─── 로그인된 사용자 이메일 읽기 ─────────────────────────────
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setAdminEmail(user && user.email ? user.email : "");
      });
    } catch (error) {
      console.error("[admin] 사용자 정보 확인 실패:", error.code || ""); // TODO: 배포 전 제거
    }
    return () => unsubscribe();
  }, []);

  // ─── 로그아웃 처리 ───────────────────────────────────────────
  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/admin/login");
    } catch (error) {
      console.error("[admin] 로그아웃 실패:", error.code || ""); // TODO: 배포 전 제거
      // 로그아웃 실패 시에도 로그인 페이지로 유도
      router.replace("/admin/login");
    }
  }

  return (
    <AdminGuard>
      {/* 왼쪽 절반: 등록 폼 + 자동 라이브 채널 관리 / 오른쪽 절반: 등록된 마커 목록 */}
      {/* 작은 화면에선 세로로 쌓임(flex-col), lg 이상에서 좌우 2단(flex-row) */}
      <main className="flex min-h-screen flex-col bg-bg lg:flex-row">
        {/* 왼쪽 절반 (min-w-0 : 내부 표/지도가 넘칠 때 가로 스크롤되게 함. 작은 화면에선 전체폭) */}
        <div className="w-full min-w-0 px-4 py-6 lg:w-1/2 lg:px-6">
          {/* 상단 바: 서비스명 + 관리자 이메일 + 로그아웃 */}
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="font-display text-sm font-bold tracking-tight text-ink">
                TripByClip 관리자
              </p>
              <p className="truncate text-xs text-ink-muted">
                {adminEmail ? adminEmail : "로그인됨"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="flex-none"
            >
              로그아웃
            </Button>
          </div>

          {/* 등록 영역 (폼이 왼쪽 절반 폭을 넓게 사용 — 지도/태그가 넓어짐) */}
          <SectionTitle
            title="마커 등록"
            desc="유튜브 라이브 링크와 지도 위치를 입력하면 대륙/국가/도시로 자동 분류됩니다."
          />
          <MarkerForm onRegistered={() => setRefreshSignal((n) => n + 1)} />

          <Separator className="my-10" />

          {/* 자동 라이브 채널 관리 (방송국 등 24/7 채널 — 대분류/소분류로 묶음). 현위치(왼쪽) 유지 */}
          <SectionTitle
            title="자동 라이브 채널 관리"
            desc="NASA처럼 24/7 라이브만 하는 유튜브 채널을 대분류/소분류로 묶어 등록합니다. 영상은 자동으로 수집되며, 채널과 지도 위치만 지정하면 됩니다."
          />
          <LiveChannelSection />
        </div>

        {/* 오른쪽 절반: 등록된 마커 목록 (양이 많아 별도 컬럼으로 분리) */}
        {/* min-w-0 : 표가 넘칠 때 이 컬럼 안에서 가로 스크롤되게 함 */}
        <section className="w-full min-w-0 border-t border-border bg-surface px-4 py-6 lg:w-1/2 lg:border-l lg:border-t-0 lg:px-6">
          <SectionTitle
            title="등록된 마커 목록"
            desc="영상 상태는 10분마다 자동으로 재점검되며, 재생 불가 영상은 지도에서 자동 제외됩니다."
          />
          <MarkerList refreshSignal={refreshSignal} />
        </section>
      </main>
    </AdminGuard>
  );
}
