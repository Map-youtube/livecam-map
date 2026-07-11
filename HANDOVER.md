# 인수인계 & 진행상황 문서 — 글로벌 라이브캠 지도 서비스 (TripByClip)

> 최종 업데이트: **2026-07-11**
> 대상 도메인: `tripbyclip.com` (배포: Vercel) · 브랜치: `develop`(작업) / `master`(배포)
> 서비스 컨셉·상세 규칙은 `CLAUDE.md`, Next.js 16 주의사항은 `AGENTS.md` 를 함께 볼 것.
> 이 문서는 **다음 세션이 맥락을 이어받도록** 현재 상태·판단·미해결 사항을 정리한 것이다.

---

## 0. ⚠️ 다음 세션이 가장 먼저 알아야 할 것 (TL;DR)

1. **게시 반영 자동화 중**: 사용자 지시로 **매 작업마다 `develop` 커밋/푸시 후 곧바로 `master` 병합·푸시**(추가 확인 없이)한다. "게시 반영 그만/개발단계 종료" 지시 전까지 유지. (메모리 `auto-publish-to-master` 참고)
2. **다국어는 next-intl 아님**: 직접 만든 **클라이언트 i18n(17개 언어)**. `src/lib/i18n/*`, `src/components/i18n/*`. (메모리 `i18n-architecture` 참고)
3. **관리자 인증은 `firebase-admin/auth` 안 씀**: Vercel 서버리스에서 `firebase-admin/auth`가 ESM 전용 `jose`를 `require()`하다 `ERR_REQUIRE_ESM`로 죽는다. → `authUtils.js`에서 **jose로 ID 토큰 직접 검증**. **절대 firebase-admin/auth로 되돌리지 말 것.** `next.config.mjs`에 `serverExternalPackages: ["firebase-admin"]` 있음.
4. **Vercel 환경변수 누락 주의**: 로컬 `.env.local`엔 있지만 **Vercel에 안 올라간 키가 있었다**(`YOUTUBE_API_KEY`는 사용자가 추가함). 새 기능이 "로컬은 되는데 배포는 안 됨"이면 **Vercel Env 확인** 먼저. (10장 체크리스트)
5. **동적 콘텐츠 번역 = Google Translate**, **AI 장소 설명 = OpenAI**. 둘을 혼동 말 것.
6. **Klook 우측 배너는 코드 문제 아님**(Klook 계정/위젯 설정 문제). 진단용 `public/klook-test.html` 존재(정리 시 삭제 가능).

---

## 1. 한눈에 보는 요약

- **무엇**: 지도(2D Leaflet / 3D Cesium) 위 마커 클릭 → 그 위치의 YouTube 라이브 스트림 재생. 우주(ISS)·지진·오로라·자연재해 오버레이 포함. 다국어(17), SEO 정적 페이지, 광고 배너, 법적 페이지까지 갖춘 실시간 여행 탐색 서비스.
- **핵심 원칙**: 관리자가 유튜브 링크+위치 직접 등록. YouTube **Search API(100유닛) 금지**, `videos.list`(1유닛)만. 재생 불가 시 자동 제외/복원.
- **현재 단계**: 관리 도구 + 손님 메인 화면 + **다국어 + SEO 정적 페이지 + 광고 + 법적 페이지**까지 구현·배포됨. 통계/사용량 대시보드는 부분(축적만) 미완.

---

## 2. 기술 스택 & 실행

| 항목 | 내용 |
|---|---|
| 프레임워크 | **Next.js 16.2.10** (App Router, Turbopack, `/src`) |
| 언어 | JavaScript (**TS 미사용**) |
| DB | Firebase Firestore (Admin SDK v14, 모듈식) |
| 인증 | Firebase Auth. **서버 검증은 jose 직접**(firebase-admin/auth 아님) |
| 지도 2D | Leaflet + react-leaflet + markercluster + OSM 무료 타일 |
| 지도 3D | **CesiumJS 1.143** (prebuilt `/cesium/Cesium.js` script 로드, `window.Cesium`) |
| 위성궤도 | **satellite.js@5.0.0** (v7은 `node:worker_threads`로 빌드 데드락→다운그레이드) |
| 스타일 | **Tailwind v4** (CSS-first `@theme` in globals.css) |
| AI 설명 | OpenAI `gpt-4.1-mini` (`aiUtils.js`) |
| 동적 번역 | **Google Cloud Translation API v2** (도시/장소명/태그) |
| JWT 검증 | **jose@6** (Firebase ID 토큰 직접 검증) |
| 역지오코딩 | OSM Nominatim (무료) |

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 정적 생성(SEO 페이지 포함) 확인 필수
```
- 손님 메인 `/`, 관리자 `/admin`(→미로그인 `/admin/login`), 지도테스트 `/map-test`
- SEO: `/asia`, `/asia/jp`, `/asia/jp/tokyo`, `/marker/[id]`
- 법적: `/terms`, `/privacy`, `/affiliate-disclosure`
- 진단(임시): `/klook-test.html`(Klook 단독 테스트)

---

## 3. 완료 기능

### 3-1. 인프라·관리자 도구 (이전 세션들에서 완료)
- Firebase 클라/어드민, 마커 CRUD, 유튜브/대륙 유틸, health.
- `/admin`: 마커 등록 폼(유튜브 미리보기·중복확인·지도클릭 좌표·역지오코딩 자동입력), 목록 표(캐스케이드 필터·컬럼폭 조절·상태배지·재생확인), AI 설명 편집, 태그.
- 영상 재생상태 자동관리: `report-error`→자동비활성, `check-status` 일괄점검(10분 쿨다운), `verify` 복원.
- 2D/3D 지도 통합(`MapView.js`): Leaflet↔Cesium 토글, 공통 인터페이스(flyToLocation/focusMarker/highlightSelection). ISS 추적(`IssTracker`, `issUtils`), 지진(`EarthquakeLayer`), 오로라(`AuroraLayer`), 자연재해(`NaturalEventsLayer`), 우주(Space) 트리+NASA 라이브(`/api/iss/videos`, `IssVideoPanel`).

### 3-2. 이번 세션(이 채팅) 작업 — **커밋 `b6f9852` ~ `b1c5297`**

**(A) 관리 폼 국가 목록/라벨** `b6f9852`
- `countryList.js` `COUNTRIES`를 **29개 → 162개**(continentUtils 매핑 전체, 한국어명)로 확장 → 대륙 선택 시 그 대륙 모든 국가 표시. 국가 드롭다운 한국어 가나다순 정렬.
- 남/북아메리카 라벨의 🌎 이모지 제거(MarkerForm/MarkerList/MainCategoryTree).

**(B) 다국어 17개 언어** `54188ac`, `a12e54a` — **핵심 아키텍처, 아래 7장 상세**
- 클라이언트 i18n. 상단 배너 우측 언어 드롭다운, 브라우저 언어 기본값+localStorage, ar/fa RTL.
- 정적 UI(messages)·대륙명(continents 사전)·국가명(Intl.DisplayNames)·동적 콘텐츠(도시/장소/태그 = `/api/translate`).
- 명령형(Leaflet/Cesium) 팝업은 locale을 effect deps에 넣어 재그림. 번역 신뢰도(청크/재시도) 개선, 지진 "규모" 라벨 다국어.

**(C) 번역 엔진 전환 OpenAI→Google** `66435ed`
- `/api/translate`의 번역 호출만 **Google Translate v2**로. 청크(20)/재시도/Firestore `translations` 캐시 구조 유지. **AI 장소 설명은 gpt-4.1-mini 그대로.** `api_usage/{YYYY-MM}.translate{characters_used,calls}` 누적.

**(D) 도시 자동완성** `8df99d5`
- `/api/markers/cities`(도시명 집계) + `CityAutocomplete.js`(기존 도시 추천 + 공백/대소문자 유사 경고). 중복 표기 방지.

**(E) 광고** `0dda9bb`,`032e156`,`41cb76f`,`9fdb72a`,`41c6856`,`0a4900d`,`8602c11`,`94af26b`,`a0aecc1`
- `AdSlot.js`(래퍼), 우측 세로 Klook 120×600(`KlookWidget.js`), 하단 가로 CJ 728×90(`CjBanner.js`, `AD_BORDER_CROP_PX`로 테두리 크롭). 배너 개별 "제휴 링크" 라벨은 **최종 제거**(푸터 고지로 대체). CJ 배너는 `target="_blank"`.

**(F) 초기 월드뷰** `f93d494`
- `LeafletMap.js` `initialWorldFit` 프롭: 최초 1회 fitBounds로 전 세계(알래스카~러시아) 가로 꽉 차게. `MapView`가 메인 지도에만 전달.

**(G) 관리자 500/401 → jose 인증** `0ac4ac3`,`bc65f7b`(+진단 `8aed43f`,`2137d0f`,`d83c739`)
- 원인: `firebase-admin/auth`가 ESM `jose`를 require → Vercel `ERR_REQUIRE_ESM`. → `authUtils.js`를 **jose 직접 검증**으로 교체(issuer/audience/RS256/만료, Firebase JWK). `firebaseAdmin.js`에 `adminProjectId` export. `jose` 의존성 추가. `next.config.mjs`에 `serverExternalPackages:["firebase-admin"]`.

**(H) NASA ISS 영상 복구** `e1c26e1`
- 원인: **Vercel에 `YOUTUBE_API_KEY` 없음**(`keyPresent:false`). 코드는 정상. streams 스크래핑 consent 우회 + 알려진 ISS 라이브 ID 폴백 추가. `?debug=1` 진단. (이후 사용자가 키 추가 → `keyPresent:true` 확인)

**(I) 마커 미반영 → 캐시 무효화** `04b8794`
- 등록(POST)·수정/삭제(PATCH/DELETE)에 `revalidateTag("public-markers")` **누락**을 추가. (verify/report-error엔 원래 있었음) → 등록 즉시 손님 화면 반영.

**(J) UX 조정** `b5a89a6`(트리 폭 20%↑),`7b708d0`(ISS 라벨 International→Int'l, 라틴문자만),`d3e4631`(영상 목록 3열 그리드+작은 카드, 펼치면 col-span-full)

**(K) 법적 페이지 + 푸터** `8efc9fa`,`aa434bd`
- `/terms`,`/privacy`,`/affiliate-disclosure`(`LegalPageLayout.js`, 하단 "변호사 미검토" 면책). `Footer.js`(저작권+OSM출처+3링크). **푸터는 layout이 아니라** 메인(`MainMapView`)·법적(`LegalPageLayout`)·SEO(`SeoPageShell`)가 각각 렌더 → **메인에서 스크롤 없이 보이게**(지도 영역 축소). 운영자 이메일 `TripByClip@gmail.com` 반영(보호책임자 이름은 `TripByClip 운영자`).

**(L) SEO 정적 페이지** `b1c5297` — **아래 8장 상세**
- `/[continent]`, `/[continent]/[country]`, `/[continent]/[country]/[city]`, `/marker/[markerId]`. SSG+ISR, JSON-LD(ItemList/TouristAttraction), breadcrumb, 빈상태, generateMetadata. `seoData.js` + `components/seo/*`.

---

## 4. 폴더/파일 구조 (이번 세션 신규 ★)

```
next.config.mjs                     ★ serverExternalPackages:["firebase-admin"]
public/cesium/                      (gitignore, postinstall 복사) / klook-test.html ★
src/app/
├─ page.js  layout.js  globals.css  loading.js  map-test/
├─ admin/  admin/login/
├─ terms/privacy/affiliate-disclosure/page.js        ★ 법적 페이지
├─ [continent]/page.js                               ★ SEO 대륙(dynamicParams=false)
├─ [continent]/[country]/page.js                     ★ SEO 국가
├─ [continent]/[country]/[city]/page.js              ★ SEO 도시
├─ marker/[markerId]/page.js                         ★ SEO 마커 상세
└─ api/
   ├─ markers/route.js  markers/[id]/(route|report-error|verify)
   │  markers/check-(duplicate|status)  markers/cities/route.js ★
   ├─ translate/route.js ★  tags/  geocode/reverse/  health/
   └─ iss/(videos|position|tle)  earthquakes/ aurora-forecast/ natural-events/
src/components/
├─ MarkerForm(+CityAutocomplete★) MarkerList TagSelector AiDescriptionEditor AdminGuard
├─ MapView LeafletMap(+Wrapper) CesiumMapView IssTracker EarthquakeLayer AuroraLayer NaturalEventsLayer
├─ MainMapView MainCategoryTree VideoListPanel IssVideoPanel LiveDot DefaultThumbnail
├─ AdSlot★ KlookWidget★ CjBanner★ Footer★ LegalPageLayout★
├─ i18n/ (LanguageProvider, LanguageSelector, useAutoTranslate) ★
└─ seo/ (SeoPageShell, Breadcrumb, RegionCard, EmptyState, YouTubeEmbed) ★
src/lib/
├─ firebase firebaseAdmin(+adminProjectId★) authUtils(★jose) clientAuth
├─ youtubeUtils continentUtils continentGeo countryList(★162개국) coordUtils
├─ aiUtils getPublicMarkers seoData★ issUtils earthquakeUtils auroraUtils naturalEventsUtils
└─ i18n/ (languages messages continents countryName static) ★
```

---

## 5. Firestore 데이터

- `markers`: lat,lng,location,city,country(ISO대문자),**continent**, tags[], youtube_*(url,video_id,title,description,channel_*,thumbnail_url), is_live,is_active,auto_disabled,disabled_reason(embed_blocked|stream_ended|video_unavailable), last_checked_at, **description{ko,en},description_confirmed**, created_at,updated_at.
  - **현재 약 306개 중 공개(활성)는 약 79개** — 나머지는 auto_disabled/비활성(끝난 라이브 등). 비율이 높아 자동비활성 로직 점검 여지 있음(9장).
  - 레거시 `continent:"americas"` 마커 존재 → 표시 시 국가코드로 north/south america 정규화(`MainMapView`, `seoData.getNormalizedPublicMarkers`).
- `tags`: {id,name}.
- `translations` ★: 동적 번역 캐시. docId=`${target}_sha1(원문)`, {target,source,value,updated_at}. (문자열·언어별 최초 1회만 번역)
- `api_usage/{YYYY-MM}` ★: {translate:{characters_used,calls}} 누적(모니터링용, 대시보드 표시는 미구현).
- `analytics`: 미구현.

---

## 6. 주요 API 라우트 (이번 세션 신규 ★)

| 라우트 | 메서드 | 인증 | 비고 |
|---|---|---|---|
| `/api/markers` | GET/POST | POST관리자 | 등록 시 videos.list 1유닛+AI. **POST/PATCH/DELETE 모두 `revalidateTag("public-markers")`** |
| `/api/markers/[id]` | PATCH/DELETE | 관리자 | |
| `/api/markers/[id]/report-error`,`/verify` | POST | (verify만 관리자) | 자동비활성/복원, revalidateTag |
| `/api/markers/check-(duplicate\|status)` | GET/POST | | 중복확인 / 일괄점검 |
| `/api/markers/cities` ★ | GET | - | 도시명 집계(자동완성용) |
| `/api/translate` ★ | POST | - | Google Translate v2 + Firestore 캐시. 청크20/재시도. `GOOGLE_CLOUD_TRANSLATION_KEY` |
| `/api/tags` | GET/POST | POST관리자 | |
| `/api/geocode/reverse` | GET | 관리자 | Nominatim |
| `/api/iss/videos` | GET | - | NASA 라이브(RSS+streams+폴백ID). `YOUTUBE_API_KEY`. `?debug=1` 진단 |
| `/api/iss/(position\|tle)`,`/api/earthquakes`,`/api/aurora-forecast`,`/api/natural-events` | GET | - | 외부 공공데이터 |
| `/api/health` | GET | - | firebase 연결 확인 |

> SEO 페이지·메인 페이지는 `getPublicMarkers`(tag `public-markers`)를 쓰므로, **마커 변경 시 revalidateTag가 이들 정적 페이지까지 함께 재생성**한다(별도 `/api/revalidate` 불필요).

---

## 7. 다국어(i18n) 아키텍처 — **꼭 숙지**

- **next-intl 아님**(미설치). 전 화면이 클라이언트 렌더라 라우트 `[locale]` 재구성 회피 목적.
- 17개 언어: en ko ja zh es fr de it pt ru hi bn th vi id ar fa. RTL=ar,fa.
- `src/lib/i18n/`: `languages.js`(목록·브라우저감지) `messages.js`(UI 문자열; base + 하단 merge 블록들. **모든 로케일이 en 키를 전부 가져야 함** — 빌드 전 키 완전성 확인) `continents.js`(대륙명) `countryName.js`(Intl.DisplayNames) `static.js`(비-훅 `ts()` — 명령형 팝업용, `<html lang>`에서 현재 언어 읽음).
- `src/components/i18n/`: `LanguageProvider`(useI18n→{locale,setLocale,t,tContinent,countryName,dir}, SSR기본 en→마운트후 보정) `LanguageSelector`(헤더 드롭다운) `useAutoTranslate`(동적 문자열: localStorage `livecam_tr_v2_<locale>` 캐시 + `/api/translate`).
- **함정**: Leaflet/Cesium 명령형 팝업/라벨은 언어 변경 시 자동 리렌더 안 됨 → 해당 레이어가 `useI18n()` 소비 + `locale`을 draw effect deps에. `formatEventLabel(event,t)`.
- 법적/SEO 페이지는 **한국어 정적**(서버 렌더). 다국어 미적용(허용 범위).

---

## 8. SEO 정적 페이지 — 동작·판단

- **경로**: `/[continent]`(7개, `dynamicParams=false`→잘못된 경로 **하드 404**), `/[continent]/[country]`, `/[continent]/[country]/[city]`, `/marker/[markerId]`(뒤 3개는 `dynamicParams=true`→신규 콘텐츠 on-demand).
- `revalidate=86400`이지만 `getPublicMarkers`(5분 캐시) 때문에 **실효 5분 갱신**(더 신선, 읽기는 5분당 1회).
- 국가/도시/마커 params는 **공개 마커에 실제 존재하는 것만** 사전생성(마커 없는 162개국 전부 만들면 얇은 중복 페이지 → AdSense 해로움). 유효하지만 미생성 경로는 on-demand.
- 도시 URL은 슬러그(`citySlug`: 소문자·공백→하이픈, **한글 유지**). 예: `/north_america/us/마이애미`.
- JSON-LD: 목록 `ItemList`, 상세 `TouristAttraction`. 마커 상세는 AI 설명 `description_confirmed:true`만 노출, 비공개/미존재는 `notFound()`.
- **판단(검토 필요)**: ① 국가 사전생성=마커 있는 것만(지침은 continentUtils 전체였음) ② breadcrumb=**상단**(지침은 하단) ③ **`?markerId` 자동 포커스 미구현**(링크는 `/?markerId=`로 연결되나 메인이 이 파라미터를 읽어 마커를 자동으로 열지 않음).

---

## 9. 알려진 이슈 / 미해결 (다음 세션 후보)

1. **Vercel 환경변수**: 로컬엔 있으나 Vercel 누락 이력(`YOUTUBE_API_KEY`는 추가됨). **`GOOGLE_CLOUD_TRANSLATION_KEY`, `AI_API_KEY` 등 서버키가 Vercel Production에 모두 있는지 확인**(없으면 번역/설명 실패). `.env` 통째 import 추천.
2. **Klook 우측 배너**: 클릭 시 "Where did that page go?"→홈. **코드 아님, Klook 계정/위젯 설정 문제**(단독 `/klook-test.html`에서도 재현). 사용자가 Klook 대시보드에서 위젯 재발급(지역/aid 확인) 필요. 새 코드 받으면 `KlookWidget.js` 교체.
3. **`?markerId` 자동 포커스 미구현**: SEO/카드 링크가 `/?markerId=xxx`인데 메인 지도가 아직 안 읽음. `MainMapView`에 useSearchParams+focusMarker 붙이면 완성.
4. **자동비활성 비율 높음**(306중 79 공개). 멀쩡한 영상이 재생불가로 빠지는지 `check-status`/`report-error` 로직 점검 여지.
5. **기존 도시 중복 표기**: `St.Petersburg`/`St. Petersburg`, `Rio de Janeiro`/`RIO DE JANEIRO` 등(자동완성은 향후 중복 방지). 기존 것 정리 필요 시 관리 목록에서 수정.
6. **통계/사용량 대시보드 미구현**: `api_usage.translate`는 축적되나 관리자 표시 없음. `analytics` 미구현.
7. **배포 전 정리**: `// TODO: 배포 전 제거` 콘솔로그 다수. 진단 파일 `public/klook-test.html`.
8. **법적 페이지**: 변호사 미검토 템플릿(하단 명시). 보호책임자 "이름"은 `TripByClip 운영자` placeholder.
9. **광고 개별 라벨 없음**(사용자 지시). 사이트 전체 고지는 푸터 `/affiliate-disclosure`로 유지. 미사용 i18n 키 `sponsoredLabel` 잔존(무해).
10. **미사용 파일**: `location.xlsx`(추적 안 함, 무시). `map-test`, `admin` 페이지엔 푸터 없음(공개용만).

---

## 10. 환경변수 (`.env.local`, 커밋 금지) + **Vercel 반영 필수 체크리스트**

```
# 클라이언트
NEXT_PUBLIC_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/STORAGE_BUCKET/MESSAGING_SENDER_ID/APP_ID
NEXT_PUBLIC_SITE_URL(=https://www.tripbyclip.com)  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
# 서버 전용 (NEXT_PUBLIC 금지)
FIREBASE_SERVICE_ACCOUNT_KEY  ADMIN_EMAIL  REVALIDATE_SECRET
YOUTUBE_API_KEY               # videos.list, NASA 라이브
AI_API_KEY                    # OpenAI(장소 설명)
GOOGLE_CLOUD_TRANSLATION_KEY  # ★동적 번역(도시/장소/태그)
GOOGLE_PLACES_API_KEY  GOOGLE_STATIC_MAPS_API_KEY  (현재 거의 미사용)
```
> **로컬 O, 배포 X 이면 Vercel Settings→Environment Variables 확인.** Firebase 계열은 확인됨(로그인·지도 동작). YOUTUBE 추가됨. **GOOGLE_CLOUD_TRANSLATION_KEY / AI_API_KEY 존재 여부 재확인 권장.**

---

## 11. Git / 배포 규칙 (**현재 자동 게시 중**)

- 작업 브랜치 `develop`, 매 작업 `git push origin develop`.
- **지금은 개발단계**: 사용자 지시로 **매 작업마다 자동으로** `git checkout master && git merge develop && git push origin master` 까지 하고 `develop`로 복귀. (fast-forward 정상, 충돌 시 사용자에게 알림) — "게시 반영 그만/개발단계 종료" 전까지 유지.
- 커밋 프리픽스 `[feat]/[fix]/[style]/[refactor]/[chore]`. 커밋 말미 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 보안: `.env.local`/서비스계정 JSON 커밋 금지, 키값 출력/토큰 로그 금지.

---

## 12. 최근 커밋 이력 (이번 세션, 최신순)

```
b1c5297 SEO 정적 페이지(대륙/국가/도시/마커 상세)
a0aecc1 배너 개별 제휴 라벨 제거(푸터 고지로 대체)
94af26b 하단 CJ 배너 테두리 크롭(CjBanner)
aa434bd 운영자 이메일 반영 + 배너 외곽선 제거 + 푸터 스크롤없이 표시
8efc9fa 법적 페이지(약관/개인정보/제휴고지) + 푸터
04b8794 마커 등록/수정/삭제 시 공개 캐시 즉시 무효화
bc65f7b 관리자 인증 jose 직접 검증(마커 등록 401 해결)   ※d83c739/2137d0f/8aed43f=진단
d3e4631 영상 목록 3열 그리드+작은 카드
7b708d0 ISS 라벨 International→Int'l(라틴문자)
b5a89a6 카테고리 트리 폭 20%↑
e1c26e1 NASA ISS 영상 복구(streams 견고화+폴백ID)  ※YOUTUBE_API_KEY 누락이 근본원인
f93d494 초기 월드뷰(전 세계 가로 꽉)
0ac4ac3 관리자 목록 500 수정(firebase-admin/auth 지연로드+외부화)
0a4900d/41c6856/9fdb72a/41cb76f/032e156/0dda9bb  광고(배치/Klook/CJ/라벨/정렬)
8df99d5 도시 자동완성
66435ed 번역 OpenAI→Google Translate
a12e54a 번역 신뢰도+지진 규모 다국어
54188ac 17개 언어 i18n
b6f9852 국가 목록 162개 확장 + 아메리카 지구본 제거
```
(그 이전 `1a35004`~`2acd019`: ISS 궤적/3D Cesium/우주지도/아메리카 분리 = 이전 세션.) 전체는 `git log --oneline`.

---

## 13. 다음 세션에 유용한 로컬 검증 팁

- `npm run build` 로 SEO **generateStaticParams** 오류·정적생성 개수 확인(현재 168 페이지).
- 배포 후 운영 진단: `/api/iss/videos?debug=1`(keyPresent/live수), `/api/health`(firebase). 잘못된 대륙 `/foobar`→404, `/asia`→200 확인.
- 로컬 프로덕션 재현: `npm run build && npm start`(Vercel 런타임과 유사, 위 jose 문제도 로컬 dev에선 재현 안 되고 build/Vercel에서만 나므로 주의).
- i18n 키 완전성: `messages.js`의 모든 로케일이 en 키를 전부 갖는지 확인 후 빌드.
```
