"use client";

// ─────────────────────────────────────────────────────────────
// EarthquakeAlert — 지진 발생 알림 팝업
//
// 요구사항 대응:
//   1) 지진 레이어 토글(🌍 지진) 상태와 무관하게 항상 동작한다. 규모 4.5 이상이면 알림.
//   2) 규모·위치·발생시각·깊이 + 지진에서 가장 가까운 라이브캠 카드를 함께 보여준다.
//   3) 각 영상 카드에 지진 위치로부터의 거리를 표기한다.
//   4) "지도에서 보기" 버튼으로 지진 위치로 이동한다(지진 레이어도 자동으로 켠다).
//   5) 팝업 바깥 테두리가 빨간 경고등처럼 깜빡인다(.eq-alert-blink, globals.css).
//   6) "자세히 보기" 로 서버 렌더 상세 페이지(/earthquake/[id])에 연결 → 검색 노출 통로.
//   7~11) 규모별 유지 기간(1·2·2.5·3·5일)과 "본 사람에겐 다시 안 뜸"은 earthquakeAlert.js 가 계산.
//   12) 추가: 쓰나미 경보 배지, USGS 예상 피해 등급(PAGER), 공유 버튼, USGS 원문 링크.
//
// ⚠️ 비용: /api/earthquakes(USGS 무료 피드, 서버에서 5분 캐시)만 호출한다.
//    Firestore·YouTube·AI 호출이 전혀 없다. 근접 계산은 이미 화면에 있는 마커로 브라우저에서 한다.
// ⚠️ localStorage 를 쓰므로 마운트 이후에만 렌더한다(서버/클라이언트 불일치 방지).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { getMagnitudeColor } from "@/lib/earthquakeUtils";
import {
  formatDistanceKm,
  groupNearestByDistance,
  isAlertMuted,
  muteAlertsForDay,
  NEAR_TIER_1_KM,
  NEAR_TIER_2_KM,
  pagerAlertStyle,
  pickAlertEarthquake,
} from "@/lib/earthquakeAlert";

// 지진 목록 재조회 주기(서버가 5분 캐시하므로 그에 맞춘다)
const REFRESH_MS = 5 * 60 * 1000;

// 마커 썸네일 (VideoListPanel 과 동일 규칙 — 저장된 URL 우선, 없으면 video_id 로 생성)
function getThumb(marker) {
  try {
    if (!marker) return null;
    if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
    if (marker.youtube_video_id) {
      return `https://i.ytimg.com/vi/${marker.youtube_video_id}/mqdefault.jpg`;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export default function EarthquakeAlert({
  markers,
  onFocusEarthquake,
  onSelectMarker,
  tr,
}) {
  const { t, locale } = useI18n();

  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState(null); // 지금 띄울 지진 1건
  // 이번에 함께 닫음 처리할 지진 id 목록(닫을 때 한 번에 기록 → 팝업 연쇄 노출 방지)
  const eligibleIdsRef = useRef([]);
  // ⚠️ "이번 화면에서 닫은" 지진 목록 — localStorage 가 아니라 메모리에만 둔다.
  //    새로고침/재접속하면 초기화되어 다시 보인다(사용자 요구: 신규 접속에는 다시 노출).
  //    영구히 끄고 싶으면 "오늘 하루 보지 않기" 버튼(24시간 전체 음소거)을 쓴다.
  const dismissedRef = useRef({});

  const trFn = typeof tr === "function" ? tr : (x) => x;

  useEffect(() => {
    setMounted(true);
  }, []);

  // ─── 지진 목록 조회 → 띄울 대상 선정 (레이어 토글과 무관하게 항상) ──
  useEffect(() => {
    if (!mounted) return undefined;
    let cancelled = false;
    let timer = null;

    async function load() {
      try {
        // "오늘 하루 보지 않기"를 누른 상태면 아예 조회/표시하지 않는다.
        if (isAlertMuted()) {
          setTarget(null);
          return;
        }
        const res = await fetch("/api/earthquakes", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.earthquakes) ? data.earthquakes : [];
        const { target: next, eligibleIds } = pickAlertEarthquake(
          list,
          dismissedRef.current
        );
        // 이미 같은 지진이 떠 있으면 그대로 둔다(사용자가 읽는 중에 깜빡이며 교체되지 않게).
        setTarget((prev) => {
          if (prev && next && prev.id === next.id) return prev;
          return next;
        });
        eligibleIdsRef.current = eligibleIds;
      } catch (error) {
        console.error("[EarthquakeAlert] 지진 조회 실패:", error); // TODO: 배포 전 제거
      }
    }

    load(); // 즉시 1회
    timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [mounted]);

  // ─── 닫기(✕): "이번 화면에서만" 닫는다 ───────────────────────
  //   메모리에만 기록하므로 새로고침/재접속하면 다시 보인다(사용자 요구).
  const handleClose = useCallback(() => {
    try {
      const ids = eligibleIdsRef.current;
      const list = ids && ids.length > 0 ? ids : target ? [target.id] : [];
      for (const id of list) dismissedRef.current[id] = Date.now();
    } catch (error) {
      // 기록 실패는 무시
    }
    setTarget(null);
  }, [target]);

  // ─── "오늘 하루 보지 않기": 24시간 동안 모든 지진 알림 숨김 ────
  const handleMuteToday = useCallback(() => {
    try {
      muteAlertsForDay();
    } catch (error) {
      // 저장 실패는 무시
    }
    setTarget(null);
  }, []);

  // ─── 진앙 기준 거리 구간별 라이브캠 (500km / 1,000km) ──────────
  //   1,000km 를 넘는 곳은 제외 → 둘 다 비면 "가까운 지역 영상 없음"을 보여준다.
  const nearby = useMemo(() => {
    if (!target) return { within500: [], within1000: [], hasAny: false };
    return groupNearestByDistance(markers, target.lat, target.lng, { limit: 6 });
  }, [target, markers]);

  // ─── "지도에서 보기" ─────────────────────────────────────────
  const handleViewOnMap = useCallback(() => {
    try {
      if (target && typeof onFocusEarthquake === "function") {
        // ⚠️ 클릭된 그 지진 "자신"의 좌표로 이동한다.
        onFocusEarthquake({ lat: target.lat, lng: target.lng });
      }
    } catch (error) {
      console.error("[EarthquakeAlert] 지도 이동 실패:", error); // TODO: 배포 전 제거
    }
    handleClose();
  }, [target, onFocusEarthquake, handleClose]);

  // ─── 카드 클릭 → 그 라이브캠 재생 ────────────────────────────
  const handleCardClick = useCallback(
    (marker) => {
      try {
        // ⚠️ 반복 렌더된 각 카드는 "자기 자신의" 마커를 넘긴다(고정값 참조 금지).
        if (typeof onSelectMarker === "function") onSelectMarker(marker);
      } catch (error) {
        console.error("[EarthquakeAlert] 카드 선택 실패:", error); // TODO: 배포 전 제거
      }
      handleClose();
    },
    [onSelectMarker, handleClose]
  );

  // ─── 공유 (요구사항 12: 큰 지진일수록 유입 통로가 된다) ────────
  const handleShare = useCallback(async () => {
    if (!target) return;
    try {
      const url = `${window.location.origin}/earthquake/${encodeURIComponent(
        target.id
      )}`;
      const title = `${t("eqAlertTitle")} M${magText(target.magnitude)} · ${
        target.place || ""
      }`;
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch (error) {
      // 사용자가 공유를 취소한 경우 등 — 무시
    }
  }, [target, t]);

  if (!mounted || !target) return null;

  const mag = magText(target.magnitude);
  const magColor = getMagnitudeColor(target.magnitude);
  const pager = pagerAlertStyle(target.alert);
  const timeText = formatTime(target.time, locale);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        // 모바일: 하단 중앙(모바일 '목록 열기' 버튼과 겹치지 않게 위로), 데스크톱: 우측 하단
        "fixed z-[1200] w-[calc(100%-1.5rem)] max-w-sm " +
        "bottom-20 left-1/2 -translate-x-1/2 " +
        "md:bottom-6 md:left-auto md:right-4 md:translate-x-0"
      }
    >
      <div className="eq-alert-blink overflow-hidden rounded-xl border border-live/40 bg-surface shadow-card">
        {/* ── 헤더: 규모 배지 + 제목 + 닫기 ── */}
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
          <span
            className="mt-0.5 flex-none rounded-md px-2 py-1 text-sm font-bold text-white"
            style={{ backgroundColor: magColor }}
          >
            M{mag}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-ink">
              🚨 {t("eqAlertTitle")}
            </p>
            <p className="truncate text-xs text-ink-muted" title={target.place}>
              {trFn(target.place || "")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("close")}
            className="tap-target -mr-1 flex-none rounded p-1 text-ink-muted transition hover:bg-brand-light hover:text-brand"
          >
            ✕
          </button>
        </div>

        {/* ── 상세 정보: 발생시각 / 깊이 / 경보 배지 ── */}
        <div className="space-y-1 px-3 py-2 text-xs text-ink">
          {timeText && (
            <p>
              <span className="text-ink-muted">{t("dateOccurred")}:</span>{" "}
              {timeText}
            </p>
          )}
          {target.depthKm != null && (
            <p>
              <span className="text-ink-muted">{t("depth")}:</span>{" "}
              {Math.round(target.depthKm)} km
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {target.tsunami === 1 && (
              <span className="rounded-full bg-live-light px-2 py-0.5 text-[11px] font-semibold text-live">
                🌊 {t("eqTsunami")}
              </span>
            )}
            {pager && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: pager.color }}
              >
                {t(pager.key)}
              </span>
            )}
          </div>
        </div>

        {/* ── 가장 가까운 라이브캠 (500km 이내 / 1,000km 이내로 구분) ── */}
        <div className="border-t border-border px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold text-ink-muted">
            {t("eqNearbyCams")}
          </p>
          {!nearby.hasAny ? (
            // 1,000km 안에 아무것도 없으면 "가까운 지역 영상 없음"
            <p className="py-1 text-xs text-ink-muted">{t("eqNoNearby")}</p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto overscroll-contain">
              {/* ⚠️ 각 구간은 자기 목록만 렌더한다(구간 라벨 + 그 구간 마커들) */}
              {[
                { key: "t1", label: `${NEAR_TIER_1_KM}km`, list: nearby.within500 },
                {
                  key: "t2",
                  label: `${NEAR_TIER_2_KM.toLocaleString()}km`,
                  list: nearby.within1000,
                },
              ]
                .filter((g) => g.list.length > 0)
                .map((group) => (
                  <div key={group.key}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      {t("eqWithin").replace("{d}", group.label)}
                    </p>
                    <ul className="space-y-1">
                      {group.list.map((m) => {
                        // ⚠️ 각 항목은 자기 자신(m)의 데이터만 참조한다.
                        const thumb = getThumb(m);
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => handleCardClick(m)}
                              className="flex w-full items-center gap-2 rounded-md p-1 text-left transition hover:bg-secondary"
                            >
                              <span className="relative block h-9 w-16 flex-none overflow-hidden rounded bg-ink/5">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-ink">
                                  {trFn(m.location || "")}
                                </span>
                                <span className="block truncate text-[11px] text-ink-muted">
                                  📍 {formatDistanceKm(m.distanceKm)}
                                  {m.city ? ` · ${trFn(m.city)}` : ""}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ── 동작 버튼: 지도에서 보기 / 자세히 보기 / 공유 ── */}
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={handleViewOnMap}
            className="tap-target flex-1 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover"
          >
            🗺️ {t("eqViewOnMap")}
          </button>
          <Link
            href={`/earthquake/${encodeURIComponent(target.id)}`}
            className="tap-target rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-secondary"
          >
            {t("eqDetails")}
          </Link>
          <button
            type="button"
            onClick={handleShare}
            aria-label={t("eqShare")}
            title={t("eqShare")}
            className="tap-target rounded-md border border-border px-2.5 py-1.5 text-xs text-ink transition hover:bg-secondary"
          >
            🔗
          </button>
        </div>

        {/* ── 오늘 하루 보지 않기 (24시간 전체 음소거) ──
            ✕ 닫기는 새로고침하면 다시 뜨므로, 완전히 끄고 싶은 사용자를 위한 출구. */}
        <div className="border-t border-border px-3 py-1.5 text-center">
          <button
            type="button"
            onClick={handleMuteToday}
            className="text-[11px] text-ink-muted underline-offset-2 transition hover:text-ink hover:underline"
          >
            {t("eqMuteToday")}
          </button>
        </div>
      </div>
    </div>
  );
}

// 규모 표기 (숫자 아니면 "-")
function magText(mag) {
  return typeof mag === "number" ? mag.toFixed(1) : "-";
}

// 발생시각 → 보는 사람의 현지 표기
function formatTime(time, locale) {
  if (time == null) return "";
  try {
    return new Date(time).toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}
