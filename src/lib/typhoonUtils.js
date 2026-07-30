// ─────────────────────────────────────────────────────────────
// typhoonUtils — 태풍(열대저기압) 공식 예보 텍스트 파서 + 풍속반경 기하 계산
//
// 왜 이 파일이 필요한가 (2026-07-30 신설):
//   NASA EONET(기존 자연재해 레이어)은 태풍의 "관측 이력"만 준다(미래 날짜 없음 — 실측 확인).
//   사용자가 요청한 "예상경로 + 바람 피해범위"를 그리려면 공식 예보 기관 자료가 필요하다.
//     · NHC  (미국 국립허리케인센터) : 대서양 · 동태평양
//     · JTWC (미해군 합동태풍경보센터): 서태평양(한국·일본) · 인도양 · 남반구
//   두 기관 모두 예보 위치와 "사분면별 풍속 반경"을 평문 텍스트로 공개한다(무료, API 키 불필요).
//   → 여기서 나오는 경로/반경은 전부 공식 발표값이며, 우리가 추정·보간한 값이 아니다.
//
// ⚠️ 두 기관의 텍스트 형식이 다르므로 파서를 각각 둔다.
//    NHC  : "64 KT... 30NE  15SE   0SW  25NW."   (한 줄에 사분면 4개)
//    JTWC : "RADIUS OF 064 KT WINDS - 045 NM NORTHEAST QUADRANT" + 이어지는 3줄
//
// ⚠️ 파서는 절대 throw 하지 않는다. 형식이 바뀌면 빈 값을 반환해 레이어가 조용히 비도록 한다
//    (기관 텍스트 형식 변경으로 지도 전체가 깨지는 것을 막는다).
// ─────────────────────────────────────────────────────────────

// 해리(nautical mile) → 미터
export const NM_TO_M = 1852;

// 사분면 키 순서 (북동 → 남동 → 남서 → 북서)
export const QUADRANTS = ["ne", "se", "sw", "nw"];

// ─── ddhhmmZ (예: "300600Z") → ISO 문자열 ────────────────────
// 텍스트에는 "일/시/분"만 있고 연·월이 없다. 현재 시각을 기준으로 월을 추정한다.
//   · 표기된 일(day)이 오늘보다 15일 이상 크면 "지난달"로 본다(월말→월초 전환 대응).
//   · 15일 이상 작으면 "다음달"로 본다(예보가 월을 넘길 때).
// ⚠️ 이 추정은 표시·정렬용이다. 좌표·풍속 같은 실제 예보값은 추정하지 않는다.
export function parseDayHourZ(token, now = new Date()) {
  try {
    const m = String(token || "").match(/^(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) return null;
    const day = Number(m[1]);
    const hour = Number(m[2]);
    const minute = Number(m[3]);
    if (!(day >= 1 && day <= 31) || hour > 23 || minute > 59) return null;

    let year = now.getUTCFullYear();
    let month = now.getUTCMonth(); // 0-based
    const today = now.getUTCDate();

    if (day - today > 15) {
      // 표기일이 오늘보다 훨씬 큼 → 지난달
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    } else if (today - day > 15) {
      // 표기일이 오늘보다 훨씬 작음 → 다음달
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    const d = new Date(Date.UTC(year, month, day, hour, minute));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch (error) {
    return null;
  }
}

// ─── "16.9N 164.9E" / "20.2N 122.1W" → {lat, lng} ───────────
export function parseLatLng(latStr, latHemi, lngStr, lngHemi) {
  try {
    let lat = Number(latStr);
    let lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (String(latHemi).toUpperCase() === "S") lat = -lat;
    if (String(lngHemi).toUpperCase() === "W") lng = -lng;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch (error) {
    return null;
  }
}

// 빈 풍속반경 묶음
function emptyRadii() {
  return {};
}

// radii 객체에 값 넣기: radii["r34"] = {ne,se,sw,nw} (해리)
function setRadius(radii, ktThreshold, quadrant, nm) {
  const key = "r" + ktThreshold;
  if (!radii[key]) radii[key] = { ne: 0, se: 0, sw: 0, nw: 0 };
  radii[key][quadrant] = nm;
}

// 사분면 이름(텍스트) → 키
function quadKey(name) {
  const s = String(name || "").toUpperCase();
  if (s.startsWith("NORTHEAST")) return "ne";
  if (s.startsWith("SOUTHEAST")) return "se";
  if (s.startsWith("SOUTHWEST")) return "sw";
  if (s.startsWith("NORTHWEST")) return "nw";
  return null;
}

// ─────────────────────────────────────────────────────────────
// NHC 예보전문(TCM) 파서
//
// 관련 줄 형식:
//   HURRICANE CENTER LOCATED NEAR 20.2N 122.1W AT 30/0900Z
//   PRESENT MOVEMENT TOWARD THE WEST-NORTHWEST OR 300 DEGREES AT  10 KT
//   MAX SUSTAINED WINDS  80 KT WITH GUSTS TO 100 KT.
//   64 KT....... 40NE  25SE  20SW  40NW.
//   FORECAST VALID 30/1800Z 20.7N 123.9W
//   MAX WIND  70 KT...GUSTS  85 KT.
//   34 KT...110NE 100SE  70SW 100NW.
// ─────────────────────────────────────────────────────────────
export function parseNhcAdvisory(text, now = new Date()) {
  const out = { current: null, forecast: [] };
  try {
    const raw = String(text || "");
    // HTML 로 감싸져 오는 경우(<pre>) 태그 제거
    const body = raw.includes("<") ? raw.replace(/<[^>]+>/g, "") : raw;
    const lines = body.split(/\r?\n/);

    // 현재 위치 (…CENTER LOCATED NEAR 20.2N 122.1W AT 30/0900Z)
    let current = null;
    // 지금 풍속반경을 채워 넣을 대상(현재 or 예보 항목)
    let target = null;

    for (const line of lines) {
      // ── 현재 중심 위치 ──
      // ⚠️ 이 문구는 전문에 두 번 나온다(본문 + 하단 "REPEAT...CENTER LOCATED NEAR ...").
      //    두 번째(REPEAT)에서 current 를 다시 만들면, 그 사이에 파싱해 둔 최대풍속·풍속반경·
      //    이동정보가 통째로 날아간다(2026-07-30 실측 버그). → 첫 번째만 받는다.
      const cm = line.match(
        /CENTER LOCATED NEAR\s+([\d.]+)([NS])\s+([\d.]+)([EW])\s+AT\s+(\d{2})\/(\d{4})Z/i
      );
      if (cm) {
        if (!current) {
          const pos = parseLatLng(cm[1], cm[2], cm[3], cm[4]);
          if (pos) {
            current = {
              ...pos,
              // ⚠️ parseDayHourZ 는 ddhhmmZ(6자리)를 받는다. cm[6] 이 이미 hhmm 이므로
              //    "00" 을 덧붙이면 8자리가 되어 파싱에 실패한다(2026-07-30 실측 버그).
              validAt: parseDayHourZ(cm[5] + cm[6] + "Z", now),
              maxWindKt: null,
              gustKt: null,
              radii: emptyRadii(),
            };
            target = current;
          }
        }
        continue;
      }

      // ── 이동 방향/속도 ──
      const mv = line.match(
        /PRESENT MOVEMENT TOWARD[^0-9]*?(\d{1,3})\s+DEGREES AT\s+(\d{1,3})\s*KT/i
      );
      if (mv && current) {
        current.movementDeg = Number(mv[1]);
        current.movementKt = Number(mv[2]);
        continue;
      }

      // ── 예보 위치 (FORECAST VALID 30/1800Z 20.7N 123.9W) ──
      //    OUTLOOK VALID 도 같은 형식이라 함께 받는다(4~5일차).
      const fm = line.match(
        /(?:FORECAST|OUTLOOK) VALID\s+(\d{2})\/(\d{4})Z\s+([\d.]+)([NS])\s+([\d.]+)([EW])/i
      );
      if (fm) {
        const pos = parseLatLng(fm[3], fm[4], fm[5], fm[6]);
        if (pos) {
          const item = {
            ...pos,
            // ⚠️ fm[2] 가 이미 hhmm 이다 — "00" 을 덧붙이면 8자리가 되어 파싱 실패(위와 동일 버그).
            validAt: parseDayHourZ(fm[1] + fm[2] + "Z", now),
            maxWindKt: null,
            radii: emptyRadii(),
          };
          out.forecast.push(item);
          target = item;
        }
        continue;
      }

      // ── 최대풍속 (현재: MAX SUSTAINED WINDS n KT / 예보: MAX WIND n KT) ──
      const wm = line.match(
        /MAX(?:IMUM)?\s+(?:SUSTAINED\s+)?WINDS?\s+(\d{1,3})\s*KT/i
      );
      if (wm && target) {
        target.maxWindKt = Number(wm[1]);
        const gm = line.match(/GUSTS?(?:\s+TO)?\s+(\d{1,3})\s*KT/i);
        if (gm) target.gustKt = Number(gm[1]);
        continue;
      }

      // ── 사분면 풍속반경 (64 KT... 30NE  15SE   0SW  25NW.) ──
      const rm = line.match(
        /^\s*(\d{2,3})\s*KT\.*\s*(\d{1,3})NE\s+(\d{1,3})SE\s+(\d{1,3})SW\s+(\d{1,3})NW/i
      );
      if (rm && target) {
        const kt = Number(rm[1]);
        setRadius(target.radii, kt, "ne", Number(rm[2]));
        setRadius(target.radii, kt, "se", Number(rm[3]));
        setRadius(target.radii, kt, "sw", Number(rm[4]));
        setRadius(target.radii, kt, "nw", Number(rm[5]));
        continue;
      }
    }

    out.current = current;
    // 예보는 시간순 정렬(파싱 순서가 이미 시간순이지만 방어적으로)
    out.forecast.sort((a, b) =>
      String(a.validAt || "").localeCompare(String(b.validAt || ""))
    );
    return out;
  } catch (error) {
    console.error("[typhoonUtils] NHC 파싱 실패:", error); // TODO: 배포 전 제거
    return out;
  }
}

// ─────────────────────────────────────────────────────────────
// JTWC 경보 파서
//
// 관련 줄 형식:
//   WARNING POSITION:
//   300600Z --- NEAR 16.9N 164.9E
//     MOVEMENT PAST SIX HOURS - 305 DEGREES AT 09 KTS
//   MAX SUSTAINED WINDS - 140 KT, GUSTS 170 KT
//   RADIUS OF 064 KT WINDS - 045 NM NORTHEAST QUADRANT
//                            040 NM SOUTHEAST QUADRANT   ← 이어지는 줄
//   FORECASTS:
//   12 HRS, VALID AT:
//   301800Z --- 17.9N 163.1E
// ─────────────────────────────────────────────────────────────
export function parseJtwcWarning(text, now = new Date()) {
  const out = { current: null, forecast: [] };
  try {
    const body = String(text || "");
    const lines = body.split(/\r?\n/);

    let current = null;
    let target = null;
    let curKt = null; // 지금 읽고 있는 "RADIUS OF nnn KT" 임계값
    let inForecasts = false;

    for (const line of lines) {
      // 예보 구간 시작
      if (/^\s*FORECASTS?\s*:/i.test(line)) {
        inForecasts = true;
        continue;
      }

      // ── 위치 줄: "300600Z --- NEAR 16.9N 164.9E" 또는 "301800Z --- 17.9N 163.1E" ──
      const pm = line.match(
        /^\s*(\d{6}Z)\s*-*\s*(?:NEAR\s+)?([\d.]+)([NS])\s+([\d.]+)([EW])/i
      );
      if (pm) {
        const pos = parseLatLng(pm[2], pm[3], pm[4], pm[5]);
        if (pos) {
          const item = {
            ...pos,
            validAt: parseDayHourZ(pm[1], now),
            maxWindKt: null,
            gustKt: null,
            radii: emptyRadii(),
          };
          if (!inForecasts && !current) {
            current = item;
            target = current;
          } else if (inForecasts) {
            out.forecast.push(item);
            target = item;
          }
          curKt = null;
        }
        continue;
      }

      // ── 이동: "MOVEMENT PAST SIX HOURS - 305 DEGREES AT 09 KTS" ──
      const mv = line.match(
        /MOVEMENT[^0-9]*?(\d{1,3})\s+DEGREES AT\s+(\d{1,3})\s*KTS?/i
      );
      if (mv && current && !inForecasts) {
        current.movementDeg = Number(mv[1]);
        current.movementKt = Number(mv[2]);
        continue;
      }

      // ── 최대풍속: "MAX SUSTAINED WINDS - 140 KT, GUSTS 170 KT" ──
      const wm = line.match(/MAX SUSTAINED WINDS?\s*-\s*(\d{1,3})\s*KT/i);
      if (wm && target) {
        target.maxWindKt = Number(wm[1]);
        const gm = line.match(/GUSTS?\s+(\d{1,3})\s*KT/i);
        if (gm) target.gustKt = Number(gm[1]);
        continue;
      }

      // ── 반경 시작줄: "RADIUS OF 064 KT WINDS - 045 NM NORTHEAST QUADRANT" ──
      const rs = line.match(
        /RADIUS OF\s+(\d{2,3})\s*KT\s+WINDS?\s*-\s*(\d{1,3})\s*NM\s+(\w+)\s+QUADRANT/i
      );
      if (rs && target) {
        curKt = Number(rs[1]);
        const q = quadKey(rs[3]);
        if (q) setRadius(target.radii, curKt, q, Number(rs[2]));
        continue;
      }

      // ── 반경 이어지는 줄: "040 NM SOUTHEAST QUADRANT" ──
      const rc = line.match(/^\s*(\d{1,3})\s*NM\s+(\w+)\s+QUADRANT/i);
      if (rc && target && curKt != null) {
        const q = quadKey(rc[2]);
        if (q) setRadius(target.radii, curKt, q, Number(rc[1]));
        continue;
      }
    }

    out.current = current;
    out.forecast.sort((a, b) =>
      String(a.validAt || "").localeCompare(String(b.validAt || ""))
    );
    return out;
  } catch (error) {
    console.error("[typhoonUtils] JTWC 파싱 실패:", error); // TODO: 배포 전 제거
    return out;
  }
}

// ─────────────────────────────────────────────────────────────
// 사분면 풍속반경 → 지도에 그릴 폴리곤 좌표 배열
//
// 각 사분면의 반경(해리)이 다르므로, 사분면마다 자기 반경으로 호(arc)를 그려 이어 붙인다.
// 반환: [[lat,lng], ...] (Leaflet Polygon 용). 반경이 전부 0이면 null.
//
// ⚠️ 방위각 기준: 0°=북, 90°=동 (기상 관례). 사분면 경계는 0/90/180/270°.
// ⚠️ 위도에 따라 경도 1도의 실제 거리가 줄어들므로 cos(lat) 보정을 넣는다.
//    (보정 없이 그리면 고위도에서 원이 가로로 심하게 늘어난다)
// ─────────────────────────────────────────────────────────────
export function windRadiiPolygon(lat, lng, quadRadii, stepDeg = 6) {
  try {
    if (!quadRadii) return null;
    const ne = Number(quadRadii.ne) || 0;
    const se = Number(quadRadii.se) || 0;
    const sw = Number(quadRadii.sw) || 0;
    const nw = Number(quadRadii.nw) || 0;
    if (ne <= 0 && se <= 0 && sw <= 0 && nw <= 0) return null;

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

    // 방위각이 속한 사분면의 반경(해리)
    const radiusAt = (bearingDeg) => {
      const b = ((bearingDeg % 360) + 360) % 360;
      if (b < 90) return ne;
      if (b < 180) return se;
      if (b < 270) return sw;
      return nw;
    };

    // 위도 1도 ≈ 60해리. 경도 1도 ≈ 60해리 × cos(위도)
    const cosLat = Math.cos((latNum * Math.PI) / 180);
    const safeCos = Math.abs(cosLat) < 0.01 ? 0.01 : cosLat; // 극지방 0 나눗셈 방어

    const points = [];
    for (let b = 0; b <= 360; b += stepDeg) {
      const rNm = radiusAt(b);
      if (rNm <= 0) {
        // 그 사분면에 해당 강도 바람이 없으면 중심으로 붙인다(면적 0 구간)
        points.push([latNum, lngNum]);
        continue;
      }
      const rad = (b * Math.PI) / 180;
      const dLat = (rNm * Math.cos(rad)) / 60;
      const dLng = (rNm * Math.sin(rad)) / (60 * safeCos);
      points.push([latNum + dLat, lngNum + dLng]);
    }
    return points;
  } catch (error) {
    console.error("[typhoonUtils] 풍속반경 폴리곤 계산 실패:", error); // TODO: 배포 전 제거
    return null;
  }
}

// ─── 최대풍속(kt) → 태풍 강도 등급 ───────────────────────────
// 사피어-심프슨(허리케인) 기준. 표시용 라벨과 색을 함께 돌려준다.
//   ⚠️ 한국 기상청 등급과는 기준이 다르므로 화면에 "국제 기준(kt)"임을 함께 표기한다.
export function typhoonCategory(maxWindKt) {
  const kt = Number(maxWindKt);
  if (!Number.isFinite(kt)) return { key: "unknown", color: "#94A3B8" };
  if (kt >= 137) return { key: "cat5", color: "#7B1FA2" };
  if (kt >= 113) return { key: "cat4", color: "#C62828" };
  if (kt >= 96) return { key: "cat3", color: "#EF6C00" };
  if (kt >= 83) return { key: "cat2", color: "#F9A825" };
  if (kt >= 64) return { key: "cat1", color: "#FBC02D" };
  if (kt >= 34) return { key: "ts", color: "#43A047" };
  return { key: "td", color: "#29B6F6" };
}

// kt → km/h (표시용)
export function ktToKmh(kt) {
  const n = Number(kt);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1.852);
}
