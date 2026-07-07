"use client";

// ─────────────────────────────────────────────────────────────
// MarkerForm — 관리자 마커 등록 폼 (클라이언트 컴포넌트)
//
// 흐름:
//   1) 유튜브 URL 입력(디바운스) → video_id 추출 → 썸네일 미리보기 + 중복 확인 API 호출
//   2) 지도 클릭 또는 입력창으로 위도/경도 지정
//   3) 장소명/도시/국가/카테고리/실시간여부 입력 (국가 선택 시 대륙 자동 표시)
//   4) 등록 버튼 → POST /api/markers
//
// 연결되는 부품:
//   - LeafletMapWrapper (onMapClick 으로 클릭 좌표 수신)
//   - getContinentByCountry (국가코드 → 대륙 자동 계산)
//   - /api/markers/check-duplicate (중복 확인)
//   - /api/markers (등록)
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import { getContinentByCountry } from "@/lib/continentUtils";
import { getAdminIdToken } from "@/lib/clientAuth";
import TagSelector from "@/components/TagSelector";

// ─── 국가 목록 (ISO 3166-1 alpha-2) ───────────────────────────
// value = 국가코드(대문자), label = 한국어 국가명.
// ⚠️ 여기 코드들은 continentUtils 의 매핑에 존재해야 대륙 자동 계산이 동작한다.
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

// ─── 대륙 코드 → 한국어 라벨 ───────────────────────────────────
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  americas: "아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

// 지도 기본 중심 (좌표 미지정 시)
const DEFAULT_CENTER = { lat: 35.68, lng: 139.76 };

// ─── 클라이언트용 video_id 추출 함수 ──────────────────────────
// youtubeUtils.extractVideoId 와 동일한 규칙을 클라이언트에서 재현한다.
// (youtubeUtils 는 서버 전용 로직도 포함하므로, URL 판별만 여기서 가볍게 복제)
function extractVideoIdClient(url) {
  try {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    const ID = "[A-Za-z0-9_-]{11}";
    const patterns = [
      new RegExp("[?&]v=(" + ID + ")"),
      new RegExp("youtu\\.be/(" + ID + ")"),
      new RegExp("/live/(" + ID + ")"),
      new RegExp("/embed/(" + ID + ")"),
      new RegExp("/shorts/(" + ID + ")"),
      new RegExp("/v/(" + ID + ")"),
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m && m[1]) return m[1];
    }
    if (new RegExp("^" + ID + "$").test(trimmed)) return trimmed;
    return null;
  } catch (error) {
    console.error("[MarkerForm] video_id 추출 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

export default function MarkerForm({ onRegistered }) {
  // ─── 유튜브 관련 상태 ────────────────────────────────────────
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoId, setVideoId] = useState(null);
  // urlStatus: idle | invalid | checking | available | duplicate | error
  const [urlStatus, setUrlStatus] = useState("idle");
  const [duplicateMarker, setDuplicateMarker] = useState(null);
  const [checkErrorMsg, setCheckErrorMsg] = useState("");

  // ─── 위치 상태 (문자열로 관리해 입력창 편집 허용) ────────────
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  // ─── 나머지 입력 상태 ────────────────────────────────────────
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [isLive, setIsLive] = useState(true);
  // 장소 특성 태그 (지역 분류와 별개, 최대 3개)
  const [tags, setTags] = useState([]);

  // ─── 제출 상태 ───────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");

  // ─── 유튜브 URL 변경 → 디바운스 후 추출 + 중복 확인 ──────────
  useEffect(() => {
    const url = youtubeUrl.trim();

    // 비어 있으면 초기 상태로
    if (!url) {
      setVideoId(null);
      setUrlStatus("idle");
      setDuplicateMarker(null);
      setCheckErrorMsg("");
      return;
    }

    // 이 effect 실행분이 취소되었는지 추적 (빠른 연속 입력 시 오래된 응답 무시)
    let cancelled = false;

    const handle = setTimeout(async () => {
      try {
        const id = extractVideoIdClient(url);

        // 추출 실패 → 잘못된 링크 안내
        if (!id) {
          if (!cancelled) {
            setVideoId(null);
            setUrlStatus("invalid");
            setDuplicateMarker(null);
            setCheckErrorMsg("");
          }
          return;
        }

        // 추출 성공 → 썸네일 표시 + 중복 확인 시작
        if (!cancelled) {
          setVideoId(id);
          setUrlStatus("checking");
          setDuplicateMarker(null);
          setCheckErrorMsg("");
        }

        const res = await fetch(
          `/api/markers/check-duplicate?video_id=${encodeURIComponent(id)}`
        );
        const data = await res.json();

        if (cancelled) return;

        if (res.ok && data.exists) {
          // 이미 등록된 영상
          setUrlStatus("duplicate");
          setDuplicateMarker(data.marker || null);
        } else if (res.ok) {
          // 등록 가능
          setUrlStatus("available");
          setDuplicateMarker(null);
        } else {
          // 서버 에러 응답
          setUrlStatus("error");
          setCheckErrorMsg(data.error || "중복 확인에 실패했습니다.");
        }
      } catch (error) {
        console.error("[MarkerForm] 중복 확인 처리 실패:", error); // TODO: 배포 전 제거
        if (!cancelled) {
          setUrlStatus("error");
          setCheckErrorMsg("중복 확인 중 네트워크 오류가 발생했습니다.");
        }
      }
    }, 500);

    // 다음 입력이 들어오면 이전 타이머/응답을 무효화
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [youtubeUrl]);

  // ─── 지도 클릭 → 좌표 반영 ───────────────────────────────────
  function handleMapClick(coord) {
    try {
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        // 소수점 6자리로 정리해 입력창에 반영
        setLat(coord.lat.toFixed(6));
        setLng(coord.lng.toFixed(6));
      }
    } catch (error) {
      console.error("[MarkerForm] 지도 클릭 좌표 반영 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 썸네일 URL ──────────────────────────────────────────────
  const thumbnailUrl = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;

  // ─── 국가 선택 → 대륙 자동 계산 (표시용) ─────────────────────
  const continentLabel = useMemo(() => {
    if (!country) return "";
    const c = getContinentByCountry(country);
    if (!c) return "알 수 없음";
    return CONTINENT_LABELS[c] || c;
  }, [country]);

  // ─── 지도에 표시할 "선택 위치" 마커 ──────────────────────────
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasValidCoord =
    lat !== "" && lng !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  const mapMarkers = hasValidCoord
    ? [{ id: "selected", lat: latNum, lng: lngNum, location: "선택한 위치" }]
    : [];

  const mapCenter = hasValidCoord ? { lat: latNum, lng: lngNum } : DEFAULT_CENTER;

  // ─── 등록 버튼 활성화 조건 ───────────────────────────────────
  // 필수: 유튜브 URL(중복 아님 & 유효), 장소명, 위도/경도, 도시, 국가
  const canSubmit =
    urlStatus === "available" && // 유효하고 중복 아님
    !!videoId &&
    location.trim() !== "" &&
    hasValidCoord &&
    city.trim() !== "" &&
    country !== "" &&
    !submitting;

  // ─── 폼 초기화 ───────────────────────────────────────────────
  function resetForm() {
    setYoutubeUrl("");
    setVideoId(null);
    setUrlStatus("idle");
    setDuplicateMarker(null);
    setCheckErrorMsg("");
    setLat("");
    setLng("");
    setLocation("");
    setCity("");
    setCountry("");
    setIsLive(true);
    setTags([]);
  }

  // ─── 등록 처리 (POST /api/markers) ───────────────────────────
  async function handleSubmit() {
    // 안전장치: 조건 미충족 시 아무 동작 안 함
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitMessage("");
    setSubmitError("");

    try {
      // 로그인 토큰 확보 (세션 없으면 로그인 페이지로 이동)
      const token = await getAdminIdToken();
      if (!token) {
        window.alert("로그인이 만료되었습니다. 다시 로그인해주세요");
        window.location.href = "/admin/login";
        return;
      }

      const res = await fetch("/api/markers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          youtube_url: youtubeUrl.trim(),
          location: location.trim(),
          lat: latNum,
          lng: lngNum,
          city: city.trim(),
          country: country,
          is_live: isLive,
          tags: tags,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // 성공 → 폼 초기화 + 안내
        setSubmitMessage(data.message || "등록되었습니다.");
        resetForm();
        // 상위(관리자 페이지)에 등록 완료를 알려 목록을 갱신하게 한다.
        if (typeof onRegistered === "function") {
          onRegistered();
        }
      } else {
        // 서버가 돌려준 한국어 에러 메시지 표시
        setSubmitError(data.error || "등록에 실패했습니다. 입력값을 확인해 주세요.");
      }
    } catch (error) {
      console.error("[MarkerForm] 등록 처리 실패:", error); // TODO: 배포 전 제거
      setSubmitError("네트워크 오류로 등록에 실패했습니다: " + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 렌더 ────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 등록 성공/실패 안내 (상단 고정 영역) */}
      {submitMessage && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ {submitMessage}
        </div>
      )}
      {submitError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠️ {submitError}
        </div>
      )}

      {/* ── 1단계: 유튜브 링크 ───────────────────────────────── */}
      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          1. 유튜브 링크 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">
          라이브 스트림 영상의 유튜브 주소를 붙여넣으세요. (watch, youtu.be, /live 등 어떤 형태든 가능)
        </p>
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />

        {/* URL 상태 안내 */}
        {urlStatus === "invalid" && (
          <p className="text-sm text-red-600">올바른 유튜브 링크가 아닙니다.</p>
        )}
        {urlStatus === "checking" && (
          <p className="text-sm text-gray-500">중복 여부 확인 중...</p>
        )}
        {urlStatus === "available" && (
          <p className="text-sm text-green-600">
            등록 가능한 영상입니다. 아래 정보를 마저 입력하세요.
          </p>
        )}
        {urlStatus === "error" && (
          <p className="text-sm text-red-600">{checkErrorMsg}</p>
        )}

        {/* 중복 경고 박스 */}
        {urlStatus === "duplicate" && (
          <div className="rounded-md border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-bold">⛔ 이미 등록된 영상입니다.</p>
            {duplicateMarker && (
              <p className="mt-1">
                기존 등록: <strong>{duplicateMarker.location || "(장소명 없음)"}</strong>
                {" · "}
                {duplicateMarker.city || "-"} / {duplicateMarker.country || "-"}
                {duplicateMarker.youtube_title
                  ? ` · ${duplicateMarker.youtube_title}`
                  : ""}
              </p>
            )}
            <p className="mt-1">중복 등록을 방지하기 위해 등록 버튼이 비활성화됩니다.</p>
          </div>
        )}

        {/* 썸네일 미리보기 */}
        {thumbnailUrl && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-gray-500">썸네일 미리보기</p>
            {/* 원격 이미지라 next/image 대신 일반 img 사용 (도메인 설정 불필요) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt="유튜브 썸네일 미리보기"
              className="w-64 rounded-md border border-gray-200"
            />
          </div>
        )}
      </section>

      {/* ── 2단계: 지도에서 위치 지정 ─────────────────────────── */}
      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-800">
          2. 위치 지정 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500">
          지도를 클릭하면 그 지점의 좌표가 자동 입력됩니다. 아래 입력창에서 미세 조정도 가능합니다.
        </p>

        {/* 지도 (높이는 부모가 지정) */}
        <div className="h-80 w-full overflow-hidden rounded-md border border-gray-300">
          <LeafletMapWrapper
            markers={mapMarkers}
            center={mapCenter}
            zoom={hasValidCoord ? 8 : 4}
            onMapClick={handleMapClick}
            selectedMarkerId={hasValidCoord ? "selected" : null}
          />
        </div>

        {/* 위도/경도 입력 (직접 수정 가능) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600">위도 (lat)</label>
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="예: 35.6595"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">경도 (lng)</label>
            <input
              type="text"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="예: 139.7004"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        {!hasValidCoord && (lat !== "" || lng !== "") && (
          <p className="text-sm text-red-600">위도/경도는 숫자로 입력해 주세요.</p>
        )}
      </section>

      {/* ── 3단계: 장소 정보 ──────────────────────────────────── */}
      <section className="space-y-4">
        <label className="block text-sm font-semibold text-gray-800">
          3. 장소 정보 <span className="text-red-500">*</span>
        </label>

        {/* 장소명 */}
        <div>
          <label className="block text-xs text-gray-600">장소명</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 도쿄 시부야 교차로"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 도시 */}
        <div>
          <label className="block text-xs text-gray-600">도시</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="예: Tokyo"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* 국가 드롭다운 */}
        <div>
          <label className="block text-xs text-gray-600">국가</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">국가를 선택하세요</option>
            {COUNTRIES.map((c) => (
              // 각 옵션은 자신의 고유 코드(c.code)를 value 로 사용한다.
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          {/* 대륙 자동 표시 (수정 불가) */}
          {country && (
            <p className="mt-1 text-sm text-gray-600">대륙: {continentLabel}</p>
          )}
        </div>

        {/* 장소 특성 태그 (지역 분류와 별개, 최대 3개) */}
        <div>
          <label className="block text-xs text-gray-600">
            장소 특성 태그 (최대 3개)
          </label>
          <TagSelector value={tags} onChange={setTags} />
        </div>

        {/* 실시간 여부 토글 */}
        <div className="flex items-center gap-2">
          <input
            id="is_live"
            type="checkbox"
            checked={isLive}
            onChange={(e) => setIsLive(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="is_live" className="text-sm text-gray-700">
            실시간 라이브 영상입니다 (is_live)
          </label>
        </div>
      </section>

      {/* ── 등록 버튼 ─────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={
            "w-full rounded-md px-4 py-3 text-sm font-semibold text-white transition " +
            (canSubmit
              ? "bg-blue-600 hover:bg-blue-700"
              : "cursor-not-allowed bg-gray-300")
          }
        >
          {submitting ? "등록 중..." : "마커 등록"}
        </button>
        {!canSubmit && !submitting && (
          <p className="mt-2 text-xs text-gray-500">
            필수 항목(유튜브 링크·위치·장소명·도시·국가·카테고리)을 모두 채우고, 중복이 아니어야 등록할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
