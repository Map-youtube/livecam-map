"use client";

// ─────────────────────────────────────────────────────────────
// VideoListPanel — 영상 목록 패널 (클라이언트)
//
// props:
//   - markers          : 현재 필터링된 마커 배열
//   - onClose          : 닫기 콜백
//   - onSelectMarker   : 카드 클릭 콜백 (펼치기/접기 + 지도 이동은 부모가 결정)
//   - title            : 패널 상단 제목
//   - expandedMarkerId : 현재 펼쳐진(재생 중인) 마커 id
//
// 재생불가 자동 감지:
//   - 펼쳐진 영상은 유튜브 IFrame Player API 로 만들어 onError 를 구독한다.
//   - 에러 발생 시 코드에 맞는 reason 으로 POST /api/markers/{id}/report-error 신고.
//   - 신고 성공 시 안내를 표시하고 잠시 후 그 카드를 목록에서 제거(새로고침 없이).
//   - 유튜브 API(videos.list) 를 호출하지 않는다(플레이어 에러 신호만 서버에 기록) → 무료.
//
// 카드 선택 UX:
//   - 카드 자체는 선택해도 크기가 커지지 않는다(3열 그리드 크기 고정).
//   - 선택된 카드는 빨간 테두리 + 은은한 발광(card-playing, globals.css)으로 표시.
//   - 영상은 카드 안이 아니라, 그 카드가 속한 "한 줄(최대 3개)" 바로 아래에
//     별도 영역으로 펼쳐진다 → 아래에 있던 다음 줄들이 자연스럽게 밀려 내려간다.
//     (grid-template-rows 를 0fr↔1fr 로 트랜지션해 사이가 벌어지듯 부드럽게 열고 닫는다)
// ─────────────────────────────────────────────────────────────

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import LiveDot from "@/components/LiveDot";
import Thumbnail from "@/components/DefaultThumbnail";
import { useI18n } from "@/components/i18n/LanguageProvider";

// 한 줄에 표시할 카드 수 (그리드 열 수와 반드시 일치)
const COLUMNS = 3;

// ─── 유튜브 IFrame API 로더 (전역, 한 번만 로드) ──────────────
let ytApiPromise = null;
function loadYouTubeApi() {
  try {
    if (typeof window === "undefined") return Promise.resolve();
    // 이미 로드 완료된 경우 즉시 resolve
    if (window.YT && window.YT.Player) return Promise.resolve();
    // 로딩 중이면 같은 프로미스 재사용
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve) => {
      // 기존 콜백을 보존해 체이닝 (다른 곳에서 설정했을 수도 있으므로)
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          if (typeof prevCallback === "function") prevCallback();
        } catch (e) {
          // 이전 콜백 오류는 무시
        }
        resolve();
      };

      // 스크립트 중복 로드 방지 (window 전역 플래그)
      if (!window.__ytIframeApiLoading) {
        window.__ytIframeApiLoading = true;
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        document.head.appendChild(tag);
      }
    });
    return ytApiPromise;
  } catch (error) {
    console.error("[VideoListPanel] YT API 로드 실패:", error); // TODO: 배포 전 제거
    return Promise.resolve();
  }
}

// ─── 유튜브 에러 코드 → 신고 reason 매핑 ──────────────────────
// 2: 잘못된 파라미터, 5: HTML5 플레이어 에러,
// 100: 영상을 찾을 수 없음(삭제/비공개), 101 또는 150: 퍼가기(임베드) 차단
function mapErrorToReason(code) {
  if (code === 101 || code === 150) return "embed_blocked";
  if (code === 100 || code === 2 || code === 5) return "video_error";
  return "unknown";
}

// ─── 썸네일 URL (저장값 우선, 없으면 video_id 로 생성) ────────
function getThumb(marker) {
  if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
  if (marker.youtube_video_id)
    return `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`;
  return null;
}

// ─── 상태 배지 종류 판정 (라벨은 다국어라 렌더에서 t 로 처리) ──
// 우선순위: 비활성(is_active===false) → 재생불가(auto_disabled===true) → LIVE
function getStatusKind(marker) {
  if (marker.is_active === false) return "inactive";
  if (marker.auto_disabled === true) return "disabled";
  return "live";
}

// 상태 배지 컴포넌트 (썸네일 위/카드에 올리는 작은 배지). label 은 번역된 문자열.
function StatusBadge({ kind, label }) {
  if (kind === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-live-light px-2 py-0.5 text-xs font-semibold text-live shadow-card">
        <LiveDot size="sm" />
        {label}
      </span>
    );
  }
  // 재생불가/비활성은 회색조로 톤다운
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-xs font-semibold text-white">
      {label}
    </span>
  );
}

// 위치 핀 아이콘 (작은 SVG)
function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden="true"
      className="flex-none"
      fill="currentColor"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// InlinePlayer — 유튜브 IFrame Player API 로 만든 인라인 플레이어
//   - onError(reason) 콜백으로 에러를 상위에 알린다.
//   - 언마운트/전환 시 player.destroy() 로 정리 (메모리 누수 방지).
// ─────────────────────────────────────────────────────────────
function InlinePlayer({ videoId, title, onError }) {
  // iframe 요소에 부여할 고유 id (마커/랜덤 조합)
  const iframeIdRef = useRef(
    `yt-player-${videoId}-${Math.random().toString(36).slice(2, 8)}`
  );
  const iframeId = iframeIdRef.current;
  const playerRef = useRef(null);
  // 최신 onError 를 참조로 유지 → 부모 리렌더로 player 를 재생성하지 않음
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let destroyed = false;

    async function setup() {
      try {
        await loadYouTubeApi();
        if (destroyed) return;
        if (!window.YT || !window.YT.Player) return;

        // 이미 렌더된 iframe(enablejsapi=1) 에 바인딩
        playerRef.current = new window.YT.Player(iframeId, {
          events: {
            onError: (event) => {
              try {
                const reason = mapErrorToReason(event && event.data);
                if (typeof onErrorRef.current === "function") {
                  onErrorRef.current(reason);
                }
              } catch (e) {
                console.error("[VideoListPanel] onError 처리 실패:", e); // TODO: 배포 전 제거
              }
            },
          },
        });
      } catch (e) {
        console.error("[VideoListPanel] YT 플레이어 초기화 실패:", e); // TODO: 배포 전 제거
      }
    }
    setup();

    // 정리: 플레이어 파괴
    return () => {
      destroyed = true;
      try {
        if (
          playerRef.current &&
          typeof playerRef.current.destroy === "function"
        ) {
          playerRef.current.destroy();
        }
      } catch (e) {
        console.error("[VideoListPanel] YT 플레이어 정리 실패:", e); // TODO: 배포 전 제거
      }
      playerRef.current = null;
    };
  }, [videoId, iframeId]);

  return (
    <div
      style={{ aspectRatio: "16 / 9" }}
      className="w-full overflow-hidden rounded bg-black"
    >
      <iframe
        id={iframeId}
        // enablejsapi=1 로 IFrame API 제어/이벤트 구독 가능
        // mute=1: 기본 음소거(회사/학교 등에서 소리 없이 재생) — 사용자가 플레이어에서 켤 수 있음
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1`}
        title={title || "youtube video"}
        className="h-full w-full"
        style={{ border: 0 }}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export default function VideoListPanel({
  markers,
  onClose,
  onSelectMarker,
  title,
  tr,
  expandedMarkerId,
}) {
  const list = Array.isArray(markers) ? markers : [];

  // 다국어: 정적 문자열(t) + 국가명(countryName). 동적(도시/장소/태그)은 tr 프롭.
  const { t, countryName } = useI18n();
  const trFn = typeof tr === "function" ? tr : (x) => x;
  // 상태 배지 종류 → 번역 라벨
  const badgeLabel = { live: t("live"), disabled: t("disabled"), inactive: t("inactive") };

  // 재생불가로 신고되어 안내를 표시할 마커 (id → 메시지)
  const [noticeIds, setNoticeIds] = useState({});
  // 목록에서 제거된 마커 id 집합 (신고 성공 후 잠시 뒤 숨김)
  const [removedIds, setRemovedIds] = useState(() => new Set());
  // 중복 신고 방지용 (이미 신고한 마커 id)
  const reportedRef = useRef(new Set());
  // 지연 제거 타이머 정리용
  const timersRef = useRef([]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      try {
        timersRef.current.forEach((timer) => clearTimeout(timer));
      } catch (e) {
        // 무시
      }
      timersRef.current = [];
    };
  }, []);

  // ─── 재생불가 신고 처리 (onError → report-error) ─────────────
  const handleUnplayable = useCallback(async (marker, reason) => {
    try {
      if (!marker || !marker.id) return;
      // 같은 마커 중복 신고 방지 (여러 번 onError 가 와도 1회만)
      if (reportedRef.current.has(marker.id)) return;
      reportedRef.current.add(marker.id);

      const res = await fetch(`/api/markers/${marker.id}/report-error`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || "unknown" }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // 안내 표시
        setNoticeIds((prev) => ({
          ...prev,
          [marker.id]: t("unplayable"),
        }));
        // 잠시 후 목록에서 제거 (새로고침 없이 사라지게)
        const timer = setTimeout(() => {
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.add(marker.id);
            return next;
          });
        }, 2500);
        timersRef.current.push(timer);
      }
    } catch (error) {
      console.error("[VideoListPanel] 재생불가 신고 실패:", error); // TODO: 배포 전 제거
    }
  }, [t]);

  // 카드 클릭 처리 → 부모가 펼치기/접기 + 지도 이동을 결정
  function handleCardClick(marker) {
    try {
      if (typeof onSelectMarker === "function") {
        onSelectMarker(marker);
      }
    } catch (error) {
      console.error("[VideoListPanel] 카드 클릭 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  // 영상 접기(X) → 부모에 null 전달 (지도 위치는 그대로)
  function handleCollapse() {
    try {
      if (typeof onSelectMarker === "function") {
        onSelectMarker(null);
      }
    } catch (error) {
      console.error("[VideoListPanel] 영상 접기 실패:", error); // TODO: 배포 전 제거
    }
  }

  function handleClose() {
    try {
      if (typeof onClose === "function") onClose();
    } catch (error) {
      console.error("[VideoListPanel] 닫기 처리 실패:", error); // TODO: 배포 전 제거
    }
  }

  // 화면에 실제로 보일 목록 (신고로 제거된 것 제외)
  const visibleList = list.filter((m) => m && !removedIds.has(m.id));

  // 닫히는 애니메이션 동안에도 영상을 유지하기 위한 상태.
  // (선택 해제 시 expandedMarkerId 가 즉시 null 이 되면 영상이 애니메이션 전에 사라져
  //  높이만 0으로 툭 줄어든다 → 마지막 마커를 붙잡아 두고 높이만 접어 부드럽게 닫는다)
  // ⚠️ 렌더 중 갱신 패턴: id 가 실제로 바뀔 때만 setState → 무한 렌더 없음.
  const [lastExpandedMarker, setLastExpandedMarker] = useState(null);
  if (expandedMarkerId != null) {
    const m = visibleList.find((x) => x && x.id === expandedMarkerId);
    if (m && (!lastExpandedMarker || lastExpandedMarker.id !== m.id)) {
      setLastExpandedMarker(m);
    }
  }
  // 영상 영역에 실제로 그릴 마커: 열려 있으면 현재 선택, 닫히는 중이면 마지막 선택.
  const displayMarker =
    (expandedMarkerId != null &&
      visibleList.find((m) => m && m.id === expandedMarkerId)) ||
    lastExpandedMarker;

  // 닫힘: 선택이 풀리면 닫힘 애니메이션(300ms) 동안 영상을 유지했다가 언마운트한다.
  // (grid-template-rows 의 fr 전환은 transitionend 를 발생시키지 않으므로 타이머로 처리)
  // 재선택/전환되면 expandedMarkerId 가 다시 채워져 이 타이머는 취소된다(재생 유지).
  useEffect(() => {
    if (expandedMarkerId != null) return;
    if (lastExpandedMarker == null) return;
    const timer = setTimeout(() => setLastExpandedMarker(null), 350);
    return () => clearTimeout(timer);
  }, [expandedMarkerId, lastExpandedMarker]);

  // ─── 영상이 열리면 그 영상이 화면에 보이도록 목록을 자동 스크롤 ──
  // 아래쪽 카드를 눌러도 펼쳐진 영상이 잘리지 않게, 펼침 애니메이션(300ms) 후
  // 최종 높이 기준으로 영상 영역을 보이는 위치까지 스크롤한다.
  const videoAreaRef = useRef(null);
  useEffect(() => {
    if (expandedMarkerId == null) return;
    const timer = setTimeout(() => {
      try {
        if (videoAreaRef.current) {
          videoAreaRef.current.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      } catch (error) {
        console.error("[VideoListPanel] 자동 스크롤 실패:", error); // TODO: 배포 전 제거
      }
    }, 360);
    return () => clearTimeout(timer);
  }, [expandedMarkerId]);

  // 카드를 COLUMNS 개씩 "줄" 단위로 묶는다 — 선택된 카드가 속한 줄 바로 아래에만
  // 영상 영역을 넣기 위함(그 줄의 다음 줄들은 자연스럽게 아래로 밀려난다).
  const rows = [];
  for (let i = 0; i < visibleList.length; i += COLUMNS) {
    rows.push(visibleList.slice(i, i + COLUMNS));
  }

  return (
    // 루트는 투명 — 헤더(불투명)와 카드 목록 영역(반투명)만 각자 배경을 갖는다.
    <div className="flex h-full flex-col">
      {/* 상단: 제목 + 닫기 버튼 (소분류/제목 영역 — 불투명 유지) */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3">
        <h2 className="truncate font-display text-sm font-bold text-ink">
          {title || t("videoList")}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label={t("closePanel")}
          className="ml-2 rounded-md p-1 text-ink-muted transition hover:bg-brand-light hover:text-brand"
        >
          ✕
        </button>
      </div>

      {/* 카드 목록 (세로 스크롤) — 배경만 반투명(30%)+블러로 뒤 지도가 비치게 한다 */}
      <div className="flex-1 overflow-auto bg-bg/30 p-3 backdrop-blur-md">
        {visibleList.length === 0 ? (
          <p className="mt-6 text-center text-sm text-ink-muted">
            {t("noVideos")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row, rowIndex) => {
              // 이 줄이 "지금 열려 있어야 하는지"(현재 선택된 카드가 이 줄에 있는지)
              const rowOpen =
                expandedMarkerId != null &&
                row.some((m) => m && m.id === expandedMarkerId);
              // 이 줄이 영상 내용을 그려야 하는지(열림 + 닫히는 중 모두 = displayMarker 소속 줄)
              const rowMarker =
                displayMarker && row.some((m) => m && m.id === displayMarker.id)
                  ? displayMarker
                  : null;

              return (
                <Fragment key={row[0] ? row[0].id : rowIndex}>
                  {/* 한 줄 — 최대 COLUMNS 개, 선택해도 카드 크기는 고정 */}
                  <div className="grid grid-cols-3 gap-2">
                    {row.map((marker) => {
                      // 각 카드는 이 marker 의 고유 데이터만 참조한다.
                      const thumb = getThumb(marker);
                      const badgeKind = getStatusKind(marker);
                      const countryLabel = marker.country
                        ? countryName(marker.country)
                        : "";
                      const regionText = [
                        marker.city ? trFn(marker.city) : "",
                        countryLabel,
                      ]
                        .filter((v) => v)
                        .join(", ");

                      // 이 카드가 현재 선택되어(재생 중) 있는지 — 반드시 자기 id 로 비교
                      const isSelected =
                        expandedMarkerId != null && marker.id === expandedMarkerId;

                      return (
                        <button
                          key={marker.id}
                          type="button"
                          onClick={() => handleCardClick(marker)}
                          className={
                            // flex-col + 썸네일 flex-none: 카드 높이가 서로 달라도(제목 줄 수 차이 등
                            // 그리드 stretch 로 늘어나도) 썸네일은 항상 카드 최상단에 딱 붙는다.
                            "group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-surface text-left shadow-sm ring-1 ring-black/[0.02] transition duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg " +
                            // 선택된 카드: 빨간 테두리 + 은은하게 켜졌다 꺼지는 발광(box-shadow 애니메이션)
                            (isSelected ? "card-playing" : "")
                          }
                        >
                          {/* 썸네일 (16:9) + 좌상단 상태 배지 (카드가 corner 를 클립하므로 썸네일은 각지게).
                              flex-none: 카드가 세로로 늘어나도 썸네일은 16:9 를 유지하며 최상단에 고정. */}
                          <div className="relative aspect-video w-full flex-none overflow-hidden bg-ink/5">
                            {/* 없거나 로딩 실패 시 기본 이미지로 대체 */}
                            <Thumbnail
                              src={thumb}
                              alt={marker.location ? trFn(marker.location) : t("noName")}
                              className="h-full w-full object-cover"
                            />
                            {/* 상태 배지: 좌상단에 고정하고 5% 축소(origin-top-left 로 코너 기준) */}
                            <div className="absolute left-1 top-1 origin-top-left scale-95">
                              <StatusBadge kind={badgeKind} label={badgeLabel[badgeKind]} />
                            </div>
                          </div>

                          {/* 본문 (카드가 작아 여백/글자 축소, 제목은 2줄까지 자동 줄바꿈) */}
                          <div className="p-2">
                            {/* 장소명 (제목, 2줄까지 자동 줄바꿈) */}
                            <h3 className="line-clamp-2 font-display text-xs font-semibold leading-snug text-ink">
                              {marker.location ? trFn(marker.location) : t("noName")}
                            </h3>

                            {/* 지역 정보 (위치 핀 + 도시/국가) */}
                            {regionText && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
                                <PinIcon />
                                <span className="truncate">{regionText}</span>
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 이 줄에 선택된 카드가 있을 때만 그 바로 아래에 영상 영역을 편다.
                      max-height 트랜지션으로 부드럽게 열리며, 영상이 "실제 높이"를 차지해
                      아래 줄을 밀어내고 스크롤 영역(scrollHeight)에도 포함된다
                      → 아래쪽 카드를 눌러도 자동 스크롤로 영상까지 내려갈 수 있다. */}
                  <div
                    className="overflow-hidden transition-[max-height] duration-300 ease-out"
                    style={{ maxHeight: rowOpen ? "600px" : "0px" }}
                  >
                    {rowMarker && (
                        <div
                          ref={videoAreaRef}
                          className="relative mt-2 overflow-hidden rounded-md"
                        >
                          {/* 접기(X) 버튼 — 영상만 접고 지도 위치는 유지 */}
                          <button
                            type="button"
                            onClick={handleCollapse}
                            aria-label={t("collapseVideo")}
                            className="absolute right-1 top-1 z-10 rounded-md bg-ink/70 px-1.5 py-0.5 text-xs text-white transition hover:bg-ink"
                          >
                            ✕
                          </button>

                          {noticeIds[rowMarker.id] ? (
                            // 재생불가 신고 안내 (영상 대신 표시)
                            <div className="flex min-h-24 w-full items-center justify-center rounded-md bg-live-light px-3 py-4 text-center text-xs text-live">
                              {noticeIds[rowMarker.id]}
                            </div>
                          ) : rowMarker.youtube_video_id ? (
                            // 유튜브 IFrame Player API 기반 인라인 플레이어 (에러 감지)
                            <InlinePlayer
                              key={rowMarker.id}
                              videoId={rowMarker.youtube_video_id}
                              title={rowMarker.location || "youtube video"}
                              onError={(reason) => handleUnplayable(rowMarker, reason)}
                            />
                          ) : (
                            <div className="flex h-24 w-full items-center justify-center rounded-md bg-ink/5 text-xs text-ink-muted">
                              {t("noVideoInfo")}
                            </div>
                          )}
                        </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
