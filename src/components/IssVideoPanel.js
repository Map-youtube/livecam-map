"use client";

// ─────────────────────────────────────────────────────────────
// IssVideoPanel — ISS(Space) 선택 시 표시되는 NASA 라이브 영상 목록 패널
//
// props:
//   - videos  : NASA 라이브 영상 배열 [{videoId,title,thumbnailUrl,channelName}]
//               (MainMapView 가 /api/iss/videos 를 5분마다 호출해 목록을 관리하고 내려준다.
//                트리의 개수 배지와 같은 목록을 공유 → 중복 호출 방지)
//               null 이면 "불러오는 중", 빈 배열이면 "라이브 없음".
//   - issInfo : 현재 ISS 위치 정보 { lat, lng, altKm, speedKmh, visibility } | null (상단 표시)
//   - onClose : 패널 닫기 콜백
//
// 동작:
//   - 카드 클릭 → 카드 아래 인라인 YouTube iframe 재생(아코디언, 한 번에 하나).
//   - 라이브 0개 → "현재 진행 중인 NASA 라이브가 없습니다" 빈 상태 표시.
//
// ⚠️ NASA 라이브는 관리자 등록 마커가 아니므로 재생불가 신고(report-error)는 하지 않는다.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import LiveDot from "@/components/LiveDot";

// ─── ISS 위치 정보 한 줄 요약 (null 값은 생략) ────────────────
function IssInfoBar({ issInfo }) {
  // 좌표가 없으면(추적 꺼짐 등) 표시하지 않는다.
  if (!issInfo || typeof issInfo.lat !== "number" || typeof issInfo.lng !== "number") {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 border-b border-border bg-surface px-4 py-2 text-[11px] text-ink-muted">
      <span>
        위도 {issInfo.lat.toFixed(2)}, 경도 {issInfo.lng.toFixed(2)}
      </span>
      {issInfo.altKm != null && (
        <span>· 고도 {Math.round(issInfo.altKm).toLocaleString("en-US")}km</span>
      )}
      {issInfo.speedKmh != null && (
        <span>
          · 속도 {Math.round(issInfo.speedKmh).toLocaleString("en-US")}km/h
        </span>
      )}
      {issInfo.visibility === "daylight" && <span>· 낮 구간 ☀️</span>}
      {issInfo.visibility === "eclipsed" && <span>· 밤 구간 🌙</span>}
    </div>
  );
}

export default function IssVideoPanel({ videos, issInfo, onClose }) {
  // 현재 펼쳐진(재생 중인) 영상 videoId (없으면 null)
  const [expandedId, setExpandedId] = useState(null);

  // videos 가 아직 안 온 상태(null/undefined)면 로딩으로 취급
  const loading = videos == null;
  const list = Array.isArray(videos) ? videos : [];

  // ─── 카드 클릭 → 재생 토글 (같은 카드 다시 클릭하면 접기) ───
  function toggleExpand(videoId) {
    try {
      setExpandedId((prev) => (prev === videoId ? null : videoId));
    } catch (error) {
      console.error("[IssVideoPanel] 카드 토글 실패:", error); // TODO: 배포 전 제거
    }
  }

  function handleClose() {
    try {
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error("[IssVideoPanel] 닫기 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* 상단: 제목(개수 포함) + 닫기 */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3">
        <h2 className="truncate font-display text-sm font-bold text-ink">
          🛰️ ISS · NASA 라이브{!loading ? ` (${list.length})` : ""}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="패널 닫기"
          className="ml-2 rounded-md p-1 text-ink-muted transition hover:bg-brand-light hover:text-brand"
        >
          ✕
        </button>
      </div>

      {/* ISS 현재 위치 정보 (작게) */}
      <IssInfoBar issInfo={issInfo} />

      {/* 라이브 카드 목록 */}
      <div className="flex-1 overflow-auto p-3">
        {loading ? (
          <p className="mt-6 text-center text-sm text-ink-muted">
            NASA 라이브를 불러오는 중...
          </p>
        ) : list.length === 0 ? (
          // 빈 상태 (빈 공간 금지 원칙)
          <div className="mt-6 flex flex-col items-center gap-2 px-4 text-center">
            <span className="text-3xl">🛰️</span>
            <p className="text-sm text-ink-muted">
              현재 진행 중인 NASA 라이브가 없습니다
            </p>
            <p className="text-xs text-ink-muted">
              방송이 시작되면 최대 5분 내 목록에 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map((v) => {
              // 각 카드는 이 영상의 고유 videoId 만 참조한다.
              const isExpanded = expandedId === v.videoId;
              return (
                <div
                  key={v.videoId}
                  className="overflow-hidden rounded-lg border border-border bg-surface shadow-card transition duration-150 hover:-translate-y-0.5"
                >
                  {/* 클릭 영역: 썸네일 + 정보 */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(v.videoId)}
                    className="block w-full text-left"
                  >
                    {/* 썸네일 (16:9) + 좌상단 LIVE 배지 */}
                    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-ink/5">
                      {v.thumbnailUrl ? (
                        // 원격 이미지라 next/image 대신 일반 img 사용
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.thumbnailUrl}
                          alt={v.title || "NASA 라이브"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-ink-muted">
                          썸네일 없음
                        </div>
                      )}
                      <div className="absolute left-2 top-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-live-light px-2 py-0.5 text-xs font-semibold text-live shadow-card">
                          <LiveDot size="sm" />
                          LIVE
                        </span>
                      </div>
                    </div>

                    {/* 본문: 제목 + 채널명 */}
                    <div className="p-3">
                      <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink">
                        {v.title || "(제목 없음)"}
                      </h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        {v.channelName || "NASA"}
                      </p>
                    </div>
                  </button>

                  {/* 펼쳐진 경우: 카드 아래 인라인 iframe (아코디언) */}
                  {isExpanded && (
                    <div className="border-t border-border p-3">
                      <div
                        style={{ aspectRatio: "16 / 9" }}
                        className="w-full overflow-hidden rounded bg-black"
                      >
                        <iframe
                          src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
                          title={v.title || "NASA live"}
                          className="h-full w-full"
                          style={{ border: 0 }}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
