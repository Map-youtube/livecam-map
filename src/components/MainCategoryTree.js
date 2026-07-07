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

import { useMemo, useState } from "react";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countryList";

// 대륙 코드 → 한국어 라벨
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  americas: "아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

// 대륙 표시 순서
const CONTINENT_ORDER = [
  "asia",
  "europe",
  "americas",
  "africa",
  "oceania",
  "middleeast",
];

// ─── 접기/펼치기 그룹 (내부 헬퍼) ─────────────────────────────
// 캐럿으로 펼치고, 라벨 클릭 시 onSelect 콜백 호출.
function CollapsibleRow({ label, count, depth, defaultOpen, onSelect, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const hasChildren = Boolean(children);

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
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
        className="flex w-full items-center gap-1 py-0.5 text-left text-xs hover:bg-gray-100"
      >
        <span className="w-3 text-gray-400">
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>
        <span className="truncate text-gray-800">{label}</span>
        <span className="ml-auto pr-1 text-gray-400">({count})</span>
      </button>
      {hasChildren && open ? <div>{children}</div> : null}
    </div>
  );
}

export default function MainCategoryTree({
  markers,
  tags,
  onSelectLocation,
  onSelectTag,
  selectedCity,
  selectedTag,
}) {
  const markerList = Array.isArray(markers) ? markers : [];
  const tagList = Array.isArray(tags) ? tags : [];

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

  return (
    <div className="flex h-full flex-col">
      {/* ── 지역 섹션 ─────────────────────────────────────────── */}
      <div className="border-b border-gray-200 px-1 py-2">
        <h2 className="mb-1 px-1 text-xs font-bold text-gray-700">지역</h2>
        {markerList.length === 0 ? (
          <p className="px-1 text-xs text-gray-400">표시할 마커가 없습니다.</p>
        ) : (
          <div className="overflow-auto">
            {continentKeys.map((continent) => {
              const continentObj = tree[continent];
              const continentLabel =
                CONTINENT_LABELS[continent] || continent || "미분류";
              return (
                <CollapsibleRow
                  key={continent}
                  label={continentLabel}
                  count={countContinent(continentObj)}
                  depth={0}
                  defaultOpen={false}
                  onSelect={() =>
                    typeof onSelectLocation === "function" &&
                    onSelectLocation({ continent })
                  }
                >
                  {Object.keys(continentObj)
                    .sort((a, b) =>
                      (COUNTRY_NAME_BY_CODE[a] || a).localeCompare(
                        COUNTRY_NAME_BY_CODE[b] || b,
                        "ko"
                      )
                    )
                    .map((country) => {
                      const countryObj = continentObj[country];
                      const countryLabel = COUNTRY_NAME_BY_CODE[country] || country;
                      return (
                        <CollapsibleRow
                          key={country}
                          label={countryLabel}
                          count={countCountry(countryObj)}
                          depth={1}
                          defaultOpen={false}
                          onSelect={() =>
                            typeof onSelectLocation === "function" &&
                            onSelectLocation({ continent, country })
                          }
                        >
                          {Object.keys(countryObj)
                            .sort((a, b) => a.localeCompare(b, "ko"))
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
                                  style={{ paddingLeft: "24px" }}
                                  className={
                                    "flex w-full items-center gap-1 py-0.5 text-left text-xs hover:bg-gray-100 " +
                                    (active
                                      ? "bg-blue-100 font-semibold text-blue-800"
                                      : "")
                                  }
                                >
                                  <span className="w-3 text-gray-300">·</span>
                                  <span className="truncate text-gray-700">
                                    {city}
                                  </span>
                                  <span className="ml-auto pr-1 text-gray-400">
                                    ({countryObj[city]})
                                  </span>
                                </button>
                              );
                            })}
                        </CollapsibleRow>
                      );
                    })}
                </CollapsibleRow>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 특성 태그 섹션 ────────────────────────────────────── */}
      <div className="px-1 py-2">
        <h2 className="mb-1 px-1 text-xs font-bold text-gray-700">특성 태그</h2>
        {tagList.length === 0 ? (
          <p className="px-1 text-xs text-gray-400">등록된 태그가 없습니다.</p>
        ) : (
          <div className="flex flex-col">
            {tagList.map((tag) => {
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
                    "w-full px-2 py-0.5 text-left text-xs hover:bg-gray-100 " +
                    (active
                      ? "bg-blue-100 font-semibold text-blue-800"
                      : "text-blue-700")
                  }
                >
                  #{tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
