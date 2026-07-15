"use client";

// ─────────────────────────────────────────────────────────────
// AutoChannelForm — 관리자 "지역 자동 채널" 등록 폼 (클라이언트)
//
// 방송 채널 폼과 달리 위치·분류를 입력하지 않는다. 채널만 붙여넣으면
// 등록 즉시 서버가 그 채널을 스캔해 현재 라이브 영상을 AI로 지역 마커로 만든다.
//   - 채널: URL/@핸들/UC-id/영상링크 아무거나 → 서버가 해석 + 중복확인.
//   - 등록: POST /api/auto-channels (관리자 토큰). 응답의 scan 리포트로 결과 안내.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { getAdminIdToken } from "@/lib/clientAuth";
import StepHeader from "@/components/admin/StepHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function AutoChannelForm({ onRegistered }) {
  const [channelInput, setChannelInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // channelStatus: idle | checking | available | duplicate | invalid | error
  const [channelStatus, setChannelStatus] = useState("idle");
  const [resolvedName, setResolvedName] = useState("");
  const [checkError, setCheckError] = useState("");
  const [existingChannel, setExistingChannel] = useState(null);

  // 채널 링크 입력 → 디바운스 후 즉시확인(해석 + 중복 여부)
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
          `/api/auto-channels/check?channel_input=${encodeURIComponent(input)}`,
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

  const canSubmit =
    channelInput.trim() !== "" && channelStatus === "available" && !submitting;

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
      const res = await fetch("/api/auto-channels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel_input: channelInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const name = (data.channel && data.channel.channel_name) || "채널";
        const scan = data.scan || {};
        const made = scan.newEnriched || 0;
        const failed = scan.enrichFailed || 0;
        let detail;
        if (made > 0) {
          detail = `현재 라이브 ${made}개를 지도에 추가했습니다.`;
        } else if (failed > 0) {
          detail = `라이브를 찾았지만 위치를 특정하지 못했습니다(${failed}개). 다음 스캔에서 재시도합니다.`;
        } else {
          detail =
            "지금은 라이브 영상이 없습니다. 이 채널에서 방송이 시작되면 자동으로 추가됩니다.";
        }
        setMessage(`등록되었습니다: ${name} — ${detail}`);
        setChannelInput("");
        setChannelStatus("idle");
        setResolvedName("");
        if (typeof onRegistered === "function") onRegistered();
      } else {
        setError(data.error || "등록에 실패했습니다.");
      }
    } catch (error) {
      console.error("[AutoChannelForm] 등록 실패:", error); // TODO: 배포 전 제거
      setError("네트워크 오류로 등록에 실패했습니다: " + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-5">
      {message && (
        <div className="rounded-md border border-brand/30 bg-brand-light px-4 py-3 text-sm font-medium text-brand-hover">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-live/30 bg-live-light px-4 py-3 text-sm font-medium text-live">
          ⚠️ {error}
        </div>
      )}

      <Card>
        <StepHeader step={1} title="채널만 등록하면 끝" required>
          유튜브 <strong>채널 홈 주소</strong> · <strong>@핸들</strong> ·{" "}
          <strong>UC 채널 ID</strong>, 또는 그 채널의{" "}
          <strong>영상/라이브 링크</strong> 아무거나 붙여넣으세요. 위치·장소명·태그·설명은
          AI 가 자동으로 채웁니다. 이후 이 채널에서 새 라이브가 올라오면 자동으로 지도에
          추가됩니다.
        </StepHeader>
        <CardContent className="space-y-3">
          <Input
            type="text"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            placeholder="예: https://www.youtube.com/@channel  또는  @channel  또는  UCxxxxxxxx  또는 영상 링크"
          />

          {channelStatus === "checking" && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <span
                className="inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-border border-t-brand"
                aria-hidden="true"
              />
              채널 확인 중...
            </p>
          )}
          {channelStatus === "available" && (
            <p className="text-sm font-medium text-brand">
              ✓ 등록 가능한 채널입니다{resolvedName ? `: ${resolvedName}` : ""}.
            </p>
          )}
          {channelStatus === "invalid" && (
            <p className="text-sm text-live">
              {checkError ||
                "채널을 찾을 수 없습니다. 채널 주소/@핸들/영상 링크를 확인하세요."}
            </p>
          )}
          {channelStatus === "error" && (
            <p className="text-sm text-live">{checkError}</p>
          )}
          {channelStatus === "duplicate" && (
            <div className="rounded-md border border-live bg-live-light px-4 py-3 text-sm text-live">
              <p className="font-bold">⛔ 이미 등록된 채널입니다.</p>
              {resolvedName && <p className="mt-1">채널: {resolvedName}</p>}
              <p className="mt-1">중복 등록을 막기 위해 등록 버튼이 비활성화됩니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-11 w-full text-sm font-semibold"
        >
          {submitting ? "등록 중... (채널 확인 + AI 채우기)" : "채널 등록"}
        </Button>
        {!canSubmit && !submitting && channelStatus !== "duplicate" && (
          <p className="text-center text-xs text-ink-muted">
            등록 가능한 채널로 확인되면 등록할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
