"use client";

// ─────────────────────────────────────────────────────────────
// MarkerList — 관리자 마커 목록 (표/테이블 형태)
//
// 기능:
//   - 마운트 시 / refreshSignal 변경 시 GET /api/markers?all=true 로 전체(비활성 포함) 조회
//   - 트리(접기/펼치기) 대신 모든 마커를 하나의 표로 한 화면에 나열
//   - 상단 검색창(장소명/도시/국가)으로 클라이언트 필터링 (추가 API 호출 없음)
//   - 표 헤더 sticky 고정
//   - 각 행: 썸네일/장소명/도시/국가/대륙/특성태그/상태배지/채널명/마지막확인/수정·삭제
//   - 삭제: confirm 후 DELETE → 표에서 즉시 제거
//   - 수정: 모달(작은 지도 포함)에서 편집 → PATCH (lat/lng 포함)
//
// ⚠️ 각 행은 marker.id 를 key 로 사용하고, 버튼 핸들러는 그 행의 marker 객체를 참조한다.
//    (CLAUDE.md 버그 예방 규칙 준수)
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import AiDescriptionEditor from "@/components/AiDescriptionEditor";
import TagSelector from "@/components/TagSelector";
import { getContinentByCountry } from "@/lib/continentUtils";
import { getAdminIdToken } from "@/lib/clientAuth";

// ─── 국가 목록 (코드 → 한국어명) ──────────────────────────────
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

// ─── 대륙 코드 → 한국어 라벨 ───────────────────────────────────
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  americas: "아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

// 대륙 표시 순서 (필터 드롭다운 정렬용)
const CONTINENT_ORDER = [
  "asia",
  "europe",
  "americas",
  "africa",
  "oceania",
  "middleeast",
];

// ─── 상태 필터 옵션 (값 → 라벨) ───────────────────────────────
// 값(key)은 getStatusKey 가 돌려주는 값과 일치해야 한다.
const STATUS_OPTIONS = [
  { value: "live", label: "🔴 LIVE" },
  { value: "ended", label: "⏹ 방송종료" },
  { value: "disabled", label: "⚫ 재생불가" },
  { value: "inactive", label: "⚫ 비활성" },
];

// 지도 기본 중심 (좌표가 없을 때)
const DEFAULT_CENTER = { lat: 35.68, lng: 139.76 };

// ─── Firestore 타임스탬프류 값을 사람이 읽는 문자열로 ──────────
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
    return date.toLocaleString("ko-KR");
  } catch (error) {
    console.error("[MarkerList] 시각 포맷 실패:", error); // TODO: 배포 전 제거
    return "-";
  }
}

// ─── 썸네일 URL (저장값 우선, 없으면 video_id로 생성) ─────────
function getThumb(marker) {
  if (marker.youtube_thumbnail_url) return marker.youtube_thumbnail_url;
  if (marker.youtube_video_id)
    return `https://i.ytimg.com/vi/${marker.youtube_video_id}/hqdefault.jpg`;
  return null;
}

// ─── 상태 배지 계산 ────────────────────────────────────────────
// 우선순위: 재생불가/방송종료(auto_disabled) → 비활성(is_active===false) → LIVE
//   - disabled_reason === "stream_ended" 이면 "방송종료"로 구분 표시
//     (영상 ID 는 남아있지만 라이브가 종료돼 재생 불가)
function getStatusBadge(marker) {
  if (marker.auto_disabled === true) {
    if (marker.disabled_reason === "stream_ended") {
      return { text: "⏹ 방송종료", className: "bg-purple-100 text-purple-700" };
    }
    return { text: "⚫ 재생불가", className: "bg-orange-100 text-orange-700" };
  }
  if (marker.is_active === false) {
    return { text: "⚫ 비활성", className: "bg-gray-200 text-gray-700" };
  }
  return { text: "🔴 LIVE", className: "bg-red-100 text-red-700" };
}

// ─── 상태 필터용 키 계산 ───────────────────────────────────────
// 배지(getStatusBadge)와 "동일한 기준"으로 상태 키를 돌려준다.
//   auto_disabled+stream_ended → "ended", auto_disabled → "disabled",
//   is_active===false → "inactive", 그 외 → "live"
function getStatusKey(marker) {
  if (marker.auto_disabled === true) {
    return marker.disabled_reason === "stream_ended" ? "ended" : "disabled";
  }
  if (marker.is_active === false) return "inactive";
  return "live";
}

// ─────────────────────────────────────────────────────────────
// 수정 모달 (작은 지도 포함)
// ─────────────────────────────────────────────────────────────
function EditModal({ marker, onClose, onSaved }) {
  // 편집 대상 초기값 (해당 마커의 고유 데이터로 채운다)
  const [location, setLocation] = useState(marker.location || "");
  const [city, setCity] = useState(marker.city || "");
  const [country, setCountry] = useState(marker.country || "");
  const [isLive, setIsLive] = useState(marker.is_live !== false);
  const [youtubeUrl, setYoutubeUrl] = useState(marker.youtube_url || "");
  // 위도/경도는 문자열로 관리해 입력창 편집을 허용 (등록 폼과 동일 방식)
  const [lat, setLat] = useState(
    marker.lat !== undefined && marker.lat !== null ? String(marker.lat) : ""
  );
  const [lng, setLng] = useState(
    marker.lng !== undefined && marker.lng !== null ? String(marker.lng) : ""
  );
  // 장소 특성 태그 (기존 tags 로 초기화, 배열 아니면 빈 배열)
  const [tags, setTags] = useState(
    Array.isArray(marker.tags) ? marker.tags : []
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 원래 유튜브 주소 (변경 여부 판단 → 비용 안내 문구용)
  const originalUrl = marker.youtube_url || "";
  const urlChanged = youtubeUrl.trim() !== originalUrl;

  // 국가 → 대륙 자동 표시
  const continentLabel = useMemo(() => {
    if (!country) return "";
    const c = getContinentByCountry(country);
    if (!c) return "알 수 없음";
    return CONTINENT_LABELS[c] || c;
  }, [country]);

  // ─── 좌표 유효성 + 지도용 값 ───────────────────────────────
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasValidCoord =
    lat !== "" && lng !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  const mapMarkers = hasValidCoord
    ? [{ id: "edit", lat: latNum, lng: lngNum, location: location || "선택한 위치" }]
    : [];
  const mapCenter = hasValidCoord ? { lat: latNum, lng: lngNum } : DEFAULT_CENTER;

  // ─── 지도 클릭 → 좌표 반영 ─────────────────────────────────
  function handleMapClick(coord) {
    try {
      if (
        coord &&
        typeof coord.lat === "number" &&
        typeof coord.lng === "number"
      ) {
        setLat(coord.lat.toFixed(6));
        setLng(coord.lng.toFixed(6));
      }
    } catch (error) {
      console.error("[MarkerList] 수정 모달 지도 클릭 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 저장 (PATCH) ──────────────────────────────────────────
  async function handleSave() {
    if (saving) return;

    // 좌표 유효성 검사
    if (!hasValidCoord) {
      setErrorMsg("위도/경도가 올바르지 않습니다. 지도를 클릭하거나 숫자를 정확히 입력하세요.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      // 로그인 토큰 확보 (세션 없으면 로그인 페이지로 이동)
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.href = "/admin/login";
        return;
      }

      const res = await fetch(`/api/markers/${marker.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: location.trim(),
          city: city.trim(),
          country: country,
          is_live: isLive,
          youtube_url: youtubeUrl.trim(),
          // 지도/입력으로 변경된 좌표도 함께 전송
          lat: latNum,
          lng: lngNum,
          // 장소 특성 태그
          tags: tags,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        onSaved(data.marker || null);
      } else {
        setErrorMsg(data.error || "수정에 실패했습니다.");
      }
    } catch (error) {
      console.error("[MarkerList] 수정 저장 실패:", error); // TODO: 배포 전 제거
      setErrorMsg("네트워크 오류로 수정에 실패했습니다: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">마커 수정</h3>
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>

          {/* 도시 */}
          <div>
            <label className="block text-xs text-gray-600">도시</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>

          {/* 국가 */}
          <div>
            <label className="block text-xs text-gray-600">국가</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
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

          {/* 장소 특성 태그 (최대 3개) */}
          <div>
            <label className="block text-xs text-gray-600">
              장소 특성 태그 (최대 3개)
            </label>
            <TagSelector value={tags} onChange={setTags} />
          </div>

          {/* 위치 지정 지도 */}
          <div>
            <label className="block text-xs text-gray-600">
              위치 (지도를 클릭하면 좌표가 바뀝니다)
            </label>
            <div className="h-72 w-full overflow-hidden rounded-md border border-border">
              <LeafletMapWrapper
                markers={mapMarkers}
                center={mapCenter}
                zoom={hasValidCoord ? 10 : 4}
                onMapClick={handleMapClick}
                selectedMarkerId={hasValidCoord ? "edit" : null}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600">위도 (lat)</label>
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600">경도 (lng)</label>
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
            </div>
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
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
            className="rounded-md border border-border px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={
              "rounded-md px-4 py-2 text-sm font-semibold text-white " +
              (saving ? "cursor-not-allowed bg-gray-300" : "bg-brand hover:bg-brand-hover")
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
export default function MarkerList({ refreshSignal }) {
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingMarker, setEditingMarker] = useState(null);
  // AI 설명 편집 대상 마커 (null 이면 모달 닫힘)
  const [aiEditingMarker, setAiEditingMarker] = useState(null);
  const [filterText, setFilterText] = useState("");
  // 드롭다운 필터 상태 ("all" 이면 해당 조건 미적용)
  const [filterContinent, setFilterContinent] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  // 재생 확인(verify) 진행 중인 마커 id + 실패 안내 배너 메시지
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState("");
  // 자동 재생가능 여부 검사(oEmbed) 진행 상태 + 결과 안내
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  // 이번 페이지 세션에서 자동 검사를 이미 1회 수행했는지 (재실행 방지)
  const autoScanDoneRef = useRef(false);
  // 목록 로드 완료 신호 (값이 바뀌면 자동 검사를 트리거)
  const [loadTick, setLoadTick] = useState(0);

  // ─── 목록 불러오기 (Firestore만 사용, 유튜브 API 호출 없음) ──
  const loadMarkers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/markers?all=true");
      const data = await res.json();
      if (res.ok && data.ok) {
        const arr = Array.isArray(data.markers) ? data.markers : [];
        setMarkers(arr);
        // 로드 완료 신호 → 자동 검사 트리거
        setLoadTick((t) => t + 1);
      } else {
        setLoadError(data.error || "목록을 불러오지 못했습니다.");
        setMarkers([]);
      }
    } catch (error) {
      console.error("[MarkerList] 목록 조회 실패:", error); // TODO: 배포 전 제거
      setLoadError("네트워크 오류로 목록을 불러오지 못했습니다.");
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers, refreshSignal]);

  // ─── 페이지 로드 시 자동으로 재생가능 여부(oEmbed) 검사 ──────
  // 버튼 없이, 첫 목록 로드 직후 자동으로 시작(엑셀 수식 자동계산처럼).
  //   - 개별 마커를 한 개씩 부르는 대신, 서버에 "전체 검사"를 1회 요청한다(check-status, markerIds 없음).
  //     → 서버가 활성 마커 전체를 oEmbed 로 순차 검사하고 재생불가 영상을 비활성화한다.
  //   - 마커가 많아도(수백 개) 페이지를 계속 열어둘 필요 없이 요청 1건으로 처리되어 신뢰성이 높다.
  //   - 완료 후 목록을 한 번 다시 불러와 배지("⚫ 재생불가")를 반영한다.
  //   - 세션 내 1회만 실행(autoScanDoneRef).
  useEffect(() => {
    if (loadTick === 0) return; // 아직 첫 로드 전
    if (autoScanDoneRef.current) return; // 세션 내 1회만
    autoScanDoneRef.current = true;

    let cancelled = false;

    // 자동 점검 쿨다운(분): 이 시간 안에 이미 점검했으면 유튜브 API 를 다시 쓰지 않고 건너뛴다.
    // (페이지를 여러 번 열거나 새로고침해도 불필요하게 videos.list 유닛을 소모하지 않도록)
    const COOLDOWN_MS = 10 * 60 * 1000; // 10분
    const STORAGE_KEY = "livecam_last_scan_at";

    async function runAutoScan() {
      try {
        // 최근 점검 시각 확인 (쿨다운 내면 건너뜀)
        let lastAt = 0;
        try {
          lastAt = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
        } catch (e) {
          lastAt = 0;
        }
        const now = Date.now();
        if (lastAt && now - lastAt < COOLDOWN_MS) {
          const mins = Math.max(1, Math.round((now - lastAt) / 60000));
          setScanMessage(
            `최근(${mins}분 전)에 점검하여 이번엔 건너뜁니다. (자동 점검은 약 10분에 한 번, 유튜브 API 절약)`
          );
          return;
        }

        setScanning(true);
        setScanMessage("");

        // 관리자 전용 API → 토큰 첨부 (세션 없으면 조용히 중단)
        const token = await getAdminIdToken();
        if (!token) return;

        const res = await fetch("/api/markers/check-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          // markerIds 없이 전체(is_active!=false) 검사
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (!cancelled && res.ok && data.ok) {
          // 점검 성공 시각 기록 (쿨다운 기준)
          try {
            window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
          } catch (e) {
            // localStorage 사용 불가 시 무시
          }

          if (data.disabled > 0) {
            // 재생불가로 바뀐 게 있으면 목록을 다시 불러와 배지를 갱신
            await loadMarkers();
            setScanMessage(
              `영상 상태 확인 완료: ${data.disabled}개 재생불가로 표시됨`
            );
          } else {
            setScanMessage("영상 상태 확인 완료: 모두 재생 가능");
          }
        }
      } catch (error) {
        console.error("[MarkerList] 자동 상태 검사 실패:", error); // TODO: 배포 전 제거
      } finally {
        if (!cancelled) setScanning(false);
      }
    }

    runAutoScan();

    return () => {
      cancelled = true;
    };
  }, [loadTick, loadMarkers]);

  // ─── 삭제 처리 ───────────────────────────────────────────────
  const handleDelete = useCallback(async (marker) => {
    try {
      const ok = window.confirm(
        `정말 삭제하시겠습니까?\n\n장소: ${marker.location || "(장소명 없음)"}`
      );
      if (!ok) return;

      // 로그인 토큰 확보 (세션 없으면 로그인 페이지로 이동)
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.href = "/admin/login";
        return;
      }

      const res = await fetch(`/api/markers/${marker.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        // 화면 표에서 해당 id만 즉시 제거
        setMarkers((prev) => prev.filter((m) => m.id !== marker.id));
      } else {
        window.alert(data.error || "삭제에 실패했습니다.");
      }
    } catch (error) {
      console.error("[MarkerList] 삭제 실패:", error); // TODO: 배포 전 제거
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
    loadMarkers();
  }, [loadMarkers]);

  // ─── AI 설명 버튼 → 모달 열기 ────────────────────────────────
  const handleOpenAi = useCallback((marker) => {
    setAiEditingMarker(marker);
  }, []);

  // ─── AI 설명 확정 저장 완료 → 목록 갱신 + 모달 닫기 ─────────
  const handleAiSaved = useCallback(() => {
    setAiEditingMarker(null);
    loadMarkers();
  }, [loadMarkers]);

  // ─── 재생 확인(verify) → 정상이면 복원, 실패면 안내 ──────────
  // 관리자 전용 API 이므로 토큰을 붙여 호출한다. 성공 시 목록을 다시 불러와 배지 갱신.
  const handleVerify = useCallback(
    async (marker) => {
      if (verifyingId) return; // 다른 확인 진행 중이면 무시
      setVerifyingId(marker.id);
      setVerifyMessage("");
      try {
        // 로그인 토큰 확보 (세션 없으면 로그인 페이지로 이동)
        const token = await getAdminIdToken();
        if (!token) {
          window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
          window.location.href = "/admin/login";
          return;
        }

        const res = await fetch(`/api/markers/${marker.id}/verify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          // 정상 확인 → 목록 재조회 (배지가 🔴 LIVE 로 갱신됨)
          await loadMarkers();
        } else {
          // 실패 → 상태 유지 + 안내 배너
          setVerifyMessage(
            (marker.location ? `[${marker.location}] ` : "") +
              (data.error || "아직 재생할 수 없는 영상입니다")
          );
        }
      } catch (error) {
        console.error("[MarkerList] 재생 확인 실패:", error); // TODO: 배포 전 제거
        setVerifyMessage("재생 확인 중 오류가 발생했습니다.");
      } finally {
        setVerifyingId(null);
      }
    },
    [verifyingId, loadMarkers]
  );

  // ─── 드롭다운 옵션: 실제 데이터에 존재하는 대륙/국가만 추출 ───
  // (상태는 고정 목록을 쓰므로 여기서 계산하지 않는다.)
  const availableContinents = useMemo(() => {
    const set = new Set();
    for (const m of markers) {
      if (m.continent) set.add(m.continent);
    }
    // 정해진 대륙 순서 우선, 목록에 없는 값은 뒤로
    return Array.from(set).sort((a, b) => {
      const ia = CONTINENT_ORDER.indexOf(a);
      const ib = CONTINENT_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [markers]);

  // 국가 목록: 선택된 대륙에 속한 국가만 (대륙 미선택이면 전체)
  const availableCountries = useMemo(() => {
    const set = new Set();
    for (const m of markers) {
      if (filterContinent !== "all" && m.continent !== filterContinent) continue;
      if (m.country) set.add(m.country);
    }
    // 한국어 국가명 기준 정렬
    return Array.from(set).sort((a, b) => {
      const na = COUNTRY_NAME_BY_CODE[a] || a;
      const nb = COUNTRY_NAME_BY_CODE[b] || b;
      return na.localeCompare(nb, "ko");
    });
  }, [markers, filterContinent]);

  // ─── 도시 필터 옵션 ──────────────────────────────────────────
  // 현재 선택된 대륙/국가에 속하는 마커의 도시만 추려서 목록이 너무 길지 않게 한다.
  const availableCities = useMemo(() => {
    const set = new Set();
    for (const m of markers) {
      if (filterContinent !== "all" && m.continent !== filterContinent) continue;
      if (filterCountry !== "all" && m.country !== filterCountry) continue;
      if (m.city) set.add(m.city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [markers, filterContinent, filterCountry]);

  // ─── 필터 적용 (텍스트 검색 + 4개 드롭다운, 모두 AND 조건) ───
  // 이미 불러온 markers 배열만 걸러낸다 → 추가 API 호출/비용 없음.
  const filteredMarkers = useMemo(() => {
    const q = filterText.trim().toLowerCase();

    return markers.filter((m) => {
      // 1) 텍스트 검색 (장소명/도시/국가코드/국가명) — 비어 있으면 통과
      if (q) {
        const loc = (m.location || "").toLowerCase();
        const city = (m.city || "").toLowerCase();
        const countryCode = (m.country || "").toLowerCase();
        const countryName = (
          COUNTRY_NAME_BY_CODE[m.country] || ""
        ).toLowerCase();
        const textMatch =
          loc.includes(q) ||
          city.includes(q) ||
          countryCode.includes(q) ||
          countryName.includes(q);
        if (!textMatch) return false;
      }

      // 2) 대륙 필터 ("all" 이면 통과)
      if (filterContinent !== "all" && m.continent !== filterContinent) {
        return false;
      }

      // 3) 국가 필터
      if (filterCountry !== "all" && m.country !== filterCountry) {
        return false;
      }

      // 4) 도시 필터
      if (filterCity !== "all" && (m.city || "") !== filterCity) {
        return false;
      }

      // 5) 상태 필터 (배지와 동일 기준의 상태 키로 비교)
      if (filterStatus !== "all" && getStatusKey(m) !== filterStatus) {
        return false;
      }

      // 모든 조건 통과
      return true;
    });
  }, [
    markers,
    filterText,
    filterContinent,
    filterCountry,
    filterCity,
    filterStatus,
  ]);

  // ─── 필터 초기화 (모두 "전체"로) ─────────────────────────────
  function resetFilters() {
    setFilterText("");
    setFilterContinent("all");
    setFilterCountry("all");
    setFilterCity("all");
    setFilterStatus("all");
  }

  return (
    <div>
      {/* 검색창 + 드롭다운 필터 */}
      <div className="mb-3 space-y-2">
        {/* 텍스트 검색 (기존 유지) */}
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="검색 (장소명 · 도시 · 국가)"
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />

        {/* 드롭다운 필터 4종 + 초기화 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 대륙 필터 (변경 시 하위 국가/도시 선택은 초기화) */}
          <select
            value={filterContinent}
            onChange={(e) => {
              setFilterContinent(e.target.value);
              setFilterCountry("all");
              setFilterCity("all");
            }}
            className="rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="all">대륙 전체</option>
            {availableContinents.map((cont) => (
              <option key={cont} value={cont}>
                {CONTINENT_LABELS[cont] || cont}
              </option>
            ))}
          </select>

          {/* 국가 필터 (변경 시 하위 도시 선택은 초기화) */}
          <select
            value={filterCountry}
            onChange={(e) => {
              setFilterCountry(e.target.value);
              setFilterCity("all");
            }}
            className="rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="all">국가 전체</option>
            {availableCountries.map((code) => (
              <option key={code} value={code}>
                {(COUNTRY_NAME_BY_CODE[code] || code) + ` (${code})`}
              </option>
            ))}
          </select>

          {/* 도시 필터 (선택된 대륙/국가에 속한 도시만) */}
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="all">도시 전체</option>
            {availableCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          {/* 상태 필터 (고정 목록) */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-border px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            <option value="all">상태 전체</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* 필터 초기화 */}
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            필터 초기화
          </button>
        </div>
      </div>

      {/* 자동 재생가능 여부 검사 진행/결과 안내 (버튼 없이 페이지 로드 시 자동 실행) */}
      {scanning && (
        <div className="mb-3 flex items-center gap-2 rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {/* 회전 스피너 → "진행 중"임을 명확히 표시 */}
          <span
            className="inline-block h-4 w-4 flex-none animate-spin rounded-full border-2 border-teal-300 border-t-teal-700"
            aria-hidden="true"
          />
          <span>영상 재생 가능 여부를 확인하는 중입니다... (완료되면 결과가 표시됩니다)</span>
        </div>
      )}
      {!scanning && scanMessage && (
        <div className="mb-3 flex items-center justify-between rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          <span>✅ {scanMessage}</span>
          <button
            type="button"
            onClick={() => setScanMessage("")}
            className="ml-2 rounded px-1 text-teal-600 hover:bg-teal-100"
            aria-label="안내 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 재생 확인 실패 안내 배너 */}
      {verifyMessage && (
        <div className="mb-3 flex items-center justify-between rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <span>⚠️ {verifyMessage}</span>
          <button
            type="button"
            onClick={() => setVerifyMessage("")}
            className="ml-2 rounded px-1 text-orange-600 hover:bg-orange-100"
            aria-label="안내 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 로딩 / 에러 / 빈 상태 */}
      {loading && <p className="text-sm text-gray-500">목록을 불러오는 중...</p>}
      {!loading && loadError && (
        <p className="text-sm text-red-600">{loadError}</p>
      )}
      {!loading && !loadError && markers.length === 0 && (
        <p className="text-sm text-gray-500">등록된 마커가 없습니다.</p>
      )}
      {!loading &&
        !loadError &&
        markers.length > 0 &&
        filteredMarkers.length === 0 && (
          <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
        )}

      {/* 표 */}
      {!loading && !loadError && filteredMarkers.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <table className="min-w-full border-collapse text-left text-sm">
            {/* sticky 헤더 */}
            <thead className="sticky top-0 z-10 bg-gray-100 text-xs text-gray-600">
              <tr>
                <th className="px-2 py-2">썸네일</th>
                <th className="px-2 py-2">장소명</th>
                <th className="px-2 py-2">도시</th>
                <th className="px-2 py-2">국가</th>
                <th className="px-2 py-2">대륙</th>
                <th className="px-2 py-2">특성 태그</th>
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">채널명</th>
                <th className="px-2 py-2">마지막 확인</th>
                <th className="px-2 py-2">AI 설명</th>
                <th className="px-2 py-2">수정</th>
                <th className="px-2 py-2">삭제</th>
              </tr>
            </thead>
            <tbody>
              {filteredMarkers.map((marker) => {
                // 각 행은 marker.id 를 key 로 사용하고, 아래 값/핸들러는 이 marker 를 참조한다.
                const thumb = getThumb(marker);
                const badge = getStatusBadge(marker);
                const channelUrl = marker.youtube_channel_url || "";
                const channelName =
                  marker.youtube_channel_name || "(채널 정보 없음)";
                const continentLabel =
                  CONTINENT_LABELS[marker.continent] || marker.continent || "-";
                const countryLabel = marker.country
                  ? `${COUNTRY_NAME_BY_CODE[marker.country] || marker.country} (${marker.country})`
                  : "-";
                const lastChecked = formatTimestamp(marker.last_checked_at);

                return (
                  <tr
                    key={marker.id}
                    className="border-t border-gray-100 align-middle hover:bg-bg"
                  >
                    {/* 썸네일 */}
                    <td className="px-2 py-2">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={marker.location || "썸네일"}
                          className="h-9 w-16 rounded object-cover"
                        />
                      ) : (
                        <div className="h-9 w-16 rounded bg-gray-100" />
                      )}
                    </td>
                    {/* 장소명 */}
                    <td className="px-2 py-2 font-medium text-ink">
                      {marker.location || "(장소명 없음)"}
                    </td>
                    {/* 도시 */}
                    <td className="px-2 py-2 text-gray-700">
                      {marker.city || "-"}
                    </td>
                    {/* 국가 */}
                    <td className="px-2 py-2 text-gray-700">{countryLabel}</td>
                    {/* 대륙 */}
                    <td className="px-2 py-2 text-gray-700">{continentLabel}</td>
                    {/* 특성 태그 (없으면 -) */}
                    <td className="px-2 py-2">
                      {Array.isArray(marker.tags) && marker.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {marker.tags.map((tag) => (
                            <span
                              key={tag}
                              className="whitespace-nowrap rounded-full bg-brand-light px-1.5 py-0.5 text-xs text-brand"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {/* 상태 배지 (+ 재생불가 마커에만 "재생 확인") */}
                    <td className="px-2 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={
                            "whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold " +
                            badge.className
                          }
                        >
                          {badge.text}
                        </span>
                        {/* 재생 확인: videos.list 기반 상세 재확인 및 복원 (재생불가 마커만) */}
                        {(marker.auto_disabled === true ||
                          marker.is_active === false) && (
                          <button
                            type="button"
                            onClick={() => handleVerify(marker)}
                            disabled={verifyingId === marker.id}
                            title="재생 확인 = 상세 정보 갱신 및 복원 시도 (videos.list)"
                            className={
                              "whitespace-nowrap rounded border px-2 py-0.5 text-xs " +
                              (verifyingId === marker.id
                                ? "cursor-not-allowed border-border text-gray-400"
                                : "border-green-300 text-green-700 hover:bg-green-50")
                            }
                          >
                            {verifyingId === marker.id ? "확인 중..." : "재생 확인"}
                          </button>
                        )}
                      </div>
                    </td>
                    {/* 채널명 */}
                    <td className="px-2 py-2 text-gray-700">
                      {channelUrl ? (
                        <a
                          href={channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline"
                        >
                          {channelName} ↗
                        </a>
                      ) : (
                        <span>{channelName}</span>
                      )}
                    </td>
                    {/* 마지막 확인 */}
                    <td className="whitespace-nowrap px-2 py-2 text-gray-500">
                      {lastChecked}
                    </td>
                    {/* AI 설명 (확정 여부 배지 + 편집 버튼) */}
                    <td className="whitespace-nowrap px-2 py-2">
                      <div className="flex items-center gap-1">
                        {marker.description_confirmed === true ? (
                          <span
                            className="rounded bg-green-100 px-1 py-0.5 text-xs text-green-700"
                            title="설명 확정됨"
                          >
                            확정✅
                          </span>
                        ) : (
                          <span
                            className="rounded bg-yellow-100 px-1 py-0.5 text-xs text-yellow-700"
                            title="설명 미확정"
                          >
                            미확정⏳
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenAi(marker)}
                          className="rounded border border-brand px-2 py-1 text-xs text-brand hover:bg-brand-light"
                        >
                          AI 설명
                        </button>
                      </div>
                    </td>
                    {/* 수정 */}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(marker)}
                        className="rounded border border-border px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        수정
                      </button>
                    </td>
                    {/* 삭제 */}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(marker)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* AI 설명 검토/확정 모달 */}
      {aiEditingMarker && (
        <AiDescriptionEditor
          marker={aiEditingMarker}
          onClose={() => setAiEditingMarker(null)}
          onSaved={handleAiSaved}
        />
      )}
    </div>
  );
}
