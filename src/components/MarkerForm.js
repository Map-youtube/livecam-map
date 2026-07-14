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

import { useEffect, useMemo, useRef, useState } from "react";
import LeafletMapWrapper from "@/components/LeafletMapWrapper";
import Thumbnail from "@/components/DefaultThumbnail";
import { getContinentByCountry } from "@/lib/continentUtils";
import { getAdminIdToken } from "@/lib/clientAuth";
import TagSelector from "@/components/TagSelector";
import CityAutocomplete from "@/components/CityAutocomplete";
import { COUNTRIES, COUNTRY_GEO } from "@/lib/countryList";
// shadcn/ui 프리미티브 (디자인 토큰이 브랜드 청록에 매핑되어 있어 자동으로 사이트 톤을 따른다)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── 폼 단계 카드 헤더 (번호 뱃지 + 제목 + 필수 표시) ──────────
// 각 단계를 카드로 감싸 시각적 그룹을 만들고, 번호로 진행 순서를 명확히 한다.
function StepHeader({ step, title, required, children }) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {step}
        </span>
        <span>{title}</span>
        {required && (
          <span className="text-sm font-normal text-live" aria-label="필수">
            *
          </span>
        )}
      </CardTitle>
      {children && <CardDescription>{children}</CardDescription>}
    </CardHeader>
  );
}

// ─── 네이티브 select 공통 스타일 ───────────────────────────────
// shadcn Select 대신 네이티브 <select> 를 유지한다:
//   - 모바일에서 OS 기본 피커가 떠서 터치 사용성이 더 좋고(앱 전환 대비),
//   - 기존 onChange 로직을 그대로 쓸 수 있어 동작이 바뀔 위험이 없다.
// 대신 shadcn Input 과 시각적으로 동일해 보이도록 스타일만 맞춘다.
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

// ─── 대륙 코드 → 한국어 라벨 ───────────────────────────────────
const CONTINENT_LABELS = {
  asia: "아시아",
  europe: "유럽",
  north_america: "북아메리카",
  south_america: "남아메리카",
  africa: "아프리카",
  oceania: "오세아니아",
  middleeast: "중동",
};

// 대륙 선택 드롭다운 표시 순서
const CONTINENT_ORDER = [
  "asia",
  "europe",
  "north_america",
  "south_america",
  "africa",
  "oceania",
  "middleeast",
];

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
  // 대륙 (국가 목록을 추리는 기준. 국가 선택 시에도 자동으로 맞춰짐)
  const [continent, setContinent] = useState("");
  const [isLive, setIsLive] = useState(true);
  // 지도 중심/줌 (국가 선택 시 해당 국가 전체로 이동/확대하는 데 사용)
  const [mapView, setMapView] = useState({ center: DEFAULT_CENTER, zoom: 4 });
  // 역지오코딩(클릭 위치 → 도시/국가/대륙 자동입력) 진행 상태 + 결과 안내
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeNote, setGeocodeNote] = useState("");
  // 여러 번 빠르게 클릭할 때 "가장 최근 클릭"의 결과만 반영하기 위한 요청 번호
  const geocodeReqRef = useRef(0);
  // 장소 특성 태그 (지역 분류와 별개, 최대 3개)
  const [tags, setTags] = useState([]);
  // 도시 자동완성 목록 새로고침 신호 (등록 성공 시 +1 → 방금 추가한 도시도 추천에 반영)
  const [cityReload, setCityReload] = useState(0);

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

  // ─── 지도 클릭 → 좌표 반영 + 도시/국가/대륙 자동입력 ─────────
  function handleMapClick(coord) {
    try {
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        // 소수점 6자리로 정리해 입력창에 반영
        setLat(coord.lat.toFixed(6));
        setLng(coord.lng.toFixed(6));
        // 클릭한 위치의 도시/국가/대륙을 역지오코딩으로 자동 채운다(참고용, 수정 가능).
        reverseGeocodeFill(coord.lat, coord.lng);
      }
    } catch (error) {
      console.error("[MarkerForm] 지도 클릭 좌표 반영 실패:", error); // TODO: 배포 전 제거
    }
  }

  // ─── 역지오코딩: 좌표 → 도시/국가/대륙 자동입력 ──────────────
  // 서버 라우트(/api/geocode/reverse)가 OSM Nominatim(무료)으로 변환해 돌려준다.
  // 결과는 "참고용 자동입력"이며 부정확하면 관리자가 그 자리에서 수정한다.
  async function reverseGeocodeFill(lat, lng) {
    // 이 호출의 고유 번호(가장 최근 클릭 결과만 반영하기 위함)
    const reqId = ++geocodeReqRef.current;
    setGeocoding(true);
    setGeocodeNote("");
    try {
      // 관리자 토큰 확보 (없으면 조용히 건너뜀 — 자동입력은 부가 기능)
      const token = await getAdminIdToken();
      if (!token) {
        if (reqId === geocodeReqRef.current) setGeocoding(false);
        return;
      }

      const res = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(
          lat
        )}&lng=${encodeURIComponent(lng)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      // 더 최근의 클릭이 있었다면 이 오래된 응답은 버린다.
      if (reqId !== geocodeReqRef.current) return;

      if (res.ok && data.ok) {
        // 도시명 (있으면 덮어씀 — 클릭한 위치가 기준)
        if (data.city) setCity(data.city);
        // 대륙 (continentUtils 로 계산되어 옴)
        if (data.continent) setContinent(data.continent);
        // 국가: 우리 드롭다운 목록(COUNTRIES)에 있는 코드만 선택, 없으면 비워 직접 선택 유도
        if (
          data.countryCode &&
          COUNTRIES.some((c) => c.code === data.countryCode)
        ) {
          setCountry(data.countryCode);
        } else {
          setCountry("");
        }

        // 안내 문구
        if (data.city || data.countryCode) {
          const label = [data.city, data.countryCode]
            .filter(Boolean)
            .join(", ");
          setGeocodeNote(
            `자동입력됨: ${label} — 정확하지 않으면 직접 수정하세요.`
          );
        } else {
          setGeocodeNote(
            "이 위치의 도시명을 찾지 못했습니다. 도시를 직접 입력해 주세요."
          );
        }
      } else {
        setGeocodeNote(
          data.error || "도시명 자동입력에 실패했습니다. 직접 입력해 주세요."
        );
      }
    } catch (error) {
      console.error("[MarkerForm] 역지오코딩 실패:", error); // TODO: 배포 전 제거
      if (reqId === geocodeReqRef.current) {
        setGeocodeNote("도시명 자동입력 중 오류가 발생했습니다. 직접 입력해 주세요.");
      }
    } finally {
      if (reqId === geocodeReqRef.current) setGeocoding(false);
    }
  }

  // ─── 썸네일 URL ──────────────────────────────────────────────
  const thumbnailUrl = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;

  // ─── 지도에 표시할 "선택 위치" 마커 ──────────────────────────
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasValidCoord =
    lat !== "" && lng !== "" && !Number.isNaN(latNum) && !Number.isNaN(lngNum);

  const mapMarkers = hasValidCoord
    ? [{ id: "selected", lat: latNum, lng: lngNum, location: "선택한 위치" }]
    : [];

  // ─── 선택된 대륙에 속한 국가만 추림 (대륙 미선택 시 빈 목록) ──
  // 국가가 너무 많아 찾기 어려우므로, 대륙을 먼저 고르면 그 대륙 국가만 보여준다.
  const filteredCountries = useMemo(() => {
    if (!continent) return [];
    // 대륙에 속한 모든 국가를 추린 뒤, 국가 수가 많으므로 한국어 이름순으로 정렬한다.
    return COUNTRIES.filter(
      (c) => getContinentByCountry(c.code) === continent
    ).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [continent]);

  // ─── 등록 버튼 활성화 조건 ───────────────────────────────────
  // 필수: 유튜브 URL(중복 아님 & 유효), 장소명, 위도/경도, 도시, 국가
  const canSubmit =
    urlStatus === "available" && // 유효하고 중복 아님
    !!videoId &&
    location.trim() !== "" &&
    hasValidCoord &&
    city.trim() !== "" &&
    country !== "" &&
    continent !== "" &&
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
    setContinent("");
    setIsLive(true);
    setTags([]);
    setGeocodeNote("");
    setGeocoding(false);
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
          continent: continent,
          is_live: isLive,
          tags: tags,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // 성공 → 폼 초기화 + 안내
        setSubmitMessage(data.message || "등록되었습니다.");
        resetForm();
        // 방금 추가한 도시도 자동완성 추천에 반영되도록 도시 목록을 다시 불러오게 한다.
        setCityReload((n) => n + 1);
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
  // ⚠️ 아래는 화면(JSX)만 재설계한 것으로, 위의 상태/핸들러 로직은 그대로다.
  return (
    <div className="w-full space-y-5">
      {/* 등록 성공/실패 안내 (상단 고정 영역) */}
      {submitMessage && (
        <div className="rounded-md border border-brand/30 bg-brand-light px-4 py-3 text-sm font-medium text-brand-hover">
          ✅ {submitMessage}
        </div>
      )}
      {submitError && (
        <div className="rounded-md border border-live/30 bg-live-light px-4 py-3 text-sm font-medium text-live">
          ⚠️ {submitError}
        </div>
      )}

      {/* ── 1단계: 유튜브 링크 ───────────────────────────────── */}
      <Card>
        <StepHeader step={1} title="유튜브 링크" required>
          라이브 스트림 영상의 유튜브 주소를 붙여넣으세요. (watch, youtu.be,
          /live 등 어떤 형태든 가능)
        </StepHeader>
        <CardContent className="space-y-3">
          <Input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />

          {/* URL 상태 안내 */}
          {urlStatus === "invalid" && (
            <p className="text-sm text-live">올바른 유튜브 링크가 아닙니다.</p>
          )}
          {urlStatus === "checking" && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <span
                className="inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-border border-t-brand"
                aria-hidden="true"
              />
              중복 여부 확인 중...
            </p>
          )}
          {urlStatus === "available" && (
            <p className="text-sm font-medium text-brand">
              ✓ 등록 가능한 영상입니다. 아래 정보를 마저 입력하세요.
            </p>
          )}
          {urlStatus === "error" && (
            <p className="text-sm text-live">{checkErrorMsg}</p>
          )}

          {/* 중복 경고 박스 */}
          {urlStatus === "duplicate" && (
            <div className="rounded-md border border-live bg-live-light px-4 py-3 text-sm text-live">
              <p className="font-bold">⛔ 이미 등록된 영상입니다.</p>
              {duplicateMarker && (
                <p className="mt-1">
                  기존 등록:{" "}
                  <strong>{duplicateMarker.location || "(장소명 없음)"}</strong>
                  {" · "}
                  {duplicateMarker.city || "-"} / {duplicateMarker.country || "-"}
                  {duplicateMarker.youtube_title
                    ? ` · ${duplicateMarker.youtube_title}`
                    : ""}
                </p>
              )}
              <p className="mt-1">
                중복 등록을 방지하기 위해 등록 버튼이 비활성화됩니다.
              </p>
            </div>
          )}

          {/* 썸네일 미리보기 */}
          {thumbnailUrl && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-muted">
                썸네일 미리보기
              </p>
              {/* 로딩 실패(깨진 URL 등) 시 기본 이미지로 대체 */}
              <Thumbnail
                src={thumbnailUrl}
                alt="유튜브 썸네일 미리보기"
                className="w-64 max-w-full rounded-md border border-border"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2단계: 장소 정보 ──────────────────────────────────── */}
      <Card>
        <StepHeader step={2} title="장소 정보" required>
          장소명 → 대륙 → (대륙에 맞는) 국가 → 도시 순서로 입력하세요. 국가를
          선택하면 아래 지도가 그 국가로 자동 이동합니다.
        </StepHeader>
        <CardContent>
          {/* 좁은 화면에선 1열, 넓어질수록 2열 → 4열 (관리자 왼쪽 컬럼이 화면의 절반이라 4열은 넓을 때만) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* 장소명 */}
            <div className="space-y-1.5">
              <Label htmlFor="mf-location">장소명</Label>
              <Input
                id="mf-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 도쿄 시부야 교차로"
              />
            </div>

            {/* 대륙 드롭다운 (선택 시 국가 목록이 그 대륙으로 추려짐) */}
            <div className="space-y-1.5">
              <Label htmlFor="mf-continent">대륙</Label>
              <select
                id="mf-continent"
                value={continent}
                onChange={(e) => {
                  const val = e.target.value;
                  setContinent(val);
                  // 대륙이 바뀌면 국가 목록이 달라지므로 기존 국가 선택을 초기화한다.
                  setCountry("");
                }}
                className={SELECT_CLASS}
              >
                <option value="">대륙 선택</option>
                {CONTINENT_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CONTINENT_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            {/* 국가 드롭다운 (대륙을 먼저 골라야 활성화, 선택 시 지도 이동) */}
            <div className="space-y-1.5">
              <Label htmlFor="mf-country">국가</Label>
              <select
                id="mf-country"
                value={country}
                disabled={!continent}
                onChange={(e) => {
                  const code = e.target.value;
                  setCountry(code);
                  // 방어적으로 대륙도 국가에 맞춰 보정 (필터로 이미 일치하지만 안전하게)
                  const c = getContinentByCountry(code);
                  if (c) setContinent(c);
                  // 국가를 고르면 그 국가 전체가 보이도록 지도를 이동/확대한다.
                  const geo = COUNTRY_GEO[code];
                  if (geo) {
                    setMapView({
                      center: { lat: geo.lat, lng: geo.lng },
                      zoom: geo.zoom,
                    });
                  }
                }}
                className={SELECT_CLASS}
              >
                <option value="">
                  {continent ? "국가를 선택하세요" : "대륙을 먼저 선택하세요"}
                </option>
                {filteredCountries.map((c) => (
                  // 각 옵션은 자신의 고유 코드(c.code)를 value 로 사용한다.
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* 도시 (자동완성 — 기존 도시명 추천 + 중복 표기 방지) */}
            <div className="space-y-1.5">
              <Label htmlFor="mf-city">도시</Label>
              <CityAutocomplete
                value={city}
                onChange={setCity}
                country={country}
                placeholder="예: Tokyo"
                reloadSignal={cityReload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3단계: 지도에서 위치 지정 ─────────────────────────── */}
      <Card>
        <StepHeader step={3} title="위치 지정" required>
          지도를 클릭하면 그 지점의 좌표와 함께{" "}
          <strong className="font-semibold text-ink">
            도시·국가·대륙이 자동으로 채워집니다
          </strong>{" "}
          (부정확하면 직접 수정). 위에서 국가를 선택하면 지도가 그 국가로
          이동합니다.
        </StepHeader>
        <CardContent className="space-y-3">
          {/* 지도 — 좁은 화면에선 낮게, 넓어질수록 크게 */}
          <div className="h-[380px] w-full overflow-hidden rounded-md border border-border sm:h-[480px] xl:h-[560px]">
            <LeafletMapWrapper
              markers={mapMarkers}
              center={mapView.center}
              zoom={mapView.zoom}
              onMapClick={handleMapClick}
              selectedMarkerId={hasValidCoord ? "selected" : null}
            />
          </div>

          {/* 역지오코딩(자동입력) 진행/결과 안내 */}
          {geocoding && (
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <span
                className="inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-border border-t-brand"
                aria-hidden="true"
              />
              📍 클릭한 위치의 도시·국가를 불러오는 중...
            </p>
          )}
          {!geocoding && geocodeNote && (
            <p className="text-xs text-ink-muted">{geocodeNote}</p>
          )}

          {/* 위도/경도 입력 (직접 수정 가능) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mf-lat">위도 (lat)</Label>
              <Input
                id="mf-lat"
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="예: 35.6595"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mf-lng">경도 (lng)</Label>
              <Input
                id="mf-lng"
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="예: 139.7004"
                className="font-mono"
              />
            </div>
          </div>
          {!hasValidCoord && (lat !== "" || lng !== "") && (
            <p className="text-sm text-live">
              위도/경도는 숫자로 입력해 주세요.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 4단계: 장소 특성 태그 ─────────────────────────────── */}
      <Card>
        <StepHeader step={4} title="장소 특성 태그">
          지역 분류와 별개인 특성 태그입니다 (최대 3개, 선택 사항).
        </StepHeader>
        <CardContent className="space-y-4">
          <TagSelector value={tags} onChange={setTags} />

          {/* 실시간 여부 토글 (base-ui Checkbox → onCheckedChange 로 값 수신) */}
          <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg px-3 py-2.5">
            <Checkbox
              id="is_live"
              checked={isLive}
              onCheckedChange={(checked) => setIsLive(checked === true)}
            />
            <Label htmlFor="is_live" className="cursor-pointer font-normal">
              실시간 라이브 영상입니다{" "}
              <span className="font-mono text-xs text-ink-muted">
                (is_live)
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ── 등록 버튼 (하단 고정 영역) ────────────────────────── */}
      <div className="space-y-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-11 w-full text-sm font-semibold"
        >
          {submitting ? "등록 중..." : "마커 등록"}
        </Button>
        {!canSubmit && !submitting && (
          <p className="text-center text-xs text-ink-muted">
            필수 항목(유튜브 링크 · 위치 · 장소명 · 대륙 · 국가 · 도시)을 모두
            채우고, 중복이 아니어야 등록할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
