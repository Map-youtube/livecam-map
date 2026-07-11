"use client";

// ─────────────────────────────────────────────────────────────
// LiveChannelSection — 관리자 "자동 라이브 채널" 관리 섹션 (폼 + 목록)
//
// - 채널 목록을 한 번 조회해 상태로 보유하고, 등록 폼(자동완성용)과 목록에 함께 전달.
// - 등록/삭제/활성토글 시 목록을 다시 불러온다.
// - 목록은 대분류 > 소분류 > 채널 트리로 묶어 표시.
//   각 채널: 채널명 · 핸들 · 좌표 · 활성 토글 · 삭제(ISS 특수 채널은 삭제 불가).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import LiveChannelForm from "@/components/LiveChannelForm";
import { getAdminIdToken } from "@/lib/clientAuth";

export default function LiveChannelSection() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [busyId, setBusyId] = useState(null); // 삭제/토글 진행 중인 채널 id

  // ─── 목록 조회 ───────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/live-channels", { cache: "no-store" });
      const data = await res.json();
      if (data && Array.isArray(data.channels)) {
        setChannels(data.channels);
      } else {
        setChannels([]);
      }
    } catch (error) {
      console.error("[LiveChannelSection] 목록 조회 실패:", error); // TODO: 배포 전 제거
      setListError("채널 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ─── 삭제 ────────────────────────────────────────────────────
  async function handleDelete(ch) {
    if (!ch || !ch.id) return;
    if (!window.confirm(`'${ch.channel_name || ch.channel_id}' 채널을 삭제할까요?`)) return;
    setBusyId(ch.id);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.assign("/admin/login");
        return;
      }
      const res = await fetch(`/api/live-channels/${ch.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await reload();
      } else {
        window.alert(data.error || "삭제에 실패했습니다.");
      }
    } catch (error) {
      console.error("[LiveChannelSection] 삭제 실패:", error); // TODO: 배포 전 제거
      window.alert("네트워크 오류로 삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // ─── 활성/비활성 토글 ────────────────────────────────────────
  async function handleToggleActive(ch) {
    if (!ch || !ch.id) return;
    setBusyId(ch.id);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.assign("/admin/login");
        return;
      }
      const res = await fetch(`/api/live-channels/${ch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: ch.is_active === false ? true : false }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await reload();
      } else {
        window.alert(data.error || "상태 변경에 실패했습니다.");
      }
    } catch (error) {
      console.error("[LiveChannelSection] 토글 실패:", error); // TODO: 배포 전 제거
      window.alert("네트워크 오류로 상태 변경에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // ─── 대분류 > 소분류 트리 구성 ───────────────────────────────
  const tree = useMemo(() => {
    const byMajor = {};
    for (const ch of channels) {
      if (!ch) continue;
      const M = ch.major_category || "(미분류)";
      const m = ch.minor_category || "(미분류)";
      if (!byMajor[M]) byMajor[M] = {};
      if (!byMajor[M][m]) byMajor[M][m] = [];
      byMajor[M][m].push(ch);
    }
    return byMajor;
  }, [channels]);

  const majorKeys = Object.keys(tree).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <div className="space-y-8">
      {/* 등록 폼 */}
      <div>
        <LiveChannelForm onRegistered={reload} existingChannels={channels} />
      </div>

      <hr className="border-border" />

      {/* 목록 */}
      <div>
        <h3 className="mb-3 font-display text-lg font-bold text-ink">
          등록된 채널 ({channels.length})
        </h3>

        {loading ? (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        ) : listError ? (
          <p className="text-sm text-red-600">{listError}</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-ink-muted">
            아직 등록된 채널이 없습니다. 위 폼에서 채널을 추가하세요.
          </p>
        ) : (
          <div className="space-y-4">
            {majorKeys.map((M) => {
              const minors = tree[M];
              const minorKeys = Object.keys(minors).sort((a, b) =>
                a.localeCompare(b, "ko")
              );
              return (
                <div key={M} className="rounded-md border border-border">
                  <div className="border-b border-border bg-surface px-3 py-2 text-sm font-bold text-ink">
                    📁 {M}
                  </div>
                  <div className="divide-y divide-border">
                    {minorKeys.map((m) => (
                      <div key={m} className="px-3 py-2">
                        <div className="mb-1 text-xs font-semibold text-ink-muted">
                          {m}
                        </div>
                        <ul className="space-y-1">
                          {minors[m].map((ch) => {
                            const isIss = ch.channel_type === "iss";
                            const inactive = ch.is_active === false;
                            return (
                              <li
                                key={ch.id}
                                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                              >
                                <span className="font-medium text-ink">
                                  {ch.channel_name || ch.channel_id}
                                </span>
                                {ch.handle && (
                                  <span className="text-xs text-ink-muted">
                                    {ch.handle}
                                  </span>
                                )}
                                {isIss && (
                                  <span className="rounded bg-brand-light px-1.5 py-0.5 text-[11px] font-medium text-brand">
                                    ISS(특수·이동 추적)
                                  </span>
                                )}
                                {inactive && (
                                  <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[11px] text-ink-muted">
                                    비활성
                                  </span>
                                )}
                                <span className="font-mono text-[11px] text-ink-muted">
                                  {typeof ch.lat === "number" &&
                                  typeof ch.lng === "number"
                                    ? `${ch.lat.toFixed(3)}, ${ch.lng.toFixed(3)}`
                                    : ""}
                                </span>
                                <span className="ml-auto flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === ch.id}
                                    onClick={() => handleToggleActive(ch)}
                                    className="rounded border border-border px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    {inactive ? "활성화" : "비활성화"}
                                  </button>
                                  {!isIss && (
                                    <button
                                      type="button"
                                      disabled={busyId === ch.id}
                                      onClick={() => handleDelete(ch)}
                                      className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      삭제
                                    </button>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
