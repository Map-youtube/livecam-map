"use client";

// ─────────────────────────────────────────────────────────────
// useAutoTranslate(texts, locale) — 한글로 입력된 동적 문자열(도시/장소명/태그)을
//   현재 언어로 자동 번역해 주는 클라이언트 훅.
//
// 반환: { tr(text) }  — tr("도쿄 시부야") → 번역 문자열(없으면 원문)
//
// 흐름:
//   - locale 이 "ko"면 번역 불필요 → 항상 원문 반환.
//   - texts 에서 고유·비공백 문자열을 추려 localStorage 캐시 먼저 조회.
//   - 캐시에 없는 것만 POST /api/translate 로 한 번에 요청 → 결과를 상태+캐시에 병합.
//   - 번역 도착 전에는 원문을 보여주고, 도착하면 리렌더되어 번역으로 교체(점진적 표시).
//
// ⚠️ 성능: 고유 문자열 목록이 실제로 바뀔 때만 요청한다(정렬·조인한 key 로 비교).
//    같은 (문자열, 언어)는 브라우저 localStorage + 서버 Firestore 양쪽에 캐시되어 재요청 없음.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";

// locale 별 localStorage 키
function cacheKey(locale) {
  return `livecam_tr_${locale}`;
}

// localStorage 에서 locale 캐시 객체 로드 (실패 시 빈 객체)
function loadCache(locale) {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(cacheKey(locale));
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (error) {
    console.error("[useAutoTranslate] 캐시 로드 실패:", error); // TODO: 배포 전 제거
    return {};
  }
}

// localStorage 에 locale 캐시 저장
function saveCache(locale, obj) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cacheKey(locale), JSON.stringify(obj));
  } catch (error) {
    console.error("[useAutoTranslate] 캐시 저장 실패:", error); // TODO: 배포 전 제거
  }
}

export function useAutoTranslate(texts, locale) {
  // 번역 맵 (원문 → 번역). locale 이 바뀌면 새로 시작.
  const [map, setMap] = useState({});
  // 진행 중 요청이 오래된 것인지 판별하기 위한 요청 순번
  const reqRef = useRef(0);

  // 입력에서 고유·비공백 문자열만 추출 (정렬해 안정적인 비교 key 생성)
  const uniqueTexts = useMemo(() => {
    const set = new Set();
    const arr = Array.isArray(texts) ? texts : [];
    for (const raw of arr) {
      if (typeof raw !== "string") continue;
      const s = raw.trim();
      if (s) set.add(s);
    }
    return [...set].sort();
  }, [texts]);

  // 고유 목록이 실제로 바뀔 때만 effect 가 돌도록 조인 문자열을 key 로 사용
  const textsKey = uniqueTexts.join("");

  useEffect(() => {
    // 한국어면 번역 불필요 → 맵 비우고 종료(원문 그대로 표시)
    if (!locale || locale === "ko") {
      setMap({});
      return;
    }
    if (uniqueTexts.length === 0) {
      setMap({});
      return;
    }

    const myReq = ++reqRef.current;
    let cancelled = false;

    // 1) localStorage 캐시로 즉시 채우기
    const cache = loadCache(locale);
    const cached = {};
    const missing = [];
    for (const s of uniqueTexts) {
      if (typeof cache[s] === "string") cached[s] = cache[s];
      else missing.push(s);
    }
    // 캐시된 부분은 바로 반영
    if (Object.keys(cached).length > 0) setMap(cached);

    // 2) 캐시에 없는 것만 서버 요청
    if (missing.length === 0) return;

    (async () => {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: missing, target: locale }),
        });
        const data = await res.json();
        if (cancelled || myReq !== reqRef.current) return;

        if (data && data.ok && data.map) {
          // 캐시 병합 + 저장
          const merged = { ...cache, ...data.map };
          saveCache(locale, merged);
          // 상태 병합(이미 반영된 cached 포함)
          setMap((prev) => ({ ...prev, ...cached, ...data.map }));
        }
      } catch (error) {
        console.error("[useAutoTranslate] 번역 요청 실패:", error); // TODO: 배포 전 제거
        // 실패 시 원문 유지 (map 에 없으면 tr 이 원문 반환)
      }
    })();

    return () => {
      cancelled = true;
    };
    // textsKey/locale 이 바뀔 때만 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textsKey, locale]);

  // 번역 조회 함수 (없으면 원문)
  const tr = useMemo(() => {
    return (text) => {
      if (typeof text !== "string") return text;
      const s = text.trim();
      if (!s) return text;
      return map[s] || text;
    };
  }, [map]);

  return { tr };
}
