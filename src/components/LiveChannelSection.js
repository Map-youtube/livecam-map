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

  // ─── 카테고리(대/소분류) 이름 일괄 변경 ─────────────────────
  async function handleRename(scope, major, minor) {
    const cur = scope === "major" ? major : minor;
    const newName = window.prompt(
      scope === "major"
        ? `대분류 '${major}' 의 새 이름을 입력하세요 (이 대분류의 모든 채널에 적용):`
        : `소분류 '${minor}' 의 새 이름을 입력하세요 (대분류 '${major}' 안 이 소분류의 모든 채널에 적용):`,
      cur
    );
    if (newName == null) return; // 취소
    const trimmed = newName.trim();
    if (!trimmed || trimmed === cur) return;
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.assign("/admin/login");
        return;
      }
      const res = await fetch("/api/live-channels/rename-category", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scope, major, minor, newName: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await reload();
      } else {
        window.alert(data.error || "이름 변경에 실패했습니다.");
      }
    } catch (error) {
      console.error("[LiveChannelSection] 이름변경 실패:", error); // TODO: 배포 전 제거
      window.alert("네트워크 오류로 이름 변경에 실패했습니다.");
    }
  }

  // ─── 채널 개별 수정 (인라인) ─────────────────────────────────
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  function startEdit(ch) {
    setEditingId(ch.id);
    setEditForm({
      channel_name: ch.channel_name || "",
      major_category: ch.major_category || "",
      minor_category: ch.minor_category || "",
      lat: typeof ch.lat === "number" ? String(ch.lat) : "",
      lng: typeof ch.lng === "number" ? String(ch.lng) : "",
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }
  async function saveEdit(ch) {
    setBusyId(ch.id);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.assign("/admin/login");
        return;
      }
      const payload = {
        channel_name: editForm.channel_name,
        major_category: editForm.major_category,
        minor_category: editForm.minor_category,
      };
      // ISS(추적 채널)는 좌표가 없으므로 좌표는 고정 채널만 반영
      if (ch.channel_type !== "iss") {
        const lat = Number(editForm.lat);
        const lng = Number(editForm.lng);
        if (!Number.isNaN(lat)) payload.lat = lat;
        if (!Number.isNaN(lng)) payload.lng = lng;
      }
      const res = await fetch(`/api/live-channels/${ch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        cancelEdit();
        await reload();
      } else {
        window.alert(data.error || "수정에 실패했습니다.");
      }
    } catch (error) {
      console.error("[LiveChannelSection] 수정 실패:", error); // TODO: 배포 전 제거
      window.alert("네트워크 오류로 수정에 실패했습니다.");
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
                  <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-sm font-bold text-ink">
                    <span>📁 {M}</span>
                    <button
                      type="button"
                      onClick={() => handleRename("major", M)}
                      className="rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-gray-600 hover:bg-gray-100"
                    >
                      대분류명 변경
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {minorKeys.map((m) => (
                      <div key={m} className="px-3 py-2">
                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-ink-muted">
                          <span>{m}</span>
                          <button
                            type="button"
                            onClick={() => handleRename("minor", M, m)}
                            className="rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-gray-600 hover:bg-gray-100"
                          >
                            소분류명 변경
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {minors[m].map((ch) => {
                            const isIss = ch.channel_type === "iss";
                            const inactive = ch.is_active === false;
                            const editing = editingId === ch.id;

                            // 수정 중: 인라인 편집 폼
                            if (editing) {
                              return (
                                <li
                                  key={ch.id}
                                  className="rounded-md border border-brand/40 bg-brand-light/30 p-2 text-sm"
                                >
                                  <div className="mb-2 text-xs font-semibold text-ink">
                                    ✏️ 채널 수정 —{" "}
                                    {ch.channel_name || ch.channel_id}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[11px] text-gray-600">
                                      채널 표시명
                                      <input
                                        type="text"
                                        value={editForm.channel_name}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            channel_name: e.target.value,
                                          }))
                                        }
                                        className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                      />
                                    </label>
                                    <div />
                                    <label className="text-[11px] text-gray-600">
                                      대분류
                                      <input
                                        type="text"
                                        value={editForm.major_category}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            major_category: e.target.value,
                                          }))
                                        }
                                        className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                      />
                                    </label>
                                    <label className="text-[11px] text-gray-600">
                                      소분류
                                      <input
                                        type="text"
                                        value={editForm.minor_category}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            minor_category: e.target.value,
                                          }))
                                        }
                                        className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                      />
                                    </label>
                                    {!isIss && (
                                      <>
                                        <label className="text-[11px] text-gray-600">
                                          위도(lat)
                                          <input
                                            type="text"
                                            value={editForm.lat}
                                            onChange={(e) =>
                                              setEditForm((f) => ({
                                                ...f,
                                                lat: e.target.value,
                                              }))
                                            }
                                            className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                          />
                                        </label>
                                        <label className="text-[11px] text-gray-600">
                                          경도(lng)
                                          <input
                                            type="text"
                                            value={editForm.lng}
                                            onChange={(e) =>
                                              setEditForm((f) => ({
                                                ...f,
                                                lng: e.target.value,
                                              }))
                                            }
                                            className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                          />
                                        </label>
                                      </>
                                    )}
                                  </div>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      disabled={busyId === ch.id}
                                      onClick={() => saveEdit(ch)}
                                      className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                                    >
                                      저장
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="rounded border border-border px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                    >
                                      취소
                                    </button>
                                  </div>
                                </li>
                              );
                            }

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
                                    onClick={() => startEdit(ch)}
                                    className="rounded border border-border px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    수정
                                  </button>
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
