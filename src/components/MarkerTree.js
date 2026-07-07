"use client";

// ─────────────────────────────────────────────────────────────
// MarkerTree — 관리자 마커 목록 (대륙 → 국가 → 도시 트리)
//
// 기능:
//   - 마운트 시 / refreshSignal 변경 시 GET /api/markers?all=true 로 전체(비활성 포함) 조회
//   - 대륙 → 국가 → 도시 순으로 그룹화, 접기/펼치기
//   - 각 마커: 썸네일 / 장소명 / 상태 배지 / 채널명(링크) / 마지막 확인 시각 / 수정·삭제 버튼
//   - 삭제: confirm 후 DELETE /api/markers/[id] → 목록에서 즉시 제거
//   - 수정: 모달에서 location/city/country/category/is_live/youtube_url 편집 → PATCH
//
// ⚠️ 반복 렌더링 시 각 항목은 고유 id/키를 사용하고, 버튼 핸들러는 그 항목의 데이터를 참조한다.
//    (CLAUDE.md 버그 예방 규칙 준수)
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { getContinentByCountry } from "@/lib/continentUtils";

// ─── 국가 목록 (코드 → 한국어명) : 수정 모달 드롭다운 + 표시용 ───
const COUNTRIES = [
  { code: "KR", name: "대한민국" },
  { code: "JP", name: "일본" },
  { code: "CN", name: "중국" },
  { code: "TW", name: "대만" },
  { code: "HK", name: "홍콩" },
  { code: "TH", name: "태국" },
  { code: "VN", name: "베트남" },
  { code: "SG", name: "싱가포르" },
  { code: "ID", name: "인도네시아" },
  { code: "PH", name: "필리핀" },
  { code: "MY", name: "말레이시아" },
  { code: "IN", name: "인도" },
  { code: "US", name: "미국" },
  { code: "CA", name: "캐나다" },
  { code: "MX", name: "멕시코" },
  { code: "BR", name: "브라질" },
  { code: "AR", name: "아르헨티나" },
  { code: "GB", name: "영국" },
  { code: "FR", name: "프랑스" },
  { code: "DE", name: "독일" },
  { code: "IT", name: "이탈리아" },
  { code: "ES", name: "스페인" },
  { code: "NL", name: "네덜란드" },
  { code: "CH", name: "스위스" },
  { code: "AU", name: "호주" },
  { code: "NZ", name: "뉴질랜드" },
  { code: "AE", name: "아랍에미리트" },
  { code: "TR", name: "튀르키예" },
  { code: "EG", name: "이집트" },
  { code: "ZA", name: "남아프리카공화국" },
];

// 코드 → 한국어명 빠른 조회 맵
const COUNTRY_NAME_BY_CODE = COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c.name;
  return acc;
}, {});

// ─── 카테고리 (코드 → 한국어 라벨) ────────────────────────────
const CATEGORIES = [
  { value: "landmark", label: "랜드마크" },
  { value: "road", label: "도로" },
  { value: "nature", label: "자연" },
  { value: "city", label: "도시" },
  { value: "beach", label: "해변" },
  { value: "wildlife", label: "야생동물" },
  { value: "other", label: "기타" },
];

// ─── 대륙 코드 → 한국어 라벨 ───────────────────────────────────
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  americas: "아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

// 대륙 표시 순서 (트리 정렬용)
const CONTINENT_ORDER = [
  "asia",
  "europe",
  "americas",
  "africa",
  "oceania",
  "middleeast",
];

// ─── Firestore 타임스탬프류 값을 사람이 읽는 문자열로 ──────────
// 값이 없으면 "-" 반환. Admin SDK Timestamp(JSON 직렬화 시 _seconds/seconds),
// ISO 문자열, epoch 숫자 등 다양한 형태를 방어적으로 처리한다.
function formatTimestamp(value) {
  try {
    if (value === null || value === undefined || value === "") return "-";
    let date = null;

    if (typeof value === "number") {
      date = new Date(value);
    } else if (typeof value === "string") {
      date = new Date(value);
    } else if (typeof value === "object") {
      const seconds =
        typeof value._seconds === "number"
          ? value._seconds
          : typeof value.seconds === "number"
          ? value.seconds
          : null;
      if (seconds !== null) date = new Date(seconds * 1000);
    }

    if (!date || Number.isNaN(date.getTime())) return "-";
    // YYYY-MM-DD HH:mm 형태
    return date.toLocaleString("ko-KR");
  } catch (error) {
    console.error("[MarkerTree] 시각 포맷 실패:", error); // TODO: 배포 전 제거
    return "-";
  }
}

// ─── 썸네일 URL 결정 (저장값 우선, 없으면 video_id로 생성) ─────
function getThumb(marker) {
  if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
  if (marker.youtube_video_id)
    return `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`;
  return null;
}

// ─── 상태 배지 계산 ────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// 마커 단건 행 컴포넌트
// ─────────────────────────────────────────────────────────────
function MarkerRow({ marker, onEdit, onDelete }) {
  const thumb = getThumb(marker);
  const badge = getStatusBadge(marker);
  const channelUrl = marker.youtube_channel_url || "";
  const channelName = marker.youtube_channel_name || "(채널 정보 없음)";
  const lastChecked = formatTimestamp(marker.last_checked_at);

  return (
    <div className="flex items-center gap-3 border-b border-gray-100 py-2">
      {/* 썸네일 (작게) */}
      {thumb ? (
        // 원격 이미지라 next/image 대신 일반 img 사용
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={marker.location || "썸네일"}
          className="h-10 w-16 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-10 w-16 flex-shrink-0 rounded bg-gray-100" />
      )}

      {/* 가운데 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {marker.location || "(장소명 없음)"}
          </span>
          <span
            className={
              "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold " +
              badge.className
            }
          >
            {badge.text}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {/* 채널명: channel_url 있으면 새 탭 링크, 없으면 텍스트만 */}
          {channelUrl ? (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {channelName} ↗
            </a>
          ) : (
            <span>{channelName}</span>
          )}
          <span className="mx-1">·</span>
          <span>마지막 확인: {lastChecked}</span>
        </div>
      </div>

      {/* 우측 버튼 */}
      <div className="flex flex-shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onEdit(marker)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => onDelete(marker)}
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 접기/펼치기 그룹 (공통) — 각 그룹은 자체 open 상태를 가진다.
// ─────────────────────────────────────────────────────────────
function CollapsibleGroup({ title, count, defaultOpen, indent, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 py-1 text-left text-sm hover:bg-gray-50"
        style={{ paddingLeft: `${indent * 16}px` }}
      >
        <span className="text-gray-400">{open ? "▼" : "▶"}</span>
        <span className="font-medium text-gray-800">📁 {title}</span>
        <span className="text-xs text-gray-500">({count}개)</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 수정 모달
// ─────────────────────────────────────────────────────────────
function EditModal({ marker, onClose, onSaved }) {
  // 편집 대상 초기값 (해당 마커의 고유 데이터로 채운다)
  const [location, setLocation] = useState(marker.location || "");
  const [city, setCity] = useState(marker.city || "");
  const [country, setCountry] = useState(marker.country || "");
  const [category, setCategory] = useState(marker.category || "other");
  const [isLive, setIsLive] = useState(marker.is_live !== false);
  const [youtubeUrl, setYoutubeUrl] = useState(marker.youtube_url || "");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 원래 유튜브 주소 (변경 여부 판단 → 안내 문구용)
  const originalUrl = marker.youtube_url || "";
  const urlChanged = youtubeUrl.trim() !== originalUrl;

  // 국가 → 대륙 자동 표시
  const continentLabel = useMemo(() => {
    if (!country) return "";
    const c = getContinentByCountry(country);
    if (!c) return "알 수 없음";
    return CONTINENT_LABELS[c] || c;
  }, [country]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/markers/${marker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: location.trim(),
          city: city.trim(),
          country: country,
          category: category,
          is_live: isLive,
          youtube_url: youtubeUrl.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // 저장 성공 → 상위에 알림 (목록 갱신 + 모달 닫기)
        onSaved(data.marker || null);
      } else {
        setErrorMsg(data.error || "수정에 실패했습니다.");
      }
    } catch (error) {
      console.error("[MarkerTree] 수정 저장 실패:", error); // TODO: 배포 전 제거
      setErrorMsg("네트워크 오류로 수정에 실패했습니다: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    // 모달 오버레이
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">마커 수정</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          {/* 장소명 */}
          <div>
            <label className="block text-xs text-gray-600">장소명</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* 도시 */}
          <div>
            <label className="block text-xs text-gray-600">도시</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {/* 국가 */}
          <div>
            <label className="block text-xs text-gray-600">국가</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">국가를 선택하세요</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            {country && (
              <p className="mt-1 text-xs text-gray-600">대륙: {continentLabel}</p>
            )}
          </div>

          {/* 카테고리 */}
          <div>
            <label className="block text-xs text-gray-600">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* is_live */}
          <div className="flex items-center gap-2">
            <input
              id="edit_is_live"
              type="checkbox"
              checked={isLive}
              onChange={(e) => setIsLive(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="edit_is_live" className="text-sm text-gray-700">
              실시간 라이브 영상입니다 (is_live)
            </label>
          </div>

          {/* youtube_url */}
          <div>
            <label className="block text-xs text-gray-600">유튜브 주소</label>
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {/* 비용 안내 문구 */}
            {urlChanged ? (
              <p className="mt-1 text-xs text-orange-600">
                유튜브 주소가 변경되어 저장 시 영상 정보를 다시 수집합니다(유튜브 API 1유닛 사용).
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                유튜브 주소를 바꾸지 않으면 추가 비용 없이 저장됩니다.
              </p>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={
              "rounded-md px-4 py-2 text-sm font-semibold text-white " +
              (saving ? "cursor-not-allowed bg-gray-300" : "bg-blue-600 hover:bg-blue-700")
            }
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
//   props.refreshSignal : 값이 바뀌면 목록을 다시 불러온다 (등록 성공 연동용)
// ─────────────────────────────────────────────────────────────
export default function MarkerTree({ refreshSignal }) {
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingMarker, setEditingMarker] = useState(null);

  // ─── 목록 불러오기 (Firestore만 사용, 유튜브 API 호출 없음) ──
  const loadMarkers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      // all=true → 비활성/재생불가 포함 전체 조회
      const res = await fetch("/api/markers?all=true");
      const data = await res.json();
      if (res.ok && data.ok) {
        setMarkers(Array.isArray(data.markers) ? data.markers : []);
      } else {
        setLoadError(data.error || "목록을 불러오지 못했습니다.");
        setMarkers([]);
      }
    } catch (error) {
      console.error("[MarkerTree] 목록 조회 실패:", error); // TODO: 배포 전 제거
      setLoadError("네트워크 오류로 목록을 불러오지 못했습니다.");
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 시 + refreshSignal 변경 시 재조회
  useEffect(() => {
    loadMarkers();
  }, [loadMarkers, refreshSignal]);

  // ─── 삭제 처리 ───────────────────────────────────────────────
  const handleDelete = useCallback(async (marker) => {
    try {
      // 해당 마커의 고유 데이터로 확인창 표시
      const ok = window.confirm(
        `정말 삭제하시겠습니까?\n\n장소: ${marker.location || "(장소명 없음)"}`
      );
      if (!ok) return;

      const res = await fetch(`/api/markers/${marker.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // 화면 목록에서 해당 id만 즉시 제거
        setMarkers((prev) => prev.filter((m) => m.id !== marker.id));
      } else {
        window.alert(data.error || "삭제에 실패했습니다.");
      }
    } catch (error) {
      console.error("[MarkerTree] 삭제 실패:", error); // TODO: 배포 전 제거
      window.alert("네트워크 오류로 삭제에 실패했습니다.");
    }
  }, []);

  // ─── 수정 버튼 → 모달 열기 ───────────────────────────────────
  const handleEdit = useCallback((marker) => {
    setEditingMarker(marker);
  }, []);

  // ─── 수정 저장 완료 → 목록 갱신 + 모달 닫기 ─────────────────
  const handleSaved = useCallback(() => {
    setEditingMarker(null);
    // 국가 변경 시 대륙/그룹이 바뀔 수 있으므로 전체 재조회로 반영
    loadMarkers();
  }, [loadMarkers]);

  // ─── 대륙 → 국가 → 도시 그룹화 ───────────────────────────────
  const grouped = useMemo(() => {
    const tree = {};
    for (const m of markers) {
      const continent = m.continent || "unknown";
      const country = m.country || "unknown";
      const city = m.city || "(도시 미지정)";
      if (!tree[continent]) tree[continent] = {};
      if (!tree[continent][country]) tree[continent][country] = {};
      if (!tree[continent][country][city]) tree[continent][country][city] = [];
      tree[continent][country][city].push(m);
    }
    return tree;
  }, [markers]);

  // 대륙 정렬: 정해진 순서 우선, 그 외(unknown 등)는 뒤에
  const continentKeys = useMemo(() => {
    const keys = Object.keys(grouped);
    return keys.sort((a, b) => {
      const ia = CONTINENT_ORDER.indexOf(a);
      const ib = CONTINENT_ORDER.indexOf(b);
      const sa = ia === -1 ? 999 : ia;
      const sb = ib === -1 ? 999 : ib;
      return sa - sb;
    });
  }, [grouped]);

  // 특정 대륙/국가 하위의 총 마커 수 계산 (표시용)
  function countInCountry(countryObj) {
    let n = 0;
    for (const city of Object.keys(countryObj)) n += countryObj[city].length;
    return n;
  }
  function countInContinent(continentObj) {
    let n = 0;
    for (const country of Object.keys(continentObj)) {
      n += countInCountry(continentObj[country]);
    }
    return n;
  }

  return (
    <div>
      {/* 로딩 / 에러 / 빈 상태 */}
      {loading && <p className="text-sm text-gray-500">목록을 불러오는 중...</p>}
      {!loading && loadError && (
        <p className="text-sm text-red-600">{loadError}</p>
      )}
      {!loading && !loadError && markers.length === 0 && (
        <p className="text-sm text-gray-500">등록된 마커가 없습니다.</p>
      )}

      {/* 트리 */}
      {!loading && !loadError && markers.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-2">
          {continentKeys.map((continent) => {
            const continentObj = grouped[continent];
            const continentLabel =
              CONTINENT_LABELS[continent] || continent || "미분류";
            return (
              <CollapsibleGroup
                key={continent}
                title={continentLabel}
                count={countInContinent(continentObj)}
                indent={0}
                defaultOpen={true}
              >
                {Object.keys(continentObj)
                  .sort()
                  .map((country) => {
                    const countryObj = continentObj[country];
                    const countryName = COUNTRY_NAME_BY_CODE[country] || country;
                    return (
                      <CollapsibleGroup
                        key={country}
                        title={`${countryName} (${country})`}
                        count={countInCountry(countryObj)}
                        indent={1}
                        defaultOpen={true}
                      >
                        {Object.keys(countryObj)
                          .sort()
                          .map((city) => {
                            const cityMarkers = countryObj[city];
                            return (
                              <CollapsibleGroup
                                key={city}
                                title={city}
                                count={cityMarkers.length}
                                indent={2}
                                defaultOpen={true}
                              >
                                <div
                                  style={{ paddingLeft: "48px" }}
                                  className="pr-2"
                                >
                                  {cityMarkers.map((marker) => (
                                    // 각 행은 마커 고유 id 를 key 로 사용하고,
                                    // 수정/삭제 핸들러에 그 마커 객체를 그대로 넘긴다.
                                    <MarkerRow
                                      key={marker.id}
                                      marker={marker}
                                      onEdit={handleEdit}
                                      onDelete={handleDelete}
                                    />
                                  ))}
                                </div>
                              </CollapsibleGroup>
                            );
                          })}
                      </CollapsibleGroup>
                    );
                  })}
              </CollapsibleGroup>
            );
          })}
        </div>
      )}

      {/* 수정 모달 */}
      {editingMarker && (
        <EditModal
          marker={editingMarker}
          onClose={() => setEditingMarker(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
