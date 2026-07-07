"use client";

// ─────────────────────────────────────────────────────────────
// TagSelector — 재사용 가능한 장소 특성 태그 선택 컴포넌트 (체크박스 방식)
//
// props:
//   - value    : 현재 선택된 태그 문자열 배열 (예: ["해변", "서핑"])
//   - onChange : 변경된 배열을 전달하는 콜백
//
// 기능:
//   - 마운트 시 GET /api/tags 로 전체 태그를 불러와 체크박스 목록으로 "한 번에" 펼쳐 보여준다.
//   - 체크하면 선택(value 에 추가), 다시 체크 해제하면 제거.
//   - 최대 3개까지 선택 가능. 3개가 차면 "선택되지 않은" 체크박스는 비활성화(흐릿하게)하고,
//     "이미 선택된" 체크박스는 계속 해제할 수 있게 둔다. (실수로 3개 채웠을 때 해제 가능)
//   - 현재 선택 개수 표시 (예: "2/3개 선택됨").
//   - 목록이 길어질 수 있으므로 스크롤 영역(max-height + overflow-auto) 적용.
//   - "새 태그 추가": POST /api/tags (관리자 토큰 첨부) → 성공 시 목록에 추가되고 바로 선택됨.
//     3개가 차 있으면 새 태그 추가도 비활성화.
//   - 로그인 만료 시 안내 후 로그인 페이지로 이동.
//
// ⚠️ 최대 3개 제한은 이 컴포넌트(클라이언트)와 서버(POST/PATCH) 양쪽에서 검증한다.
// ⚠️ 각 체크박스는 그 태그의 고유 id 를 key 로, 고유 이름을 클릭 핸들러에 사용한다.
//    (CLAUDE.md 버그 예방 규칙 — 엉뚱한 태그가 선택되지 않도록)
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { getAdminIdToken } from "@/lib/clientAuth";

const MAX_TAGS = 3;

export default function TagSelector({ value, onChange }) {
  // 안전하게 배열로 취급
  const selected = Array.isArray(value) ? value : [];

  const [allTags, setAllTags] = useState([]); // [{id, name}]
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const isFull = selected.length >= MAX_TAGS;

  // ─── 전체 태그 로드 ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch("/api/tags");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok) {
          setAllTags(Array.isArray(data.tags) ? data.tags : []);
        } else {
          setLoadError(data.error || "태그 목록을 불러오지 못했습니다.");
        }
      } catch (error) {
        console.error("[TagSelector] 태그 로드 실패:", error); // TODO: 배포 전 제거
        if (!cancelled) setLoadError("태그 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 체크박스 토글 ───────────────────────────────────────────
  // 이미 선택된 태그는 언제나 해제 가능(3개 상태에서도).
  // 선택 안 된 태그는 3개 미만일 때만 추가.
  function toggleTag(name) {
    try {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;

      if (selected.includes(trimmed)) {
        // 해제
        onChange(selected.filter((t) => t !== trimmed));
      } else {
        // 추가 (3개 초과 방지)
        if (selected.length >= MAX_TAGS) return;
        onChange([...selected, trimmed]);
      }
    } catch (error) {
      console.error("[TagSelector] 태그 토글 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 새 태그 추가 (POST /api/tags) ───────────────────────────
  async function handleAddNewTag() {
    if (adding) return;
    setAddError("");

    const name = newTagName.trim();
    if (!name) {
      setAddError("새 태그 이름을 입력하세요.");
      return;
    }
    if (isFull) {
      setAddError("최대 3개까지 선택할 수 있습니다.");
      return;
    }

    setAdding(true);
    try {
      // 로그인 토큰 확보 (세션 없으면 로그인 페이지로 이동)
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.href = "/admin/login";
        return;
      }

      const res = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (res.ok && data.ok && data.tag) {
        const created = data.tag; // { id, name } (기존 것이면 그대로 반환)
        // 전체 목록에 없으면 추가 (이름 기준 중복 방지)
        setAllTags((prev) => {
          const exists = prev.some((t) => t.name === created.name);
          return exists ? prev : [...prev, created];
        });
        // 선택 목록에 추가 (3개 미만일 때만 — 위에서 isFull 을 이미 걸렀음)
        if (!selected.includes(created.name) && selected.length < MAX_TAGS) {
          onChange([...selected, created.name]);
        }
        setNewTagName("");
      } else {
        setAddError(data.error || "태그 추가에 실패했습니다.");
      }
    } catch (error) {
      console.error("[TagSelector] 새 태그 추가 실패:", error); // TODO: 배포 전 제거
      setAddError("네트워크 오류로 태그 추가에 실패했습니다.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* 선택 개수 표시 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">
          {selected.length}/{MAX_TAGS}개 선택됨
        </span>
        {isFull && (
          <span className="text-xs text-orange-600">
            최대 3개까지 선택할 수 있습니다.
          </span>
        )}
      </div>

      {/* 체크박스 목록 (스크롤 영역) */}
      {loading ? (
        <p className="text-xs text-gray-500">태그 불러오는 중...</p>
      ) : loadError ? (
        <p className="text-xs text-red-600">{loadError}</p>
      ) : allTags.length === 0 ? (
        <p className="text-xs text-gray-500">등록된 태그가 없습니다.</p>
      ) : (
        <div className="max-h-48 overflow-auto rounded-md border border-gray-200 p-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            {allTags.map((t) => {
              // 각 체크박스는 이 태그의 고유 id/이름만 참조한다.
              const checked = selected.includes(t.name);
              // 선택 안 됐고 이미 3개면 비활성화 (선택된 건 해제 가능하므로 활성)
              const disabled = !checked && isFull;
              return (
                <label
                  key={t.id}
                  className={
                    "flex cursor-pointer items-center gap-1.5 text-sm " +
                    (disabled ? "cursor-not-allowed text-gray-300" : "text-gray-700")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleTag(t.name)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 새 태그 추가 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="새 태그 이름"
          disabled={isFull}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
        />
        <button
          type="button"
          onClick={handleAddNewTag}
          disabled={isFull || adding}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium text-white " +
            (isFull || adding
              ? "cursor-not-allowed bg-gray-300"
              : "bg-gray-700 hover:bg-gray-800")
          }
        >
          {adding ? "추가 중..." : "새 태그 추가"}
        </button>
      </div>

      {addError && <p className="text-xs text-red-600">{addError}</p>}
    </div>
  );
}
