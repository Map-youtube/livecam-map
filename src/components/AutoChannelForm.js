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
  const [duplicateNotice, setDuplicateNotice] = useState("");

  // channelStatus: idle | checking | available | invalid | error
  //   ("duplicate" 는 값으로 남지 않는다 — 감지 즉시 입력창을 비우고 idle 로 되돌리며,
  //    안내는 duplicateNotice 배너가 대신한다. 2026-07-29)
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
        // 새로 입력을 시작했으니 이전 중복 안내 배너는 지운다(다른 링크를 확인 중이므로).
        setDuplicateNotice("");
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
          // ⚠️ 2026-07-29: 이미 등록된 채널이면 "등록 성공" 때와 동일하게 입력창을 비운다.
          //   (더 할 일이 없으니 폼을 다시 정리해준다는 의미) 안내 메시지는 성공/실패
          //   배너와 같은 자리(상단, 지속 표시)에 남겨 사용자가 놓치지 않게 한다.
          const name = data.channel_name || "";
          setDuplicateNotice(
            `이미 등록된 채널입니다${name ? `: ${name}` : ""}. 다시 등록할 필요가 없습니다.`
          );
          setChannelInput("");
          setChannelStatus("idle");
          setResolvedName("");
          setExistingChannel(null);
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
        const failed = scan.enrichFailed || 0; // AI 호출 자체가 실패(일시 오류 등)
        const noLoc = scan.skippedNoLocation || 0; // AI 는 답했지만 위치를 특정 못 함
        const reused = scan.reused || 0; // 이미 등록돼 있던 영상 재활용
        const liveCount = scan.liveVideoCount || 0;
        const candidates = scan.candidateIdCount || 0;
        let detail;
        if (made > 0 || reused > 0) {
          detail = `현재 라이브 ${made + reused}개를 지도에 추가했습니다.`;
        } else if (failed > 0) {
          // ⚠️ 대부분 Gemini 일시 오류(429 분당제한 / 503 과부하). 영상은 정상이므로 재시도하면 된다.
          detail = `라이브 ${failed}개를 찾았지만 AI가 일시적으로 응답하지 않아 위치를 못 채웠습니다. 잠시 후 "지금 스캔"을 누르거나, 다음 자동 스캔에서 재시도됩니다.`;
        } else if (noLoc > 0) {
          detail = `라이브 ${noLoc}개를 찾았지만 특정 장소가 아닌 영상(여러 지역 모음 등)이라 지도에 올리지 않았습니다.`;
        } else if (candidates > 0 && liveCount === 0) {
          // 후보 영상은 있었는데 "현재 라이브"가 0 → 방송 종료 또는 퍼가기(임베드) 차단
          detail =
            "지금 재생 가능한 라이브가 없습니다. (방송 중이 아니거나, 채널이 퍼가기(임베드)를 막아둔 영상은 제외됩니다.) 방송이 시작되면 자동으로 추가됩니다.";
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
      {/* 이미 등록된 채널 안내 — 등록 성공 배너와 같은 방식(지속 표시 + 입력창은 이미 비워짐). */}
      {duplicateNotice && (
        <div className="rounded-md border border-live/30 bg-live-light px-4 py-3 text-sm font-medium text-live">
          ⛔ {duplicateNotice}
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
          {/* ⚠️ "duplicate" 상태는 더 이상 여기서 렌더되지 않는다(2026-07-29) — 감지 즉시
              입력창을 비우고 상태를 idle 로 되돌리며, 안내는 위 duplicateNotice 배너가 맡는다. */}
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
        {/* 등록 시 즉시 그 채널을 스캔(YouTube)해 AI(Gemini)로 영상을 채우므로 소모가 발생함 */}
        <p className="text-center text-[10px] leading-tight text-live">
          (등록 시 YouTube·Gemini 소모 — 그 채널을 즉시 1회 스캔해 영상을 채웁니다)
        </p>
        {/* channelStatus 는 이제 "duplicate" 로 남아있지 않으므로(감지 즉시 idle 로 리셋)
            별도 제외 조건이 필요 없다. */}
        {!canSubmit && !submitting && (
          <p className="text-center text-xs text-ink-muted">
            등록 가능한 채널로 확인되면 등록할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
