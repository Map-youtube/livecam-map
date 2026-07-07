"use client";

// ─────────────────────────────────────────────────────────────
// TagSelector — 재사용 가능한 장소 특성 태그 선택 컴포넌트
//
// props:
//   - value    : 현재 선택된 태그 문자열 배열 (예: ["해변", "서핑"])
//   - onChange : 변경된 배열을 전달하는 콜백
//
// 기능:
//   - 마운트 시 GET /api/tags 로 전체 태그를 불러와 드롭다운 옵션 준비
//   - 드롭다운에서 선택 → value 에 추가 (이미 선택된 태그는 옵션에서 제외 → 중복 불가)
//   - 선택된 태그는 칩(배지)으로 표시, x 로 제거
//   - 3개면 드롭다운/새 태그 추가 비활성화 + 안내
//   - "새 태그 추가": POST /api/tags (관리자 토큰 첨부) → 성공 시 선택 + 옵션 갱신
//   - 로그인 만료 시 안내 후 로그인 페이지로 이동
//
// ⚠️ 최대 3개 제한은 이 컴포넌트(클라이언트)와 서버(POST/PATCH) 양쪽에서 모두 검증한다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
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

  // ─── 드롭다운 옵션: 이미 선택된 태그는 제외 ─────────────────
  const availableOptions = useMemo(() => {
    return allTags.filter((t) => !selected.includes(t.name));
  }, [allTags, selected]);

  // ─── 태그 추가(선택) ─────────────────────────────────────────
  function addTag(name) {
    try {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      if (selected.includes(trimmed)) return; // 중복 방지
      if (selected.length >= MAX_TAGS) return; // 3개 초과 방지
      onChange([...selected, trimmed]);
    } catch (error) {
      console.error("[TagSelector] 태그 추가 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 태그 제거 ───────────────────────────────────────────────
  function removeTag(name) {
    try {
      onChange(selected.filter((t) => t !== name));
    } catch (error) {
      console.error("[TagSelector] 태그 제거 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 드롭다운 선택 처리 ──────────────────────────────────────
  function handleSelect(e) {
    const name = e.target.value;
    if (name) addTag(name);
    // 선택 후 다시 기본값으로 (같은 항목 재선택 가능하게 하려는 게 아니라 placeholder 유지)
    e.target.value = "";
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
        // 선택 목록에 추가
        addTag(created.name);
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
      {/* 선택된 태그 칩 */}
      <div className="flex flex-wrap gap-2">
        {selected.length === 0 ? (
          <span className="text-xs text-gray-400">선택된 태그가 없습니다.</span>
        ) : (
          selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
            >
              #{name}
              <button
                type="button"
                onClick={() => removeTag(name)}
                className="text-blue-500 hover:text-blue-700"
                aria-label={`${name} 태그 제거`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {/* 3개 제한 안내 */}
      {isFull && (
        <p className="text-xs text-orange-600">
          최대 3개까지 선택할 수 있습니다.
        </p>
      )}

      {/* 드롭다운 (기존 태그 선택) */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          onChange={handleSelect}
          defaultValue=""
          disabled={isFull || loading}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
        >
          <option value="">
            {loading ? "태그 불러오는 중..." : "기존 태그 선택"}
          </option>
          {availableOptions.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

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
