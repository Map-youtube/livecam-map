"use client";

// ─────────────────────────────────────────────────────────────
// AutoChannelList — 관리자 "지역 자동 채널" 목록/관리 (클라이언트)
//
// 구조(item 7): 채널명 → 그 채널에서 현재 사이트에 보여지는 영상들(하위 목록).
//   각 영상 행: 썸네일 / 장소명(제목) / 대륙·국가·도시 / 태그 / 라이브 배지 / [수정][삭제]
//   - 수정: 기존 수동 마커와 같은 필드(장소명·좌표·도시·국가·대륙·태그·설명).
//           단 '재생확인'은 자동 채널 방식에선 의미가 없어 제공하지 않는다.
//   - 채널 [삭제] 시 그 채널의 자동 마커도 함께 삭제.
// 상단 도구: [지금 스캔] · [기존 마커에서 채널 가져오기] · [새로고침]
//
// 데이터: GET /api/auto-channels(채널) + GET /api/auto-channels/markers(영상).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminIdToken } from "@/lib/clientAuth";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 관리자 수정 일시(ms) → "YYYY.MM.DD" (없으면 빈 문자열)
function fmtEditedDate(ms) {
  try {
    if (!ms) return "";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")}`;
  } catch (error) {
    return "";
  }
}

// 대륙 코드 → 한글 라벨(표시용)
const CONTINENT_KO = {
  asia: "아시아",
  europe: "유럽",
  north_america: "북아메리카",
  south_america: "남아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

export default function AutoChannelList({ refreshSignal }) {
  const [channels, setChannels] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(""); // 진행 중 작업 라벨
  const [notice, setNotice] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set()); // 펼쳐진 채널

  // 목록 로드
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [chRes, mkRes] = await Promise.all([
        fetch("/api/auto-channels", { cache: "no-store" }),
        fetch("/api/auto-channels/markers", { cache: "no-store" }),
      ]);
      const chData = await chRes.json();
      const mkData = await mkRes.json();
      setChannels(Array.isArray(chData.channels) ? chData.channels : []);
      setMarkers(Array.isArray(mkData.markers) ? mkData.markers : []);
    } catch (e) {
      console.error("[AutoChannelList] 로드 실패:", e); // TODO: 배포 전 제거
      setError("목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // 채널별 영상 그룹핑 (라이브 먼저)
  const markersByChannel = useMemo(() => {
    const map = new Map();
    for (const m of markers) {
      const key = m.source_channel_id || "(미상)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.is_live === true ? 1 : 0) - (a.is_live === true ? 1 : 0));
    }
    return map;
  }, [markers]);

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 인증 토큰 헬퍼
  async function authHeaders() {
    const token = await getAdminIdToken();
    if (!token) {
      window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
      window.location.href = "/admin/login";
      return null;
    }
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  // 지금 스캔 (전체)
  async function handleScanNow() {
    setBusy("scan");
    setNotice("");
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/auto-channels/scan", { method: "POST", headers });
      const data = await res.json();
      if (res.ok && data.ok) {
        const s = data.scan || {};
        setNotice(
          `스캔 완료: 새 영상 ${s.newEnriched || 0}개 추가, 재활용 ${s.reused || 0}개, 종료 ${s.markedEnded || 0}개, videos.list ${s.videosListUnits || 0}유닛` +
            (s.aiCapReached ? " (일일 AI 상한 도달 — 나머지는 다음 스캔)" : "")
        );
        await load();
      } else {
        setNotice(data.error || "스캔에 실패했습니다.");
      }
    } catch (e) {
      setNotice("스캔 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  // 재생 상태 전수 점검 (현재 게시 중인 자동 마커를 YouTube 실제 상태로 재검증 → 재생불가 숨김)
  async function handleVerifyPlayback() {
    setBusy("verify");
    setNotice("");
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/auto-channels/verify-playback", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const r = data.byReason || {};
        if (data.hidden > 0) {
          setNotice(
            `재생 상태 점검 완료: ${data.checked}개 확인, 재생불가 ${data.hidden}개 숨김` +
              ` (임베드차단 ${r.embed_blocked || 0} · 라이브종료 ${r.stream_ended || 0} · 라이브아님 ${r.not_live || 0} · 삭제 ${r.video_deleted || 0})`
          );
        } else {
          setNotice(`재생 상태 점검 완료: ${data.checked}개 확인, 재생불가 영상 없음 ✅`);
        }
        await load();
      } else {
        setNotice(data.error || "점검에 실패했습니다.");
      }
    } catch (e) {
      setNotice("점검 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  // 지역 소개글(대륙/국가/주요도시) AI 생성 — 없는 것만, 한 번에 일부씩(cap)
  async function handleGenRegionDescriptions() {
    setBusy("regiondesc");
    setNotice("");
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/region-descriptions/generate", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const b = data.byType || {};
        setNotice(
          `지역 설명 생성: ${data.generated}개 생성 (대륙 ${b.continent || 0} · 국가 ${b.country || 0} · 도시 ${b.city || 0}), 남은 지역 ${data.remaining || 0}개` +
            (data.remaining > 0
              ? " — 남은 게 있으면 버튼을 다시 눌러 이어서 생성하세요."
              : " ✅ 전부 완료")
        );
      } else {
        setNotice(data.error || "지역 설명 생성에 실패했습니다.");
      }
    } catch (e) {
      setNotice("지역 설명 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  // 기존 마커에서 채널 가져오기
  async function handleImport() {
    if (!window.confirm("기존 '등록된 마커 목록'에서 유튜브 채널을 추출해 자동 채널로 등록합니다. 계속할까요?"))
      return;
    setBusy("import");
    setNotice("");
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch("/api/auto-channels/import-from-markers", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotice(
          `${data.created}개 채널 등록` +
            ` (영상 링크로 ${data.resolvedFromVideos ?? 0}개 역추적` +
            (data.videosListUnits
              ? `, YouTube ${data.videosListUnits}유닛 사용`
              : "") +
            `, 중복 제외 ${data.skippedExisting}` +
            (data.unresolvedVideos
              ? `, 삭제/비공개 영상 ${data.unresolvedVideos}`
              : "") +
            `). "지금 스캔"으로 영상을 채우세요.`
        );
        await load();
      } else {
        setNotice(data.error || "가져오기에 실패했습니다.");
      }
    } catch (e) {
      setNotice("가져오기 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  // 채널 삭제 (+마커)
  async function handleDeleteChannel(ch) {
    if (
      !window.confirm(
        `채널 "${ch.channel_name || ch.channel_id}" 과 이 채널이 만든 지도 마커를 모두 삭제합니다. 계속할까요?`
      )
    )
      return;
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/auto-channels/${ch.id}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotice(`삭제됨: ${ch.channel_name || ch.channel_id} (마커 ${data.deletedMarkers || 0}개)`);
        await load();
      } else {
        setNotice(data.error || "삭제에 실패했습니다.");
      }
    } catch (e) {
      setNotice("삭제 중 오류가 발생했습니다.");
    }
  }

  // 마커(영상) 삭제
  async function handleDeleteMarker(m) {
    if (!window.confirm(`영상 "${m.location || m.youtube_title || m.id}" 마커를 삭제합니다. 계속할까요?`))
      return;
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/auto-channels/markers/${m.id}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await load();
      } else {
        setNotice(data.error || "삭제에 실패했습니다.");
      }
    } catch (e) {
      setNotice("삭제 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      {/* 도구 모음 — 각 버튼 아래에 "누르면 소모하는 API"를 작은 글씨로 표기 */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-col items-start gap-0.5">
          <Button type="button" onClick={handleScanNow} disabled={busy !== ""}>
            {busy === "scan" ? "스캔 중..." : "지금 스캔"}
          </Button>
          <span className="px-1 text-[10px] leading-tight text-live">
            (YouTube·Gemini 소모)
          </span>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleVerifyPlayback}
            disabled={busy !== ""}
            title="현재 게시 중인 영상을 실제 재생 가능 여부로 전수 점검해 재생불가 영상을 숨깁니다"
          >
            {busy === "verify" ? "점검 중..." : "재생 상태 점검"}
          </Button>
          <span className="px-1 text-[10px] leading-tight text-live">
            (YouTube 소모)
          </span>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleImport}
            disabled={busy !== ""}
          >
            {busy === "import" ? "가져오는 중..." : "기존 마커에서 채널 가져오기"}
          </Button>
          <span className="px-1 text-[10px] leading-tight text-live">
            (YouTube 소모)
          </span>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleGenRegionDescriptions}
            disabled={busy !== ""}
            title="대륙/국가/주요도시 SEO 페이지의 소개글을 AI로 생성합니다(없는 것만, 1회성)"
          >
            {busy === "regiondesc" ? "설명 생성 중..." : "지역 설명 생성(AI)"}
          </Button>
          <span className="px-1 text-[10px] leading-tight text-ink-muted">
            (Gemini 소모 · 없는 것만)
          </span>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <Button type="button" variant="outline" onClick={load} disabled={busy !== ""}>
            새로고침
          </Button>
          <span className="px-1 text-[10px] leading-tight text-brand">
            (소모 없음)
          </span>
        </div>

        <span className="self-center text-xs text-ink-muted">
          채널 {channels.length}개 · 영상 {markers.length}개
        </span>
      </div>

      {notice && (
        <div className="rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm text-brand-hover">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-live/30 bg-live-light px-3 py-2 text-sm text-live">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted">불러오는 중...</p>
      ) : channels.length === 0 ? (
        <p className="text-sm text-ink-muted">
          등록된 자동 채널이 없습니다. 왼쪽 "지역 자동 채널 등록"에서 채널을 추가하거나,
          위 "기존 마커에서 채널 가져오기"를 이용하세요.
        </p>
      ) : (
        <ul className="space-y-1">
          {channels.map((ch) => {
            const vids = markersByChannel.get(ch.id) || [];
            const liveCount = vids.filter((v) => v.is_live === true).length;
            const open = openIds.has(ch.id);
            return (
              <li
                key={ch.id}
                className="overflow-hidden rounded-md border border-border bg-surface"
              >
                {/* 채널 헤더 — 세로 패딩을 줄여(py-1) 행 높이를 낮춰 더 많이 보이게 */}
                <div className="flex items-center gap-2 px-2.5 py-1">
                  <button
                    type="button"
                    onClick={() => toggleOpen(ch.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="text-ink-muted">{open ? "▾" : "▸"}</span>
                    <span className="truncate text-sm font-semibold text-ink">
                      {ch.channel_name || ch.channel_id}
                    </span>
                    <span className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-ink-muted">
                      {liveCount}/{vids.length}
                    </span>
                    {ch.source === "imported" && (
                      <span className="flex-none rounded-full bg-brand-light px-1.5 py-0.5 text-[11px] text-brand-hover">
                        가져옴
                      </span>
                    )}
                    {ch.is_active === false && (
                      <span className="flex-none rounded-full bg-live-light px-1.5 py-0.5 text-[11px] text-live">
                        비활성
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDeleteChannel(ch)}
                    className="h-7 flex-none px-2 text-xs"
                  >
                    삭제
                  </Button>
                </div>

                {/* 영상 하위 목록 */}
                {open && (
                  <div className="border-t border-border">
                    {vids.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-ink-muted">
                        아직 이 채널에서 수집된 영상이 없습니다. "지금 스캔"을 눌러보세요.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {vids.map((m) => (
                          <AutoMarkerRow
                            key={m.id}
                            marker={m}
                            onDelete={() => handleDeleteMarker(m)}
                            onSaved={load}
                            authHeaders={authHeaders}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── 영상(자동 마커) 한 줄 + 수정 폼 ─────────────────────────
function AutoMarkerRow({ marker, onDelete, onSaved, authHeaders }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    location: marker.location || "",
    city: marker.city || "",
    country: marker.country || "",
    lat: marker.lat ?? "",
    lng: marker.lng ?? "",
    tags: Array.isArray(marker.tags) ? marker.tags.join(", ") : "",
    ko: (marker.description && marker.description.ko) || "",
    en: (marker.description && marker.description.en) || "",
  });

  const thumb =
    marker.youtube_thumbnail_url ||
    (marker.youtube_video_id
      ? `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`
      : null);

  // ─── 위치 미세조정 지도 ──────────────────────────────────────
  // 최초 중심: 마커의 저장 좌표(없으면 세계 뷰). 클릭해도 중심은 다시 옮기지 않는다
  // (클릭할 때마다 지도가 튀지 않도록 — 기존 마커 등록 폼과 동일한 방식).
  const hasInitCoord =
    typeof marker.lat === "number" && typeof marker.lng === "number";
  const [mapCenter] = useState(
    hasInitCoord ? { lat: marker.lat, lng: marker.lng } : { lat: 20, lng: 0 }
  );
  const mapZoom = hasInitCoord ? 9 : 2;

  // 지도 클릭 → 폼의 위도/경도 갱신 (아래 입력칸도 함께 바뀜)
  function handleMapClick(coord) {
    try {
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        setForm((f) => ({
          ...f,
          lat: coord.lat.toFixed(6),
          lng: coord.lng.toFixed(6),
        }));
      }
    } catch (error) {
      console.error("[AutoChannelList] 지도 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  // 현재 폼 좌표(문자열) → 지도에 찍을 마커 1개
  const latNum = Number(form.lat);
  const lngNum = Number(form.lng);
  const hasCoord =
    form.lat !== "" &&
    form.lng !== "" &&
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum);
  const mapMarkers = hasCoord
    ? [{ id: "edit", lat: latNum, lng: lngNum, location: form.location || "선택 위치" }]
    : [];

  async function save() {
    setSaving(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch(`/api/auto-channels/markers/${marker.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          location: form.location,
          city: form.city,
          country: form.country,
          lat: form.lat === "" ? undefined : Number(form.lat),
          lng: form.lng === "" ? undefined : Number(form.lng),
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          description: { ko: form.ko, en: form.en },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setEditing(false);
        if (typeof onSaved === "function") await onSaved();
      } else {
        window.alert(data.error || "수정에 실패했습니다.");
      }
    } catch (e) {
      window.alert("수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-12 w-20 flex-none rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-12 w-20 flex-none rounded bg-secondary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {marker.location || marker.youtube_title || marker.id}
            </span>
            {marker.is_active === false ? (
              <span className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                숨김(위치미상)
              </span>
            ) : marker.is_live === true ? (
              <span className="flex-none rounded-full bg-live-light px-1.5 py-0.5 text-[10px] font-semibold text-live">
                ● LIVE
              </span>
            ) : (
              <span className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-ink-muted">
                종료
              </span>
            )}
            {/* 관리자가 수정한 영상이면 수정 일시를 배지로 표시(내가 손본 것 구분용) */}
            {marker.admin_edited_at ? (
              <span
                className="flex-none rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-medium text-brand-hover"
                title={`관리자 수정: ${new Date(marker.admin_edited_at).toLocaleString("ko-KR")}`}
              >
                ✎ 수정 {fmtEditedDate(marker.admin_edited_at)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {[CONTINENT_KO[marker.continent] || marker.continent, marker.country, marker.city]
              .filter(Boolean)
              .join(" · ") || "위치 미상"}
            {Array.isArray(marker.tags) && marker.tags.length > 0
              ? ` · ${marker.tags.join(", ")}`
              : ""}
          </p>
        </div>
        <div className="flex flex-none gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing((v) => !v)}
            className="h-8 px-2 text-xs"
          >
            {editing ? "닫기" : "수정"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="h-8 px-2 text-xs"
          >
            삭제
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-bg/50 p-3">
          {/* 위치 미세 조정 지도 — 지도를 클릭하면 아래 위도/경도가 자동으로 갱신된다 */}
          <div>
            <p className="mb-1 text-[11px] text-ink-muted">
              📍 지도를 클릭해 위치를 미세 조정하세요. (아래 위도/경도가 자동으로 바뀝니다)
            </p>
            <div className="h-[260px] w-full overflow-hidden rounded-md border border-border">
              <LeafletMapWrapper
                markers={mapMarkers}
                center={mapCenter}
                zoom={mapZoom}
                onMapClick={handleMapClick}
                selectedMarkerId={hasCoord ? "edit" : null}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <LabeledInput label="장소명" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
            <LabeledInput label="도시" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
            <LabeledInput label="국가(ISO2)" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
            <LabeledInput label="태그(쉼표)" value={form.tags} onChange={(v) => setForm((f) => ({ ...f, tags: v }))} />
            <LabeledInput label="위도(lat)" value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} />
            <LabeledInput label="경도(lng)" value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} />
          </div>
          <LabeledTextarea label="설명(한국어)" value={form.ko} onChange={(v) => setForm((f) => ({ ...f, ko: v }))} />
          <LabeledTextarea label="설명(영어)" value={form.en} onChange={(v) => setForm((f) => ({ ...f, en: v }))} />
          <p className="text-[11px] text-ink-muted">
            국가(ISO2)를 바꾸면 대륙은 자동으로 다시 분류됩니다. ('재생확인' 기능은 자동 채널에는
            없습니다.)
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} className="h-8 px-3 text-xs">
              취소
            </Button>
            <Button type="button" onClick={save} disabled={saving} className="h-8 px-3 text-xs">
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
      />
    </label>
  );
}
