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
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import { getAdminIdToken } from "@/lib/clientAuth";

const EDIT_MAP_CENTER = { lat: 20, lng: 0 };

export default function LiveChannelSection() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [busyId, setBusyId] = useState(null); // 삭제/토글 진행 중인 채널 id
  // 채널별 "현재 라이브 방송 개수" { channelDocId: number }
  const [videoCounts, setVideoCounts] = useState({});
  // 접힌 중분류(국가) 집합 — key: `${major}||${middle}` (#7 접기/펴기)
  const [collapsedMiddles, setCollapsedMiddles] = useState(() => new Set());

  // ─── 채널별 현재 라이브 방송 개수 조회 (관리자 참고용) ───────
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/live-channels/videos", { cache: "no-store" });
      const data = await res.json();
      const byChannel = data && data.byChannel ? data.byChannel : {};
      const counts = {};
      for (const [id, vids] of Object.entries(byChannel)) {
        counts[id] = Array.isArray(vids) ? vids.length : 0;
      }
      setVideoCounts(counts);
    } catch (error) {
      // 개수는 참고용이라 실패해도 목록은 정상 표시
      console.error("[LiveChannelSection] 라이브 개수 조회 실패:", error); // TODO: 배포 전 제거
    }
  }, []);

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
    loadCounts();
  }, [reload, loadCounts]);

  // 중분류(국가) 접기/펴기 토글
  function toggleMiddle(major, middle) {
    const key = `${major}||${middle}`;
    setCollapsedMiddles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // ─── 카테고리(대/중/소분류) 이름 일괄 변경 ───────────────────
  async function handleRename(scope, major, middle, minor) {
    const cur =
      scope === "major" ? major : scope === "middle" ? middle : minor;
    const promptMsg =
      scope === "major"
        ? `대분류 '${major}' 의 새 이름을 입력하세요 (이 대분류의 모든 채널에 적용):`
        : scope === "middle"
        ? `중분류 '${middle}' 의 새 이름을 입력하세요 (대분류 '${major}' 안 이 중분류의 모든 채널에 적용):`
        : `소분류 '${minor}' 의 새 이름을 입력하세요 (이 소분류의 모든 채널에 적용):`;
    const newName = window.prompt(promptMsg, cur);
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
        body: JSON.stringify({ scope, major, middle, minor, newName: trimmed }),
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
      middle_category: ch.middle_category || "",
      minor_category: ch.minor_category || "",
      channel_input: "", // 비워두면 기존 채널 유지, 입력하면 그 링크로 교체
      lat: typeof ch.lat === "number" ? String(ch.lat) : "",
      lng: typeof ch.lng === "number" ? String(ch.lng) : "",
    });
  }

  // 수정 폼 지도 클릭 → 좌표 반영 (등록 폼과 동일 방식)
  function handleEditMapClick(coord) {
    try {
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        setEditForm((f) => ({
          ...f,
          lat: coord.lat.toFixed(6),
          lng: coord.lng.toFixed(6),
        }));
      }
    } catch (error) {
      console.error("[LiveChannelSection] 수정 지도 클릭 실패:", error); // TODO: 배포 전 제거
    }
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
        middle_category: editForm.middle_category,
        minor_category: editForm.minor_category,
      };
      // 채널 링크를 새로 입력했으면 그 링크로 교체(서버가 재해석). 비우면 기존 채널 유지.
      if (editForm.channel_input && editForm.channel_input.trim()) {
        payload.channel_input = editForm.channel_input.trim();
      }
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

  // ─── 대분류 > (중분류) > 소분류 트리 구성 ─────────────────────
  //   byMajor[M][mid][minor] = [채널들]. 중분류 없는(우주/ISS) 채널은 mid="".
  const tree = useMemo(() => {
    const byMajor = {};
    for (const ch of channels) {
      if (!ch) continue;
      const M = ch.major_category || "(미분류)";
      const mid = ch.middle_category || "";
      const m = ch.minor_category || "(미분류)";
      if (!byMajor[M]) byMajor[M] = {};
      if (!byMajor[M][mid]) byMajor[M][mid] = {};
      if (!byMajor[M][mid][m]) byMajor[M][mid][m] = [];
      byMajor[M][mid][m].push(ch);
    }
    return byMajor;
  }, [channels]);

  const majorKeys = Object.keys(tree).sort((a, b) => a.localeCompare(b, "ko"));
  // 중분류 키 정렬: 실제 국가명 먼저, "" (중분류 없음)는 뒤로.
  function sortMiddleKeys(midObj) {
    return Object.keys(midObj).sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (b === "" && a !== "") return -1;
      return a.localeCompare(b, "ko");
    });
  }

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
              const middles = tree[M];
              const middleKeys = sortMiddleKeys(middles);
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
                    {middleKeys.map((mid) => {
                      const minors = middles[mid];
                      const minorKeys = Object.keys(minors).sort((a, b) =>
                        a.localeCompare(b, "ko")
                      );
                      // 각 소분류(채널명) 그룹 렌더. 중분류가 있으면 아래에서 폴더로 감싼다.
                      const minorGroups = minorKeys.map((m) => (
                      <div key={`${mid}-${m}`} className="px-3 py-2">
                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-ink-muted">
                          <span>{m}</span>
                          <button
                            type="button"
                            onClick={() => handleRename("minor", M, mid, m)}
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
                                      중분류 (국가)
                                      <input
                                        type="text"
                                        value={editForm.middle_category}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            middle_category: e.target.value,
                                          }))
                                        }
                                        placeholder="비우면 2단계"
                                        className="mt-0.5 w-full rounded border border-border px-2 py-1 text-xs"
                                      />
                                    </label>
                                    <label className="text-[11px] text-gray-600">
                                      소분류 (채널명)
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
                                    {/* 채널 링크 변경 (선택) — 전체 폭 */}
                                    <label className="col-span-2 text-[11px] text-gray-600">
                                      채널 링크 변경 (선택 — 비우면 기존 채널 유지)
                                      <input
                                        type="text"
                                        value={editForm.channel_input}
                                        onChange={(e) =>
                                          setEditForm((f) => ({
                                            ...f,
                                            channel_input: e.target.value,
                                          }))
                                        }
                                        placeholder={`현재: ${ch.handle || ch.channel_id}  ·  새 채널 URL/@핸들/UC-id 붙여넣기`}
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

                                  {/* 위치 수정: 등록 폼과 동일하게 지도를 클릭해 마커 위치 변경 */}
                                  {!isIss && (
                                    <div className="mt-2">
                                      <div className="mb-1 text-[11px] text-gray-600">
                                        지도를 클릭해 위치를 수정하세요.
                                      </div>
                                      <div className="h-64 w-full overflow-hidden rounded-md border border-border">
                                        <LeafletMapWrapper
                                          markers={
                                            !Number.isNaN(Number(editForm.lat)) &&
                                            !Number.isNaN(Number(editForm.lng)) &&
                                            editForm.lat !== "" &&
                                            editForm.lng !== ""
                                              ? [
                                                  {
                                                    id: "edit-selected",
                                                    lat: Number(editForm.lat),
                                                    lng: Number(editForm.lng),
                                                    location: "선택한 위치",
                                                  },
                                                ]
                                              : []
                                          }
                                          center={
                                            !Number.isNaN(Number(editForm.lat)) &&
                                            editForm.lat !== ""
                                              ? {
                                                  lat: Number(editForm.lat),
                                                  lng: Number(editForm.lng),
                                                }
                                              : EDIT_MAP_CENTER
                                          }
                                          zoom={
                                            editForm.lat !== "" ? 8 : 2
                                          }
                                          onMapClick={handleEditMapClick}
                                          selectedMarkerId="edit-selected"
                                        />
                                      </div>
                                    </div>
                                  )}
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
                                {/* 현재 라이브 방송 개수 (참고용) */}
                                {typeof videoCounts[ch.id] === "number" && (
                                  <span
                                    className={
                                      "rounded px-1.5 py-0.5 text-[11px] font-semibold " +
                                      (videoCounts[ch.id] > 0
                                        ? "bg-live-light text-live"
                                        : "bg-ink/10 text-ink-muted")
                                    }
                                    title="현재 라이브 방송 개수"
                                  >
                                    🔴 {videoCounts[ch.id]}
                                  </span>
                                )}
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
                      ));
                      // 중분류 없음(우주/ISS 등 2단계): 소분류 그룹을 그대로 나열.
                      if (mid === "") return minorGroups;
                      // 중분류(국가) 폴더로 감싼다(3단계: 방송 > 국가 > 채널명). 클릭하면 접기/펴기.
                      const midKey = `${M}||${mid}`;
                      const collapsed = collapsedMiddles.has(midKey);
                      // 이 국가의 채널 수 + 현재 라이브 방송 합계
                      let chanCount = 0;
                      let liveSum = 0;
                      for (const mk of minorKeys) {
                        for (const ch of minors[mk]) {
                          chanCount += 1;
                          const c = videoCounts[ch.id];
                          if (typeof c === "number") liveSum += c;
                        }
                      }
                      return (
                        <div key={`mid-${M}-${mid}`}>
                          <div className="flex items-center gap-2 bg-surface/60 px-3 py-1.5 text-xs font-bold text-ink">
                            {/* 국가명 클릭 → 이 국가의 채널 목록 접기/펴기 */}
                            <button
                              type="button"
                              onClick={() => toggleMiddle(M, mid)}
                              className="flex items-center gap-1 hover:text-brand"
                              title="접기/펴기"
                            >
                              <span className="w-3 text-ink-muted">
                                {collapsed ? "▸" : "▾"}
                              </span>
                              <span>📂 {mid}</span>
                              <span className="font-normal text-ink-muted">
                                (채널 {chanCount})
                              </span>
                            </button>
                            <span
                              className="rounded bg-live-light px-1.5 py-0.5 text-[11px] font-semibold text-live"
                              title="이 국가의 현재 라이브 방송 합계"
                            >
                              🔴 {liveSum}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRename("middle", M, mid)}
                              className="rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-gray-600 hover:bg-gray-100"
                            >
                              중분류명 변경
                            </button>
                          </div>
                          {!collapsed && (
                            <div className="divide-y divide-border border-l-2 border-border/50 pl-2">
                              {minorGroups}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
