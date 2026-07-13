"use client";

// ─────────────────────────────────────────────────────────────
// LiveChannelForm — 관리자 "자동 라이브 채널" 등록 폼 (클라이언트)
//
// 방송국처럼 24/7 라이브만 하는 유튜브 채널을 등록한다. 영상은 자동 수집되므로
// 입력은 최소한만: 대분류 · 소분류 · 채널(URL/@핸들/UC-id) · 지도 마커 위치.
//   - 대/소분류: 직접 입력 + 기존에 쓴 분류 자동완성(datalist) 재사용.
//   - 채널: URL/@핸들/UC-id 붙여넣기 → 서버가 channelId·표시 채널명 자동 해석.
//   - 위치: 지도를 클릭해 마커 좌표 지정(LeafletMapWrapper 재사용).
//
// 등록: POST /api/live-channels (관리자 토큰 첨부).
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import { getAdminIdToken } from "@/lib/clientAuth";

const DEFAULT_CENTER = { lat: 20, lng: 0 };

export default function LiveChannelForm({ onRegistered, existingChannels }) {
  const [major, setMajor] = useState("");
  const [minor, setMinor] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ─── 채널 링크 즉시확인 상태 (마커 등록과 동일한 UX) ─────────
  // channelStatus: idle | checking | available | duplicate | invalid | error
  const [channelStatus, setChannelStatus] = useState("idle");
  const [resolvedName, setResolvedName] = useState(""); // 해석된 채널명(미리보기)
  const [checkError, setCheckError] = useState("");
  const [existingChannel, setExistingChannel] = useState(null); // 중복 시 기존 등록 정보

  // 채널 링크 입력 → 디바운스 후 서버에 즉시확인(해석 + 중복 여부)
  useEffect(() => {
    const input = channelInput.trim();
    if (!input) {
      setChannelStatus("idle");
      setResolvedName("");
      setCheckError("");
      setExistingChannel(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      // 확인 시작(디바운스 콜백 안에서 상태 갱신 → 즉시 setState 규칙 회피)
      if (!cancelled) {
        setChannelStatus("checking");
        setResolvedName("");
        setCheckError("");
        setExistingChannel(null);
      }
      try {
        const token = await getAdminIdToken();
        if (!token) {
          if (!cancelled) {
            setChannelStatus("error");
            setCheckError("로그인이 필요합니다.");
          }
          return;
        }
        const res = await fetch(
          `/api/live-channels/check?channel_input=${encodeURIComponent(input)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "available") {
          setChannelStatus("available");
          setResolvedName(data.channel_name || "");
        } else if (data.status === "duplicate") {
          setChannelStatus("duplicate");
          setResolvedName(data.channel_name || "");
          setExistingChannel(data.existing || null);
        } else if (data.status === "invalid") {
          setChannelStatus("invalid");
          setCheckError(data.error || "채널을 찾을 수 없습니다.");
        } else {
          setChannelStatus("error");
          setCheckError(data.error || "확인에 실패했습니다.");
        }
      } catch (e) {
        if (!cancelled) {
          setChannelStatus("error");
          setCheckError("확인 중 네트워크 오류가 발생했습니다.");
        }
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [channelInput]);

  // 기존 분류 자동완성 목록.
  //   - 상위(LiveChannelSection)가 existingChannels 를 주면 그대로 사용.
  //   - 안 주면(단독 사용 시) 자체 조회한 목록(selfChannels)을 사용.
  const [selfChannels, setSelfChannels] = useState([]);
  useEffect(() => {
    // 상위가 목록을 제공하면 자체 조회하지 않는다.
    if (Array.isArray(existingChannels)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/live-channels", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.channels)) {
          setSelfChannels(data.channels);
        }
      } catch (error) {
        // 자동완성은 부가 기능이라 실패해도 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingChannels]);
  const channels = Array.isArray(existingChannels)
    ? existingChannels
    : selfChannels;

  // 대분류 자동완성 후보 (중복 제거)
  const majorOptions = useMemo(() => {
    const set = new Set();
    for (const c of channels) if (c && c.major_category) set.add(c.major_category);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [channels]);

  // 소분류 자동완성 후보 (선택된 대분류 기준, 없으면 전체)
  const minorOptions = useMemo(() => {
    const set = new Set();
    for (const c of channels) {
      if (!c || !c.minor_category) continue;
      if (major && c.major_category !== major) continue;
      set.add(c.minor_category);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [channels, major]);

  // 지도 클릭 → 좌표 반영
  function handleMapClick(coord) {
    try {
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        setLat(coord.lat.toFixed(6));
        setLng(coord.lng.toFixed(6));
      }
    } catch (error) {
      console.error("[LiveChannelForm] 지도 클릭 반영 실패:", error); // TODO: 배포 전 제거
    }
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasValidCoord =
    lat !== "" && lng !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  const mapMarkers = hasValidCoord
    ? [{ id: "selected", lat: latNum, lng: lngNum, location: "선택한 위치" }]
    : [];

  const canSubmit =
    major.trim() !== "" &&
    minor.trim() !== "" &&
    channelInput.trim() !== "" &&
    channelStatus === "available" && // 등록 가능한(중복 아님) 채널로 확인됐을 때만
    hasValidCoord &&
    !submitting;

  function resetForm() {
    setChannelInput("");
    setChannelStatus("idle");
    setResolvedName("");
    setCheckError("");
    setExistingChannel(null);
    setLat("");
    setLng("");
    // 대/소분류는 연속 등록 편의를 위해 유지한다(같은 분류로 여러 채널 등록하는 경우가 많음).
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.href = "/admin/login";
        return;
      }
      const res = await fetch("/api/live-channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel_input: channelInput.trim(),
          major_category: major.trim(),
          minor_category: minor.trim(),
          lat: latNum,
          lng: lngNum,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const name =
          (data.channel && data.channel.channel_name) || "채널";
        setMessage(`등록되었습니다: ${name} (${major.trim()} > ${minor.trim()})`);
        resetForm();
        if (typeof onRegistered === "function") onRegistered();
      } else {
        setError(data.error || "등록에 실패했습니다.");
      }
    } catch (error) {
      console.error("[LiveChannelForm] 등록 실패:", error); // TODO: 배포 전 제거
      setError("네트워크 오류로 등록에 실패했습니다: " + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-5">
      {message && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠️ {error}
        </div>
      )}

      {/* 분류 (대/소) */}
      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          1. 분류 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">
          대분류·소분류를 직접 입력하세요. 이전에 쓴 분류는 자동완성으로 다시 선택할 수 있습니다.
          (예: 대분류 <strong>방송</strong> / 소분류 <strong>한국</strong>)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600">대분류</label>
            <input
              type="text"
              list="lc-major-options"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              placeholder="예: 방송 / 우주"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <datalist id="lc-major-options">
              {majorOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-600">소분류</label>
            <input
              type="text"
              list="lc-minor-options"
              value={minor}
              onChange={(e) => setMinor(e.target.value)}
              placeholder="예: 한국 / 미국 / ISS"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <datalist id="lc-minor-options">
              {minorOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      {/* 채널 */}
      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          2. 채널 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">
          유튜브 <strong>채널 홈 주소</strong>·<strong>@핸들</strong>·<strong>UC 채널 ID</strong>,
          또는 그 채널의 <strong>영상/라이브 링크</strong> 어느 것이든 붙여넣으세요. 입력하는 즉시 등록 가능 여부를 확인합니다.
        </p>
        <input
          type="text"
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          placeholder="예: https://www.youtube.com/@NASA  또는  @NASA  또는  UCLA_DiR1FfKNvjuUpBHmylQ"
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />

        {/* 즉시확인 상태 안내 (마커 등록과 동일한 방식) */}
        {channelStatus === "checking" && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <span
              className="inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-gray-300 border-t-brand"
              aria-hidden="true"
            />
            채널 확인 중...
          </p>
        )}
        {channelStatus === "available" && (
          <p className="text-sm text-green-600">
            ✅ 등록 가능한 채널입니다{resolvedName ? `: ${resolvedName}` : ""}.
          </p>
        )}
        {channelStatus === "invalid" && (
          <p className="text-sm text-red-600">
            {checkError || "채널을 찾을 수 없습니다. 채널 주소/@핸들/영상 링크를 확인하세요."}
          </p>
        )}
        {channelStatus === "error" && (
          <p className="text-sm text-red-600">{checkError}</p>
        )}
        {channelStatus === "duplicate" && (
          <div className="rounded-md border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-bold">⛔ 이미 등록된 채널입니다.</p>
            {resolvedName && <p className="mt-1">채널: {resolvedName}</p>}
            {existingChannel && (
              <p className="mt-1">
                기존 등록 위치: {existingChannel.major_category || "-"} &gt;{" "}
                {existingChannel.minor_category || "-"}
              </p>
            )}
            <p className="mt-1">중복 등록을 막기 위해 등록 버튼이 비활성화됩니다.</p>
          </div>
        )}
      </section>

      {/* 위치 (지도) */}
      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          3. 위치 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">
          지도를 클릭해 이 채널을 표시할 마커 위치를 지정하세요. (예: 해당 방송국이 있는 도시)
        </p>
        <div className="h-[440px] w-full overflow-hidden rounded-md border border-border">
          <LeafletMapWrapper
            markers={mapMarkers}
            center={DEFAULT_CENTER}
            zoom={2}
            onMapClick={handleMapClick}
            selectedMarkerId={hasValidCoord ? "selected" : null}
            initialWorldFit={true}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600">위도 (lat)</label>
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="지도 클릭 또는 직접 입력"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">경도 (lng)</label>
            <input
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="지도 클릭 또는 직접 입력"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>
        {!hasValidCoord && (lat !== "" || lng !== "") && (
          <p className="text-sm text-red-600">위도/경도는 숫자로 입력해 주세요.</p>
        )}
      </section>

      {/* 등록 버튼 */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={
            "w-full rounded-md px-4 py-3 text-sm font-semibold text-white transition " +
            (canSubmit ? "bg-brand hover:bg-brand-hover" : "cursor-not-allowed bg-gray-300")
          }
        >
          {submitting ? "등록 중... (채널 확인)" : "채널 등록"}
        </button>
        {!canSubmit && !submitting && (
          <p className="mt-2 text-xs text-gray-500">
            대분류·소분류·채널·위치를 모두 채우면 등록할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
