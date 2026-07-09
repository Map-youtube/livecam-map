# 인수인계 & 진행상황 문서 — 글로벌 라이브캠 지도 서비스

> 최종 업데이트: **2026-07-09**
> 대상 도메인: `tripbyclip.com` · 저장소 브랜치: `develop`(작업) / `master`(게시 반영 시에만 병합)
> 이 문서는 프로젝트 전반의 현재 상태를 새 작업자(또는 다른 채팅방)가 빠르게 파악하도록 정리한 것이다.
> 서비스 컨셉·상세 규칙은 `CLAUDE.md`, Next.js 버전 주의사항은 `AGENTS.md` 를 함께 참고할 것.

---

## 1. 한눈에 보는 요약

- **무엇**: 지도 위 마커를 클릭하면 그 위치의 YouTube 라이브 스트림이 재생되는 실시간 여행 탐색 서비스. (유사: earthcam.com, webcamtaxi.com)
- **핵심 원칙**: 관리자가 유튜브 링크+위치를 직접 등록. YouTube **Search API(100유닛) 절대 미사용**, `videos.list`(1유닛)만 사용. 영상 재생 불가 시 자동 제외, 복원 시 자동 복구.
- **현재 단계**: 관리자 등록/관리 도구 + 손님용 메인 지도 화면까지 동작. **정적 SEO 페이지·다국어·통계 대시보드는 미착수**(아래 8장 참고).

---

## 2. 기술 스택 & 실행 방법

| 항목 | 내용 |
|---|---|
| 프레임워크 | **Next.js 16.2.10** (App Router, Turbopack, `/src` 구조) ※ 지침서엔 14+로 적혀 있으나 실제는 16 |
| 언어 | JavaScript (**TypeScript 미사용**, `.js` 만) |
| DB | Firebase Firestore (Admin SDK v14 = 모듈식 `firebase-admin/app`·`firebase-admin/firestore`) |
| 인증 | Firebase Authentication (관리자 로그인, 서버측 ID 토큰 검증) |
| 지도 | Leaflet + react-leaflet + leaflet.markercluster, **OpenStreetMap 무료 타일** |
| 스타일 | **Tailwind CSS v4** (CSS-first `@theme`, 설정파일 없음 → `src/app/globals.css`) |
| AI | OpenAI `gpt-4.1-mini` (장소 설명 생성) |
| 역지오코딩 | **OSM Nominatim**(무료, 키 불필요) — 좌표→도시/국가/대륙 |
| 호스팅 | Vercel |

**로컬 실행**
```bash
npm install
npm run dev          # http://localhost:3000
```
- 관리자: `/admin` (미로그인 시 `/admin/login` 으로 이동)
- 메인(손님): `/`
- 지도 단독 테스트: `/map-test`

**Claude Code 실행 권장(사용자용)**: `claude --dangerously-skip-permissions` (매번 승인 묻지 않도록)

---

## 3. 지금까지 완료된 기능 (기능별)

### 3-1. 인프라·기반
- Firebase 클라이언트/어드민 초기화 (`src/lib/firebase.js`, `firebaseAdmin.js`)
- 마커 CRUD API, 유튜브/대륙 유틸, health 체크
- Leaflet 지도 컴포넌트 (클러스터링, 라이브 신호점, flyTo, ResizeObserver→invalidateSize)

### 3-2. 관리자 도구 (`/admin`)
- **마커 등록 폼**(`MarkerForm.js`): 유튜브 링크 붙여넣기→video_id 추출·썸네일 미리보기·중복확인, 지도 클릭으로 좌표 지정, 장소명/대륙/국가/도시, 특성 태그, is_live.
- **마커 목록 표**(`MarkerList.js`): 검색 + 대륙/국가/도시/상태 캐스케이드 필터, 수정 모달(작은 지도 포함), 삭제, 상태 배지(🔴LIVE/⏹방송종료/⚫재생불가/⚫비활성), 재생 확인(복원).
- **AI 장소 설명**(`AiDescriptionEditor.js`): 등록 시 ko/en 자동 생성 → 관리자 검토·확정.
- **로그인 보호**(`AdminGuard.js` + Firebase Auth), 서버 API 도 ID 토큰 검증(`authUtils.js`).
- **특성 태그**(`TagSelector.js` + `/api/tags`): 지역분류와 별개 평면 태그, 최대 3개(클라·서버 양쪽 검증). ※ 구 `category` 필드는 태그로 통합·삭제됨.

### 3-3. 영상 재생상태 자동관리
- 손님 화면 iframe 오류 → `/api/markers/[id]/report-error` → 자동 비활성(`auto_disabled`).
- 관리 목록 진입 시 **자동 일괄 점검**: `/api/markers/check-status` 가 `videos.list`(50개/1유닛 배치)로 삭제/비공개(`video_unavailable`)·**라이브 종료(`stream_ended`, oEmbed로는 감지 불가)** 감지.
- **비용 절약 장치**: Firestore 배치 쓰기 + **10분 쿨다운**(localStorage) + 관리자 수동 **"영상 상태 새로고침"** 버튼(누르면 즉시 점검 & 10분 카운트 리셋).
- 관리자 **"재생 확인"**(`/api/markers/[id]/verify`): 정상 시 복원, 단 라이브 종료본은 복원 안 함.

### 3-4. 손님용 메인 화면 (`/` = `MainMapView.js`)
- 좌측 지도(마커 클러스터) + 우측 카테고리 트리(`MainCategoryTree.js`: 대륙→국가→도시, 마커수 표시).
- 마커/트리/카드 상호 연동(선택 시 지도 이동·강조), 영상 목록 패널(`VideoListPanel.js`) 인라인 재생.
- 공개 마커는 `getPublicMarkers.js`(**unstable_cache 5분**, 태그 `public-markers`)로 캐싱, 재생불가/방송종료 방어적 제외. 점검 시 `revalidateTag`로 캐시 무효화.
- 디자인 시스템 적용(색상/타이포/카드/라이브 시그니처) — `globals.css @theme`.

### 3-5. 최근 세션 작업 (관리 페이지 UX 집중 개편)
1. **레이아웃**: 콘텐츠를 화면 **왼쪽 절반**으로, 우측 절반은 향후 통계 영역 예약. 지도 확대(h-560), 태그 전체표시(5열).
2. **장소정보 순서**: 장소명 → 대륙 → 국가 → 도시. **대륙 필드 신설**(선택값을 `continent`로 저장 → 손님 카테고리 트리에 연동). 국가 선택 자동으로 대륙 보정.
3. **대륙 → 국가 추림**: 대륙을 먼저 골라야 국가 드롭다운 활성화, 그 대륙 국가만 표시(국가가 많아 찾기 어려운 문제 해결).
4. **국가 선택 시 지도 자동 포커싱**: `COUNTRY_GEO`(국가별 중심좌표·줌, 현재 29개국) 사용.
5. **지도 클릭 → 도시·국가·대륙 자동입력**: OSM Nominatim 역지오코딩(`/api/geocode/reverse`). 결과는 참고용(수정 가능), 국가는 드롭다운 지원 코드만 자동 선택.
6. **마커 목록**: 가로 스크롤 제거(%기반 `table-fixed`, 전체 컬럼 한눈에), **컬럼폭 마우스 조절 + localStorage 저장/복원**, 세로 스크롤 제거(전체 표시), 장소명 2줄(line-clamp-2).
7. **자동점검 실시간화**: 멈춰있던 안내 제거, "마지막 점검: 시각" 표시 + 인터벌 자동 재점검.

---

## 4. 폴더/파일 구조 (핵심)

```
src/
├─ app/
│  ├─ page.js                      # 손님 메인(지도+트리) → MainMapView
│  ├─ layout.js, globals.css, loading.js
│  ├─ map-test/page.js             # 지도 단독 테스트
│  ├─ admin/page.js                # 관리자 대시보드(등록폼 + 목록)
│  ├─ admin/login/page.js          # 관리자 로그인
│  └─ api/
│     ├─ markers/route.js                  # 마커 목록(GET)/등록(POST)
│     ├─ markers/[id]/route.js             # 단건 수정(PATCH)/삭제(DELETE)
│     ├─ markers/[id]/report-error/route.js# 재생불가 자동보고
│     ├─ markers/[id]/verify/route.js      # 재생 상태 재확인(복원)
│     ├─ markers/check-duplicate/route.js  # 유튜브 영상 중복확인
│     ├─ markers/check-status/route.js     # 일괄 상태점검(videos.list 배치)
│     ├─ tags/route.js                     # 태그 목록/추가
│     ├─ geocode/reverse/route.js          # ★신규: 역지오코딩(Nominatim)
│     └─ health/route.js
├─ components/
│  ├─ MarkerForm.js       # 관리자 등록 폼(지도·역지오코딩·대륙국가 연동)
│  ├─ MarkerList.js       # 관리자 목록 표(+EditModal, 컬럼폭 조절)
│  ├─ TagSelector.js      # 특성 태그 체크박스
│  ├─ AiDescriptionEditor.js
│  ├─ AdminGuard.js       # 로그인 게이트
│  ├─ LeafletMap.js / LeafletMapWrapper.js   # 지도(ssr:false 래핑)
│  ├─ MainMapView.js / MainCategoryTree.js / VideoListPanel.js  # 손님 화면
│  └─ LiveDot.js
└─ lib/
   ├─ firebase.js / firebaseAdmin.js
   ├─ authUtils.js (서버 토큰검증) / clientAuth.js (getAdminIdToken)
   ├─ youtubeUtils.js (video_id 추출, videos.list, 라이브종료 감지)
   ├─ continentUtils.js (국가코드→대륙, 약 150개국)
   ├─ countryList.js (COUNTRIES 29개 + COUNTRY_GEO 좌표/줌)
   ├─ aiUtils.js (gpt-4.1-mini 장소설명)
   └─ getPublicMarkers.js (손님 공개마커 캐싱)
```

---

## 5. Firestore 데이터 구조

### 컬렉션 `markers` (주요 필드)
```
lat, lng, location(장소명), city, country(ISO alpha-2 대문자), continent
tags[](최대 3), youtube_url, youtube_video_id, youtube_title,
youtube_description, youtube_channel_name/_id/_url, youtube_thumbnail_url
is_live, is_active, auto_disabled, disabled_reason(embed_blocked|stream_ended|video_unavailable|null)
last_checked_at, description{ko,en}, description_confirmed, created_at, updated_at
```
- **continent**: 이제 관리자가 직접 선택한 값 우선 저장(없으면 국가로 자동계산). 손님 카테고리 트리가 이 필드를 그대로 사용.
- **disabled_reason**: `stream_ended`(라이브 종료, videos.list로만 감지) / `video_unavailable`(삭제·비공개) / `embed_blocked`.

### 컬렉션 `tags`
- `{ id, name }`. 지역분류와 별개인 장소 특성 태그. 등록 시 선택/추가.

### (지침서 예정) `api_usage`, `analytics`
- CLAUDE.md 4장에 스키마 정의되어 있으나 **아직 미구현**(기록 로직 없음).

---

## 6. API 라우트 요약

| 라우트 | 메서드 | 인증 | 역할 / 비용 |
|---|---|---|---|
| `/api/markers` | GET | - | 마커 목록(필터·`all=true`). Firestore만, 0유닛 |
| `/api/markers` | POST | 관리자 | 등록. `videos.list` 1유닛 + AI 1회 |
| `/api/markers/[id]` | PATCH | 관리자 | 수정. **유튜브 URL 바뀔 때만** 1유닛 |
| `/api/markers/[id]` | DELETE | 관리자 | 삭제 |
| `/api/markers/[id]/report-error` | POST | - | 손님 iframe 오류 자동보고→비활성 |
| `/api/markers/[id]/verify` | POST | 관리자 | 재생 재확인/복원. 1유닛 |
| `/api/markers/check-duplicate` | GET | - | 영상 중복확인(Firestore) |
| `/api/markers/check-status` | POST | 관리자 | 일괄 점검. 50개/1유닛 배치 |
| `/api/tags` | GET/POST | GET-, POST관리자 | 태그 목록/추가 |
| `/api/geocode/reverse` | GET | 관리자 | ★역지오코딩(Nominatim, 무료) |
| `/api/health` | GET | - | 상태 체크 |

> ⚠️ 서버 전용 키(YOUTUBE/AI/PLACES)는 API 라우트에서만 사용. 클라이언트 직접 호출 금지.

---

## 7. 비용 & 외부 API 정책

- **YouTube**: `videos.list` 1유닛(등록·복원·점검 배치). Search API 절대 금지. 일 한도 10,000유닛 대비 매우 여유(활성 246개 점검 ≈ 5유닛).
- **지도**: Leaflet + OSM 무료 = **$0**. 트래픽 급증 시 `NEXT_PUBLIC_MAP_TILE_URL` 만 유료 타일로 교체.
- **Nominatim(역지오코딩)**: 무료. 이용정책상 **초당 1회 이하 + User-Agent 필수**(관리자 수동 클릭이라 준수). 대량 자동호출 금지.
- **AI**: 마커당 약 $0.001~0.003.
- **손님 조회**: 캐시(5분)로 사실상 0 API.

---

## 8. 아직 안 된 것 (Pending / 다음 작업 후보)

> ⭐ = 지침서(CLAUDE.md)에 계획되어 있으나 미착수인 항목

1. ⭐ **정적 SEO 페이지 미구현**: `/[continent]`, `/[continent]/[country]`, `/[continent]/[country]/[city]`, `/marker/[markerId]`. (애드센스·색인 전략의 핵심)
2. ⭐ **On-Demand ISR / `/api/revalidate`**: `REVALIDATE_SECRET` 키만 있고 라우트 없음. 등록/상태변경 시 정적페이지 재생성 로직 필요.
3. ⭐ **다국어(next-intl) 미착수**: 패키지 미설치. 지원예정 12개 언어.
4. ⭐ **통계/사용량 대시보드**: `api_usage`·`analytics` 컬렉션 기록 로직 및 관리자 우측 절반 "측정 지표" 영역(현재 자리만 예약).
5. ⭐ **상단 네비게이션(TopNav) 대륙 드롭다운**, **마커 상세 SEO 페이지 JSON-LD**(TouristAttraction / WebSite).
6. **광고 슬롯**(AdSlot) 및 제휴배너/애드센스 배치.
7. **SNS 공유용 Google Static Maps** 이미지(키만 존재).
8. **배포 전 정리**: `// TODO: 배포 전 제거` 주석 달린 `console.log` 전량 제거.
9. **국가 목록 확장 시** `countryList.js` 의 `COUNTRIES` + `COUNTRY_GEO` 둘 다 갱신해야 지도 자동이동 동작(현재 29개국).

---

## 9. 알려진 이슈 / 주의사항

- **Next.js 16 특이사항**(AGENTS.md): 동적 세그먼트 `params` 는 **비동기**(`await context.params`). `next/dynamic { ssr:false }` 는 **클라이언트 컴포넌트 안에서만** 가능(→ `LeafletMapWrapper` 에 `"use client"`).
- **firebase-admin v14**: `admin.apps` 없음 → 모듈식 `getApps()/initializeApp/cert` 사용.
- **역지오코딩 정확도**: 참고용 자동입력. 나라마다 도시 필드(city/town/village)가 달라 가끔 손보정 필요. 도시명은 영어(`accept-language=en`)로 통일. 한국어 원하면 `ko`로 변경.
- **대륙 수동 지정**: 국가와 continentUtils 매핑이 다를 수 있음(예: 러시아=유럽 분류). 목록 필터/트리는 저장된 `continent` 값을 신뢰.
- **손님 화면 신선도**: 5분 캐시 + 점검 시 `revalidateTag`. 즉시 반영이 필요하면 무효화 경로 확인.
- **컬럼폭/점검시각**은 localStorage(`livecam_marker_col_widths`, `livecam_last_scan_at`)에 저장 → 브라우저/기기별.

---

## 10. 환경변수 (`.env.local`, 절대 커밋 금지 — `.gitignore` 의 `.env*` 로 제외됨)

**설정되어 있는 키**(값은 비공개):
```
# 클라이언트(NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / STORAGE_BUCKET / MESSAGING_SENDER_ID / APP_ID
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY   # 현재 지도는 Leaflet+OSM이라 렌더링엔 불필요

# 서버 전용 (절대 NEXT_PUBLIC 금지, 채팅창 붙여넣기 금지)
YOUTUBE_API_KEY                   # videos.list 전용
AI_API_KEY                        # OpenAI
GOOGLE_PLACES_API_KEY             # (마커 등록 선택적, 현재 미사용)
GOOGLE_STATIC_MAPS_API_KEY        # SNS 공유 이미지용(미사용)
FIREBASE_SERVICE_ACCOUNT_KEY      # Admin SDK
ADMIN_EMAIL                       # 관리자 계정
REVALIDATE_SECRET                 # ISR 재검증(라우트 미구현)
```
> `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` 는 미설정 → OSM 기본값 사용.

---

## 11. Git / 배포 규칙

- 작업 브랜치: **`develop`** (모든 작업 완료 시 `git push origin develop` 필수).
- `master` 병합은 **"게시 반영해줘"** 트리거 시에만.
- 커밋 프리픽스: `[feat]` / `[fix]` / `[style]` / `[refactor]`.
- 보안: `.env.local`·서비스계정 JSON 커밋 금지, 완료 보고에 실제 키값 출력 금지, 비밀번호/토큰 콘솔로그 금지.

---

## 12. 최근 커밋 이력(관리 페이지 개편 구간)

```
aab4e5c 관리 페이지 레이아웃 개편(왼쪽 절반, 태그 전체표시, 컬럼폭 조절)
4c06f0c 폼/목록 개편(지도확대, 장소정보 한줄, 태그 5열, 가로스크롤 제거, 자동점검 실시간화)
1ab6f8f 대륙 선택 추가 + 목록 세로스크롤 제거·컬럼폭 기억·영상상태 수동 새로고침
00731d9 대륙→국가 추림 + 섹션 순서 변경 + 국가 선택 시 지도 자동 포커싱
3b56382 지도 클릭 시 도시·국가·대륙 자동입력(OSM Nominatim 역지오코딩)
```

전체 이력은 `git log --oneline` 참고.
