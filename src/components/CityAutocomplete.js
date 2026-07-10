"use client";

// ─────────────────────────────────────────────────────────────
// CityAutocomplete — 관리자 마커 등록 폼의 "도시" 입력 자동완성
//
// 목적(중복 방지):
//   같은 도시가 띄어쓰기/순서 차이로 다르게 저장되면(예: "버팔로 뉴욕주" vs "버팔로뉴욕주")
//   사이트에서 한 곳이 두 개로 표기된다. 이를 막기 위해 기존에 쓰인 도시명을 그대로
//   추천해 "완전히 똑같이" 입력하도록 유도한다.
//
// 동작:
//   - 마운트 시 /api/markers/cities 로 기존 도시명 목록을 불러온다(reloadSignal 변경 시 재로딩).
//   - 입력하면 아래에 유사 도시명을 드롭다운으로 보여준다(포털 검색 자동완성처럼).
//     · 매칭은 공백/대소문자 무시(정규화)로 하여 "버팔로"만 쳐도 "버팔로 뉴욕주"가 뜬다.
//     · 국가가 선택돼 있으면 같은 국가 도시를 위로 정렬.
//   - 추천을 클릭하면 저장된 "정확한 도시명 문자열" 그대로 입력된다.
//   - 입력값이 기존 도시와 "공백만 다르고 사실상 같은" 경우(정확히 일치하지는 않음)
//     경고를 띄워 기존 표기를 클릭해 통일하도록 안내한다.
//   - 키보드: ↓/↑ 이동, Enter 선택, Esc 닫기.
//
// props:
//   - value        : 현재 도시 입력값 (controlled)
//   - onChange(str): 값 변경 콜백
//   - country      : 현재 선택된 국가코드(추천 정렬 우선순위에 사용, 선택적)
//   - placeholder  : 입력창 placeholder
//   - reloadSignal : 값이 바뀌면 도시 목록을 다시 불러온다(등록 성공 후 갱신용)
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";

// 공백 제거 + 소문자화 정규화 (띄어쓰기/대소문자 차이로 같은 도시를 다르게 저장하는 것 방지)
function normalizeCity(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export default function CityAutocomplete({
  value,
  onChange,
  country,
  placeholder,
  reloadSignal,
}) {
  const [allCities, setAllCities] = useState([]); // 기존 도시 목록
  const [open, setOpen] = useState(false); // 드롭다운 표시 여부
  const [activeIndex, setActiveIndex] = useState(-1); // 키보드 하이라이트 인덱스
  const blurTimerRef = useRef(null); // blur 시 드롭다운 닫힘 지연 타이머

  // ─── 기존 도시 목록 로드 (마운트 + reloadSignal 변경 시) ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/markers/cities");
        const data = await res.json();
        if (!cancelled && data && data.ok && Array.isArray(data.cities)) {
          setAllCities(data.cities);
        }
      } catch (error) {
        console.error("[CityAutocomplete] 도시 목록 로드 실패:", error); // TODO: 배포 전 제거
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadSignal]);

  // ─── 언마운트 시 blur 타이머 정리 ────────────────────────────
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // ─── 입력값 기준 추천 목록 (최대 8개) ────────────────────────
  const suggestions = useMemo(() => {
    const q = normalizeCity(value);
    let list = [];
    if (q) {
      // 공백/대소문자 무시하고 부분일치하는 기존 도시
      list = allCities.filter((c) => normalizeCity(c.city).includes(q));
    } else if (country) {
      // 입력 전이라도 국가가 선택돼 있으면 그 국가 도시를 미리 보여준다
      list = allCities.filter((c) => c.country === country);
    }

    // 정렬: (1) 선택 국가 우선 → (2) 접두 일치 우선 → (3) 사용 빈도순
    const sorted = [...list].sort((a, b) => {
      const aCountry = country && a.country === country ? 0 : 1;
      const bCountry = country && b.country === country ? 0 : 1;
      if (aCountry !== bCountry) return aCountry - bCountry;
      const aPrefix = q && normalizeCity(a.city).startsWith(q) ? 0 : 1;
      const bPrefix = q && normalizeCity(b.city).startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return (b.count || 0) - (a.count || 0);
    });

    return sorted.slice(0, 8);
  }, [value, country, allCities]);

  // ─── 유사(공백만 다른) 기존 도시 → 중복 방지 경고용 ──────────
  const similarCity = useMemo(() => {
    const v = String(value || "").trim();
    if (!v) return null;
    // 이미 완전히 동일한 도시명이 존재하면 경고 불필요(정상 입력)
    const exactExists = allCities.some((c) => c.city === v);
    if (exactExists) return null;
    const nv = normalizeCity(v);
    // 정규화하면 동일한(=사실상 같은 장소로 보이는) 기존 도시들
    const candidates = allCities.filter((c) => normalizeCity(c.city) === nv);
    if (candidates.length === 0) return null;
    // 국가가 선택돼 있으면 같은 국가 후보 우선
    const sameCountry = country
      ? candidates.find((c) => c.country === country)
      : null;
    return sameCountry || candidates[0];
  }, [value, country, allCities]);

  // ─── 추천/유사 도시 선택 → 정확한 문자열로 입력 ──────────────
  function selectCity(c) {
    if (typeof onChange === "function") onChange(c.city);
    setOpen(false);
    setActiveIndex(-1);
  }

  // ─── 키보드 조작 ─────────────────────────────────────────────
  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // 하이라이트된 추천이 있으면 그것으로 확정(폼 제출 방지)
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        selectCity(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 드롭다운 항목 클릭이 먼저 처리되도록 약간 지연 후 닫는다
          blurTimerRef.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "예: Tokyo"}
        autoComplete="off"
        className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />

      {/* 자동완성 드롭다운 */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-card">
          {suggestions.map((c, idx) => (
            <li key={`${c.city}||${c.country}`}>
              <button
                type="button"
                // onMouseDown: 인풋 blur(닫힘) 전에 실행되어 클릭이 씹히지 않게 함
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCity(c);
                }}
                className={
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink " +
                  (idx === activeIndex ? "bg-brand-light" : "hover:bg-brand-light")
                }
              >
                <span className="truncate">{c.city}</span>
                <span className="flex-none text-xs text-ink-muted">
                  {c.country || ""}
                  {c.count ? ` · ${c.count}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 유사(공백만 다른) 기존 도시 경고 — 중복 방지 */}
      {similarCity && (
        <p className="mt-1 text-xs text-amber-700">
          유사한 기존 도시{" "}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              selectCity(similarCity);
            }}
            className="font-bold underline hover:text-amber-800"
          >
            &lsquo;{similarCity.city}&rsquo;
          </button>{" "}
          가 있습니다. 같은 장소라면 클릭해 <strong>동일하게</strong> 입력하세요.
        </p>
      )}
    </div>
  );
}
