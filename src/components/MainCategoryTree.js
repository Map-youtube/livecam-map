"use client";

// ─────────────────────────────────────────────────────────────
// MainCategoryTree — 메인 화면 왼쪽 카테고리 트리 (클라이언트, 사용자용)
//
// props: markers(배열), tags(배열), onSelectLocation(선택적), onSelectTag(선택적)
//
// 구성:
//   - 상단 "지역": markers 기반 대륙 → 국가 → 도시 트리 (접기/펼치기 + 각 단계 마커 개수).
//     국가명은 countryList 의 한국어 국가명을 사용.
//   - 하단 "특성 태그": tags 목록을 클릭 가능한 목록으로 표시 (구분선으로 분리).
//   - 좁은 폭(10%)에 맞춰 작은 폰트 + 스크롤(overflow-auto).
//
// 클릭은 콜백으로 부모에 전달만 한다 (실제 동작은 다음 단계에서 구현).
//   - onSelectLocation({ continent, country, city })
//   - onSelectTag(tagName)
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

// 대륙 표시 순서
const CONTINENT_ORDER = [
  "asia",
  "europe",
  "north_america",
  "south_america",
  "africa",
  "oceania",
  "middleeast",
];

// ─── 접기/펼치기 그룹 (내부 헬퍼) ─────────────────────────────
// 캐럿으로 펼치고, 라벨 클릭 시 onSelect 콜백 호출.
function CollapsibleRow({
  label,
  count,
  depth,
  defaultOpen,
  forceOpen,
  onSelect,
  children,
  // ancestorActive: 이 노드의 하위(자식 도시/ISS)가 선택되어 있으면 약하게 강조
  ancestorActive,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const hasChildren = Boolean(children);

  // 최상위(대륙/Space) 레벨은 글자를 살짝 크게(+1pt) + 굵게 표시한다.
  const isTop = depth === 0;

  // forceOpen 이 true 로 바뀌면(예: 지도에서 마커를 클릭해 그 도시가 선택된 경우)
  // 이 노드를 자동으로 펼친다. (사용자가 이후 수동으로 접는 것은 그대로 허용)
  useEffect(() => {
    try {
      if (forceOpen) setOpen(true);
    } catch (error) {
      console.error("[MainCategoryTree] 자동 펼침 실패:", error); // TODO: 배포 전 제거
    }
  }, [forceOpen]);

  function handleClick() {
    try {
      if (hasChildren) setOpen((o) => !o);
      if (typeof onSelect === "function") onSelect();
    } catch (error) {
      console.error("[MainCategoryTree] 항목 클릭 실패:", error); // TODO: 배포 전 제거
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={
          "flex w-full items-center gap-1 rounded-md py-1 pr-1 text-left transition hover:bg-brand-light " +
          // 최상위(대륙/Space)는 13px + bold, 하위(국가 등)는 기존 12px
          (isTop ? "text-[13px] font-bold text-ink " : "text-xs text-ink ") +
          // 하위가 선택된 조상 노드는 옅은 파란 배경으로 약하게 강조
          (ancestorActive ? "bg-blue-50" : "")
        }
      >
        <span className="w-3 text-ink-muted">
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </span>
        <span className="truncate">{label}</span>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {count}
        </span>
      </button>
      {hasChildren && open ? <div>{children}</div> : null}
    </div>
  );
}

export default function MainCategoryTree({
  markers,
  tags,
  tr,
  onSelectLocation,
  onSelectTag,
  selectedCity,
  selectedTag,
  // 자동 라이브 채널(방송/우주 등) — 지역과 별개로 대분류 > 소분류(말단) 로 표시.
  //   소분류가 곧 "영상 목록"이며, 그 소분류에 속한 모든 채널의 라이브가 합쳐진다.
  liveChannels,
  channelVideoCounts,
  onSelectChannelGroup,
  selectedGroup, // { major, minor } | null
}) {
  const markerList = Array.isArray(markers) ? markers : [];
  const tagList = Array.isArray(tags) ? tags : [];
  const channelList = Array.isArray(liveChannels) ? liveChannels : [];
  const channelCounts =
    channelVideoCounts && typeof channelVideoCounts === "object"
      ? channelVideoCounts
      : {};

  // 다국어: 정적 문자열(t) + 대륙 라벨(tContinent) + 국가명(countryName)
  const { t, tContinent, countryName } = useI18n();
  // 동적 문자열(도시/태그) 번역 함수 (부모가 넘겨줌, 없으면 원문 유지)
  const trFn = typeof tr === "function" ? tr : (x) => x;

  // 현재 선택된 도시인지 판별 (대륙+국가+도시까지 정확히 일치할 때만 강조)
  function isCitySelected(continent, country, city) {
    return (
      selectedCity &&
      selectedCity.continent === continent &&
      selectedCity.country === country &&
      selectedCity.city === city
    );
  }

  // ─── 대륙 → 국가 → 도시 트리 구성 (개수 포함) ────────────────
  const tree = useMemo(() => {
    const t = {};
    try {
      for (const m of markerList) {
        if (!m) continue;
        const continent = m.continent || "unknown";
        const country = m.country || "unknown";
        const city = m.city || "(도시 미지정)";
        if (!t[continent]) t[continent] = {};
        if (!t[continent][country]) t[continent][country] = {};
        if (!t[continent][country][city]) t[continent][country][city] = 0;
        t[continent][country][city] += 1;
      }
    } catch (error) {
      console.error("[MainCategoryTree] 트리 구성 실패:", error); // TODO: 배포 전 제거
    }
    return t;
  }, [markerList]);

  // ─── 태그별 마커 개수 계산 ───────────────────────────────────
  // 각 마커의 tags 배열을 순회하며 태그 이름별 등록 개수를 센다.
  const tagCounts = useMemo(() => {
    const counts = {};
    try {
      for (const m of markerList) {
        if (!m || !Array.isArray(m.tags)) continue;
        for (const tag of m.tags) {
          const name = String(tag || "").trim();
          if (!name) continue;
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    } catch (error) {
      console.error("[MainCategoryTree] 태그 개수 계산 실패:", error); // TODO: 배포 전 제거
    }
    return counts;
  }, [markerList]);

  // ─── 화면에 보일 태그: 마커가 1개 이상 등록된 태그만 (개수 포함) ───
  const visibleTags = useMemo(() => {
    return tagList
      .map((t) => ({ ...t, count: tagCounts[t.name] || 0 }))
      .filter((t) => t.count > 0);
  }, [tagList, tagCounts]);

  // 개수 계산 헬퍼
  function countCountry(countryObj) {
    let n = 0;
    for (const city of Object.keys(countryObj)) n += countryObj[city];
    return n;
  }
  function countContinent(continentObj) {
    let n = 0;
    for (const country of Object.keys(continentObj)) {
      n += countCountry(continentObj[country]);
    }
    return n;
  }

  // 대륙 정렬 (정해진 순서 우선, 그 외 뒤로)
  const continentKeys = useMemo(() => {
    const keys = Object.keys(tree);
    return keys.sort((a, b) => {
      const ia = CONTINENT_ORDER.indexOf(a);
      const ib = CONTINENT_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [tree]);

  // ─── 자동 라이브 채널: 대분류 > 소분류 > 채널 트리 구성 ────────
  const channelTree = useMemo(() => {
    const byMajor = {};
    try {
      for (const ch of channelList) {
        if (!ch || !ch.id) continue;
        const M = ch.major_category || "(미분류)";
        const m = ch.minor_category || "(미분류)";
        if (!byMajor[M]) byMajor[M] = {};
        if (!byMajor[M][m]) byMajor[M][m] = [];
        byMajor[M][m].push(ch);
      }
    } catch (error) {
      console.error("[MainCategoryTree] 채널 트리 구성 실패:", error); // TODO: 배포 전 제거
    }
    return byMajor;
  }, [channelList]);

  const channelMajorKeys = useMemo(
    () => Object.keys(channelTree).sort((a, b) => a.localeCompare(b, "ko")),
    [channelTree]
  );

  // 채널 개수 배지 합계 (해당 그룹 하위 채널들의 현재 라이브 영상 수 합).
  // 아직 개수 정보가 없으면(로딩 전) undefined 반환 → 배지 미표시.
  function sumChannelCounts(channels) {
    let sum = 0;
    let known = false;
    for (const ch of channels) {
      const c = channelCounts[ch.id];
      if (typeof c === "number") {
        sum += c;
        known = true;
      }
    }
    return known ? sum : undefined;
  }
  // 현재 선택된 소분류(그룹)인지 판별
  function isGroupSelected(major, minor) {
    return (
      selectedGroup &&
      selectedGroup.major === major &&
      selectedGroup.minor === minor
    );
  }
  // 이 대분류 안에 현재 선택된 소분류가 있는지(조상 강조/자동펼침용)
  function majorHasSelected(major) {
    return Boolean(selectedGroup && selectedGroup.major === major);
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* ── 지역 섹션 ─────────────────────────────────────────── */}
      <div className="border-b border-border px-2 py-3">
        <h2 className="mb-2 px-1 font-display text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          {t("region")}
        </h2>
        <div className="overflow-auto">
          {markerList.length === 0 ? (
            <p className="px-1 text-xs text-ink-muted">{t("noMarkers")}</p>
          ) : (
            continentKeys.map((continent) => {
              const continentObj = tree[continent];
              const continentLabel = tContinent(continent);
              return (
                <CollapsibleRow
                  key={continent}
                  label={continentLabel}
                  count={countContinent(continentObj)}
                  depth={0}
                  defaultOpen={false}
                  // 선택된 도시가 이 대륙에 속하면 자동으로 펼친다 + 조상 강조
                  forceOpen={Boolean(
                    selectedCity && selectedCity.continent === continent
                  )}
                  ancestorActive={Boolean(
                    selectedCity && selectedCity.continent === continent
                  )}
                  onSelect={() =>
                    typeof onSelectLocation === "function" &&
                    onSelectLocation({ continent })
                  }
                >
                  {Object.keys(continentObj)
                    .sort((a, b) =>
                      countryName(a).localeCompare(countryName(b))
                    )
                    .map((country) => {
                      const countryObj = continentObj[country];
                      const countryLabel = countryName(country);
                      return (
                        <CollapsibleRow
                          key={country}
                          label={countryLabel}
                          count={countCountry(countryObj)}
                          depth={1}
                          defaultOpen={false}
                          // 선택된 도시가 이 국가에 속하면 자동으로 펼친다 + 조상 강조
                          forceOpen={Boolean(
                            selectedCity &&
                              selectedCity.continent === continent &&
                              selectedCity.country === country
                          )}
                          ancestorActive={Boolean(
                            selectedCity &&
                              selectedCity.continent === continent &&
                              selectedCity.country === country
                          )}
                          onSelect={() =>
                            typeof onSelectLocation === "function" &&
                            onSelectLocation({ continent, country })
                          }
                        >
                          {Object.keys(countryObj)
                            .sort((a, b) => trFn(a).localeCompare(trFn(b)))
                            .map((city) => {
                              // 도시는 말단 노드 → 자식 없이 클릭 시 해당 도시 선택
                              // 현재 선택된 도시면 배경 강조
                              const active = isCitySelected(
                                continent,
                                country,
                                city
                              );
                              return (
                                <button
                                  key={city}
                                  type="button"
                                  onClick={() =>
                                    typeof onSelectLocation === "function" &&
                                    onSelectLocation({ continent, country, city })
                                  }
                                  style={{ paddingLeft: "30px" }}
                                  className={
                                    "flex w-full items-center gap-1 rounded-md py-1 pr-1 text-left text-xs transition hover:bg-brand-light " +
                                    // 실제 선택된 도시는 옅은 파란 배경 + 굵게 강조
                                    (active
                                      ? "bg-blue-100 font-bold text-blue-800"
                                      : "text-ink")
                                  }
                                >
                                  <span className="w-3 text-ink-muted">·</span>
                                  <span className="truncate">{trFn(city)}</span>
                                  <span className="ml-auto font-mono text-[11px] text-ink-muted">
                                    {countryObj[city]}
                                  </span>
                                </button>
                              );
                            })}
                        </CollapsibleRow>
                      );
                    })}
                </CollapsibleRow>
              );
            })
          )}

          {/* ── 자동 라이브 채널 (방송/우주 등) ──────────────────
              지역(대륙/국가/도시)과 별개 데이터. 현재 우주 항목이 있던 자리처럼
              지역 목록 바로 아래에, 대분류 > 소분류 > 채널 로 표시한다. */}
          {channelMajorKeys.map((M) => {
            const minors = channelTree[M];
            const minorKeys = Object.keys(minors).sort((a, b) =>
              a.localeCompare(b, "ko")
            );
            // 이 대분류 하위 전체 채널
            const allInMajor = minorKeys.reduce(
              (acc, mk) => acc.concat(minors[mk]),
              []
            );
            return (
              <CollapsibleRow
                key={`ch-major-${M}`}
                label={trFn(M)}
                count={sumChannelCounts(allInMajor)}
                depth={0}
                defaultOpen={false}
                forceOpen={majorHasSelected(M)}
                ancestorActive={majorHasSelected(M)}
              >
                {/* 소분류가 말단(클릭 대상). 그 소분류에 속한 모든 채널의 라이브가 합쳐진다. */}
                {minorKeys.map((mk) => {
                  const channels = minors[mk];
                  const active = isGroupSelected(M, mk);
                  return (
                    <button
                      key={`ch-minor-${M}-${mk}`}
                      type="button"
                      onClick={() =>
                        typeof onSelectChannelGroup === "function" &&
                        onSelectChannelGroup({ major: M, minor: mk })
                      }
                      style={{ paddingLeft: "30px" }}
                      className={
                        "flex w-full items-center gap-1 rounded-md py-1 pr-1 text-left text-xs transition hover:bg-brand-light " +
                        (active
                          ? "bg-blue-100 font-bold text-blue-800"
                          : "text-ink")
                      }
                    >
                      <span className="w-3 text-ink-muted">·</span>
                      <span className="truncate">{trFn(mk)}</span>
                      <span className="ml-auto font-mono text-[11px] text-ink-muted">
                        {(() => {
                          const c = sumChannelCounts(channels);
                          return typeof c === "number" ? c : "";
                        })()}
                      </span>
                    </button>
                  );
                })}
              </CollapsibleRow>
            );
          })}
        </div>
      </div>

      {/* ── 특성 태그 섹션 ────────────────────────────────────── */}
      <div className="px-2 py-3">
        <h2 className="mb-2 px-1 font-display text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          {t("tags")}
        </h2>
        {/* 마커가 1개 이상 등록된 태그만 표시(0개는 숨김), 옆에 개수 표기 */}
        {visibleTags.length === 0 ? (
          <p className="px-1 text-xs text-ink-muted">{t("noTags")}</p>
        ) : (
          <div className="flex flex-col">
            {visibleTags.map((tag) => {
              // 각 태그는 자신의 고유 id 를 key 로, 자신의 name 을 콜백에 넘긴다.
              const active = selectedTag === tag.name;
              return (
                <button
                  key={tag.id != null ? tag.id : tag.name}
                  type="button"
                  onClick={() =>
                    typeof onSelectTag === "function" && onSelectTag(tag.name)
                  }
                  className={
                    "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition hover:bg-brand-light " +
                    (active
                      ? "bg-brand-light font-semibold text-brand"
                      : "text-brand")
                  }
                >
                  <span className="truncate">#{trFn(tag.name)}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-muted">
                    {tag.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
