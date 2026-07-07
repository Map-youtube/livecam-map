"use client";

// ─────────────────────────────────────────────────────────────
// AiDescriptionEditor — AI 장소 설명 검토/수정/확정 모달
//
// props:
//   - marker  : { id, description: { ko, en }, description_confirmed, ... }
//   - onSaved : 저장 성공 시 호출 (상위에서 목록 갱신)
//   - onClose : 모달 닫기 (선택적)
//
// 동작:
//   - AI가 생성한 ko/en 설명을 textarea 로 미리보기 + 수정
//   - "확정 저장" → PATCH /api/markers/[id] 로 description + description_confirmed:true 저장
//     (youtube_url 을 바꾸지 않으므로 videos.list 재호출 없음 — 기존 [id] route 로직 그대로)
//   - 이미 확정된 경우 "✅ 확정됨" 표시하되 재수정 가능
//   - AI 설명이 비어있으면 실패 안내 + 빈 textarea 로 수동 입력 유도
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

export default function AiDescriptionEditor({ marker, onSaved, onClose }) {
  // 기존 설명 안전하게 읽기 (description 이 없을 수도 있음)
  const initialKo =
    marker && marker.description && typeof marker.description.ko === "string"
      ? marker.description.ko
      : "";
  const initialEn =
    marker && marker.description && typeof marker.description.en === "string"
      ? marker.description.en
      : "";

  const [ko, setKo] = useState(initialKo);
  const [en, setEn] = useState(initialEn);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const confirmed = marker && marker.description_confirmed === true;
  // 최초 AI 설명이 둘 다 비어있는지 (생성 실패 안내용)
  const aiEmpty = initialKo.trim() === "" && initialEn.trim() === "";

  // ─── 확정 저장 (PATCH) ─────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setErrorMsg("");
    setSavedMsg("");

    try {
      const res = await fetch(`/api/markers/${marker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: { ko: ko, en: en },
          description_confirmed: true,
          // youtube_url 을 보내지 않으므로 videos.list 재호출 없음 (비용 0)
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setSavedMsg("확정 저장되었습니다.");
        // 상위에 알림 (목록 갱신). 콜백이 모달을 닫는 구조라면 여기서 닫힘.
        if (typeof onSaved === "function") onSaved(data.marker || null);
      } else {
        setErrorMsg(data.error || "저장에 실패했습니다.");
      }
    } catch (error) {
      console.error("[AiDescriptionEditor] 저장 실패:", error); // TODO: 배포 전 제거
      setErrorMsg("네트워크 오류로 저장에 실패했습니다: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            AI 장소 설명
            {confirmed ? (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
                ✅ 확정됨
              </span>
            ) : (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-yellow-700">
                ⏳ 미확정
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => (typeof onClose === "function" ? onClose() : null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* AI 생성 실패 안내 */}
        {aiEmpty && (
          <div className="mb-3 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            AI 설명 생성에 실패했습니다. 직접 입력해주세요.
          </div>
        )}

        {/* 성공/에러 메시지 */}
        {savedMsg && (
          <div className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
            {savedMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* 한국어 설명 */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-700">
            한국어 설명 (ko)
          </label>
          <textarea
            value={ko}
            onChange={(e) => setKo(e.target.value)}
            rows={4}
            placeholder="한국어 장소 소개를 입력하세요."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 영어 설명 */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-700">
            영어 설명 (en)
          </label>
          <textarea
            value={en}
            onChange={(e) => setEn(e.target.value)}
            rows={4}
            placeholder="Enter the place introduction in English."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 버튼 */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => (typeof onClose === "function" ? onClose() : null)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={
              "rounded-md px-4 py-2 text-sm font-semibold text-white " +
              (saving
                ? "cursor-not-allowed bg-gray-300"
                : "bg-blue-600 hover:bg-blue-700")
            }
          >
            {saving ? "저장 중..." : "확정 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
