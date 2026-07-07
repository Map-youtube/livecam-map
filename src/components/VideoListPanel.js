"use client";

// ─────────────────────────────────────────────────────────────
// VideoListPanel — 영상 목록 패널 (클라이언트)
//
// props:
//   - markers        : 현재 필터링된 마커 배열
//   - onClose        : 닫기 콜백
//   - onSelectMarker : 카드 클릭 콜백 (이번 단계는 자리만 — 콘솔 로그)
//   - title          : 패널 상단 제목 (예: "도쿄 (5)" 또는 "#야경 (12)")
//
// 이번 단계: 목록 카드 표시 + 열기/닫기만. 카드 클릭 시 지도 이동/영상 재생은 다음 단계.
// ─────────────────────────────────────────────────────────────

import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";

// ─── 썸네일 URL (저장값 우선, 없으면 video_id 로 생성) ────────
function getThumb(marker) {
  if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
  if (marker.youtube_video_id)
    return `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`;
  return null;
}

// ─── 상태 배지 (기존 로직과 동일 기준) ────────────────────────
// 우선순위: 비활성(is_active===false) → 재생불가(auto_disabled===true) → LIVE
function getStatusBadge(marker) {
  if (marker.is_active === false) {
    return { text: "⚫ 비활성", className: "bg-gray-200 text-gray-700" };
  }
  if (marker.auto_disabled === true) {
    return { text: "⚫ 재생불가", className: "bg-orange-100 text-orange-700" };
  }
  return { text: "🔴 LIVE", className: "bg-red-100 text-red-700" };
}

export default function VideoListPanel({
  markers,
  onClose,
  onSelectMarker,
  title,
  expandedMarkerId,
}) {
  const list = Array.isArray(markers) ? markers : [];

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

  return (
    <div className="flex h-full flex-col">
      {/* 상단: 제목 + 닫기 버튼 */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
        <h2 className="truncate text-sm font-bold text-gray-800">
          {title || "영상 목록"}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="패널 닫기"
          className="ml-2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          ✕
        </button>
      </div>

      {/* 카드 목록 (세로 스크롤) */}
      <div className="flex-1 overflow-auto p-2">
        {list.length === 0 ? (
          <p className="mt-4 text-center text-sm text-gray-400">
            등록된 영상이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((marker) => {
              // 각 카드는 이 marker 의 고유 데이터만 참조한다.
              const thumb = getThumb(marker);
              const badge = getStatusBadge(marker);
              const countryLabel = marker.country
                ? COUNTRY_NAME_BY_CODE[marker.country] || marker.country
                : "";
              const regionText = [marker.city, countryLabel]
                .filter((v) => v)
                .join(", ");
              const tags = Array.isArray(marker.tags) ? marker.tags : [];

              // 이 카드가 현재 펼쳐진(재생 중인) 카드인지 — 반드시 자기 id 로 비교
              const isExpanded =
                expandedMarkerId != null && marker.id === expandedMarkerId;
              // 이미 저장된 video_id 를 그대로 사용 (유튜브 API 재호출 없음)
              const videoId = marker.youtube_video_id || "";

              return (
                <div
                  key={marker.id}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* 클릭 영역(헤더): 썸네일 + 정보 */}
                  <button
                    type="button"
                    onClick={() => handleCardClick(marker)}
                    className="block w-full text-left"
                  >
                    {/* 썸네일 (카드 상단, 넓게) */}
                    {thumb ? (
                      // 원격 이미지라 next/image 대신 일반 img 사용
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={marker.location || "썸네일"}
                        className="h-32 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center bg-gray-100 text-xs text-gray-400">
                        썸네일 없음
                      </div>
                    )}

                    {/* 본문 */}
                    <div className="p-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-bold text-gray-900">
                          {marker.location || "(장소명 없음)"}
                        </h3>
                        <span
                          className={
                            "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold " +
                            badge.className
                          }
                        >
                          {badge.text}
                        </span>
                      </div>

                      {/* 지역 정보 */}
                      {regionText && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {regionText}
                        </p>
                      )}

                      {/* 특성 태그 배지 */}
                      {tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* 펼쳐진 경우: 카드 바로 아래 인라인 영상 (아코디언) */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-2">
                      <div className="relative">
                        {/* 접기(X) 버튼 — 영상만 접고 지도 위치는 유지 */}
                        <button
                          type="button"
                          onClick={handleCollapse}
                          aria-label="영상 접기"
                          className="absolute right-1 top-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-black/80"
                        >
                          ✕
                        </button>

                        {videoId ? (
                          // 16:9 비율의 인라인 iframe (이미 저장된 video_id 사용)
                          <div
                            style={{ aspectRatio: "16 / 9" }}
                            className="w-full overflow-hidden rounded bg-black"
                          >
                            <iframe
                              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                              title={marker.location || "youtube video"}
                              className="h-full w-full"
                              style={{ border: 0 }}
                              allow="autoplay; encrypted-media; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <div className="flex h-24 w-full items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                            영상 정보가 없습니다.
                          </div>
                        )}
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
