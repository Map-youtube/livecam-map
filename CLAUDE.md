# 프로젝트 지침 — 글로벌 라이브캠 지도 서비스 (v1)

---

## 작업 시작 방법 (사용자 참고용)

- 사용자는 코딩을 모르므로, 매번 승인(yes/no)을 묻지 않도록 터미널에서 Claude Code를 아래 명령으로 실행할 것을 권장함:
  ```
  claude --dangerously-skip-permissions
  ```
- 이 안내는 Claude Code 자신의 동작 규칙이 아니라, 사용자가 Claude Code를 실행할 때 참고하는 메모이므로 다른 섹션 내용에는 영향 없음.

---

## 0. 서비스 컨셉 및 핵심 철학

이 서비스는 **지도 위에 관리자가 직접 등록한 마커를 클릭하면 해당 위치의 YouTube 라이브 스트림 영상이 말풍선 정보창 형태로 재생되는 실시간 여행 탐색 서비스**다.

유사 사이트: webcamtaxi.com, skylinewebcams.com, earthcam.com

**차별점:**
- 기존 사이트들이 자체 카메라 또는 제한된 소스를 사용하는 반면, 이 서비스는 YouTube 라이브 스트림 전체를 소스로 활용해 더 풍부한 콘텐츠를 제공한다
- 지도 중심 UI로 자연스러운 탐색 유도 (earthcam.com의 낮은 이탈률 전략 반영)
- AI가 작성한 장소 설명으로 SEO 및 애드센스 승인 대응
- 대륙/국가/도시별 정적 목록 페이지로 크롤러 색인 최적화

**운영 원칙:**
- 관리자가 YouTube 링크와 마커 위치를 직접 등록한다
- 영상 재생 불가 시 자동으로 목록에서 제외되고, 관리자가 수정 후 정상 재생 확인 시 자동으로 복원된다
- YouTube API 자동 검색(Search, 100유닛)은 사용하지 않는다

---

## 1. 개발자 역할 및 기술 스택

- HTML, JavaScript, Visual Studio Code 전문가로서 코드를 작성한다
- Next.js(App Router), Firebase, Leaflet에 능숙한 풀스택 웹 개발 전문가로서 코드를 작성한다
- 웹페이지 디자인은 사용자 편의성에 중점을 두고, 깔끔하고 직관적인 디자인을 추구한다
- 모든 코드는 Visual Studio Code 환경 기준으로 작성하며, 복사-붙여넣기 즉시 실행 가능한 완성 코드를 제공한다

**기술 스택:**
- 프레임워크: Next.js 14+ (App Router, `/src/app` 구조)
- 언어: JavaScript (TypeScript 사용 안 함, .js 확장자 유지)
- 데이터베이스: Firebase Firestore (Firebase v9 모듈식 SDK)
- 지도 렌더링: Leaflet + react-leaflet (지도 렌더링), OpenStreetMap 무료 타일 사용 — 지도 라이브러리·타일 모두 무료이며, 향후 트래픽 증가 시 유료 타일(MapTiler 등)로 타일 URL만 교체하면 되는 구조
- 호스팅: Vercel
- 스타일링: Tailwind CSS
- 상태관리: React useState / useEffect
- 다국어: next-intl (지원 언어는 섹션 8 참고)
- AI 장소 설명 생성: OpenAI `gpt-4.1-mini`
- 프로젝트 경로: `C:\Users\jeonghoon.lee\Desktop\Project\livecam-map` (신규 프로젝트)
- 도메인: `tripbyclip.com` (기존 도메인 재사용)

---

## 2. 코드 작성 원칙

### 기본 원칙
- 코드를 수정하거나 추가할 때, 관련된 다른 파일도 함께 수정이 필요하면 반드시 먼저 알려준다
- **파일 하나를 작성할 때는 전체 코드를 빠짐없이 작성한다. 중간에 `// 기존 코드 유지` 또는 `// ... 생략` 같은 표현을 절대 쓰지 않는다**
- 코드에는 한국어 주석을 충분히 작성하여 로직을 이해하기 쉽게 한다
- 모든 API 호출에는 try-catch 에러 처리를 반드시 포함한다
- 콘솔 로그는 개발 디버깅용으로 남기되, 배포 전 제거할 수 있도록 `// TODO: 배포 전 제거` 주석을 단다
- **git push는 매 작업 완료 시 필수**: 모든 Claude Code 지시문의 마지막 단계는 반드시 `git push origin develop`

### 채팅방 운영 원칙
- **파일별/기능별로 채팅방을 구분해서 사용한다**
- 1개 채팅방에서 모든 코딩을 완성하지 않는다
- 다른 파일에서 작업해야 할 사항이 있으면 이동해야 할 채팅방과 해당 채팅방에 가져가야 할 지침을 안내한다

### Claude Code 운영 원칙
- 중간에 확인 질문 없이 자율 결정 후 완료 보고
- 이미 읽은 파일은 같은 세션에서 다시 읽지 않는다 (토큰 낭비 방지)

### 파일 경로 규칙

```
src/app/page.js                              ← 메인 화면 (지도 + 카테고리 트리)
src/app/admin/page.js                        ← 관리자 대시보드
src/app/admin/login/page.js                  ← 관리자 로그인
src/app/[continent]/page.js                  ← 대륙별 정적 목록 페이지
src/app/[continent]/[country]/page.js        ← 국가별 정적 목록 페이지
src/app/[continent]/[country]/[city]/page.js ← 도시별 정적 목록 페이지
src/app/marker/[markerId]/page.js            ← 마커 상세 SEO 페이지
src/components/[ComponentName].js            ← 공통 컴포넌트
src/app/api/[기능명]/route.js                ← API 라우트
src/lib/firebase.js                          ← Firebase 클라이언트 초기화
src/lib/firebaseAdmin.js                     ← Firebase Admin 초기화 (서버 전용)
src/lib/utils.js                             ← 유틸리티 함수
```

### 환경변수 네이밍 규칙

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=     ← 클라이언트 (현재 Leaflet+OSM 사용으로 지도 렌더링에는 불필요, 향후 유료 타일 전환 시 NEXT_PUBLIC_MAP_TILE_URL 등으로 대체 예정)
NEXT_PUBLIC_MAP_TILE_URL=            ← 클라이언트 (Leaflet 타일 URL, 기본값 OSM: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png — 향후 유료 타일로 교체용)
NEXT_PUBLIC_MAP_ATTRIBUTION=         ← 클라이언트 (지도 저작권 표기 문구, 기본값: © OpenStreetMap contributors)
YOUTUBE_API_KEY=                     ← 서버 전용 (videos.list, 절대 NEXT_PUBLIC 금지)
AI_API_KEY=                          ← 서버 전용 (OpenAI)
GOOGLE_PLACES_API_KEY=               ← 서버 전용 (마커 등록 시 선택적)
GOOGLE_STATIC_MAPS_API_KEY=          ← 서버 전용 (SNS 공유용 정적 지도 이미지 전용 — 지도 렌더링과 무관하게 계속 필요)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_KEY=        ← 서버 전용 (절대 채팅창에 붙여넣기 금지)
ADMIN_EMAIL=                         ← 관리자 계정 (서버 전용)
REVALIDATE_SECRET=                   ← ISR 재검증 시크릿
NEXT_PUBLIC_SITE_URL=                ← 정규 도메인 (https://www.tripbyclip.com)
NEXT_PUBLIC_GA_MEASUREMENT_ID=       ← 클라이언트 (GA4 측정 ID, 미설정 시 GA 스크립트 자체를 로드하지 않음)
ADSENSE_PUBLISHER_ID=                ← 서버 전용 (예: pub-1234567890123456, /ads.txt 생성용. 미설정 시 /ads.txt 404)
NEXT_PUBLIC_SHOW_AFFILIATE=          ← 클라이언트 ("true" 일 때만 제휴 광고(Klook/CJ 부킹닷컴) 렌더링. 미설정/false 면 광고 마크업이 HTML 에서 완전 제외 — 애드센스 심사용. 승인 후 true 로 설정+재배포하면 복원)
```

---

## 코드 검증 및 버그 예방 규칙

실제로 겪은 버그(마커를 클릭하면 그 마커가 아니라 항상 첫 번째 마커 위치로만 지도가 이동한 문제 — 반복문 안에서 각 항목의 고유 좌표가 아니라 고정값을 참조한 것이 원인)를 계기로, 같은 유형의 실수를 예방하기 위해 아래 규칙을 반드시 지킨다.

1. **반복 렌더링 시 개별 항목의 고유 데이터를 참조한다.**
   배열을 `map`/`forEach`로 반복하며 UI 요소(마커, 목록 항목, 버튼 등)를 만들 때는, 각 요소의 이벤트·이동·선택 로직이 반드시 **그 개별 항목의 고유 데이터(id, 좌표 등)**를 참조하도록 한다. 반복문 밖의 고정값이나 첫 번째 항목의 값을 실수로 참조하지 않는다. (각 반복은 자신만의 클로저를 갖도록 하고, 필요한 고유 값은 핸들러에 인자로 명시적으로 넘긴다.)

2. **상호작용 기능은 "각 항목이 자기 데이터로 동작하는지" 스스로 재점검하고 그 결과를 보고한다.**
   클릭·이동·선택 같은 상호작용을 구현하면, 완료 보고 시 각 항목이 자기 자신의 데이터로 정확히 동작하는지 코드 흐름을 되짚어 확인한 결과를 함께 보고한다. (예: 마커 A 클릭 → A 좌표로 이동, 마커 B 클릭 → B 좌표로 이동이 코드상 보장되는지)

3. **화면을 직접 볼 수 없으면 "잘 될 것으로 판단됨"으로 끝내지 말고, 눈으로 확인할 체크리스트를 제시한다.**
   브라우저 화면을 직접 확인할 수 없는 상황에서는 막연히 "정상 동작할 것으로 보임"이라고 마무리하지 않는다. 대신 사용자가 눈으로 확인해야 할 구체적 체크리스트(무엇을 클릭하면 무엇이 나와야 하는지)를 명시한다.

4. **`useEffect` 등 상태 기반 로직은 의존성 배열을 정확히 지정한다.**
   상태 변경에 따라 동작하는 로직(`useEffect` 등)은 의존성 배열을 정확히 지정하여 의도치 않은 재실행이나 미실행이 없도록 한다. 특히 객체·배열을 의존성에 넣을 때는 렌더링마다 참조가 새로 생성되어 매 렌더마다 재실행되지 않는지 확인하고, 필요하면 값 비교나 메모이제이션으로 방어한다.

---

## 3. 화면 레이아웃 및 영상 표시 방식

### 3-1. 메인 화면 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│  헤더 (로고 + 상단 네비게이션 메뉴)                        │
│  Asia | Europe | Americas | Africa | Oceania | MiddleEast│
├──────────────────────────────┬──────────────────────────┤
│                              │  📁 Asia (42)            │
│                              │    📁 Japan (12)         │
│         지도 영역             │      📁 Tokyo (8)        │
│         (왼쪽, 약 70%)        │        🔴 시부야 교차로   │
│                              │        🔴 신주쿠 야경     │
│                              │      📁 Osaka (4)        │
│                              │    📁 Thailand (8)       │
│                              │  📁 Europe (35)          │
│                              │  (오른쪽, 약 30%)         │
└──────────────────────────────┴──────────────────────────┘
```

- **지도(왼쪽 70%)**: Leaflet 지도, 등록된 마커들이 표시됨
- **카테고리 트리(오른쪽 30%)**: 대륙 → 국가 → 도시 → 마커 목록, 펼치기/접기 가능
- **상단 헤더**: 로고 + 대륙별 정적 페이지로 연결되는 네비게이션 메뉴 (webcamtaxi.com 방식)
- **모바일**: 카테고리 트리가 하단 드로어(drawer) 방식으로 전환

### 3-2. 영상 표시 방식 — 2가지 진입 경로 (동일한 결과)

**경로 A: 카테고리 트리에서 마커 선택**

```
사용자가 오른쪽 카테고리 트리에서 장소명 클릭
→ 지도가 해당 위치로 부드럽게 이동 (flyTo / setView)
→ 해당 마커가 자동 선택 (선택 상태로 강조 표시)
→ 마커 위에 말풍선 정보창(InfoWindow) 자동 표시
→ 정보창 안에 영상 제목 + 설명 + YouTube 라이브 영상 재생
→ 영상 아래 관련 영상 썸네일 목록 표시
```

**경로 B: 지도에서 마커 직접 클릭**

```
사용자가 지도 위 마커 직접 클릭
→ 마커 위에 말풍선 정보창(InfoWindow) 표시
→ 경로 A와 동일한 정보창 내용 표시
→ 오른쪽 카테고리 트리에서 해당 항목이 자동으로 하이라이트됨
```

### 3-3. 말풍선 정보창 내부 구조

```
┌─────────────────────────────────────┐
│ 📍 장소명                    [닫기 ×] │
│ 도시, 국가 · 카테고리 배지           │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │   YouTube 라이브 iframe 영상     │ │
│ │   (16:9 비율)                   │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ 영상 제목                            │
│ 영상 설명 (첫 2줄, 더보기 접기)       │
├─────────────────────────────────────┤
│ 관련 영상 (같은 도시/국가의 다른 마커) │
│ [썸네일][제목] [썸네일][제목]          │
│ [썸네일][제목] [썸네일][제목]          │
└─────────────────────────────────────┘
```

**관련 영상 선정 기준:**
1. 같은 도시의 다른 마커 (최대 4개)
2. 부족하면 같은 국가의 다른 마커로 채움
3. 모두 is_active: true인 마커만 표시
4. 현재 선택된 마커는 제외

### 3-4. 상단 네비게이션 메뉴 (정적 페이지 연결)

헤더에 대륙별 드롭다운 메뉴 배치. webcamtaxi.com의 상단 메뉴와 동일한 방식.

```
[Asia ▼]  [Europe ▼]  [Americas ▼]  [Africa ▼]  [Oceania ▼]  [Middle East ▼]

Asia 클릭 시 드롭다운:
  Japan     Thailand    South Korea
  China     Indonesia   Vietnam ...

Japan 클릭 → /asia/jp 정적 페이지로 이동
```

### 3-5. 정적 목록 페이지 → 메인 지도 연계

- 목록 페이지 마커 클릭 → `/?markerId=xxxxx` 로 이동
- 메인 페이지가 `markerId` 파라미터 감지 → 해당 마커 위치로 지도 이동 + 정보창 자동 오픈
- 카테고리 트리에서도 해당 항목 자동 하이라이트

---

## 4. Firestore DB 구조

### 컬렉션: `markers` (관리자가 직접 등록/수정/삭제)

```javascript
{
  // ─── 식별자 ──────────────────────────────────────────
  marker_id: "자동 생성 ID",

  // ─── 위치 정보 (관리자 입력) ──────────────────────────
  lat: 35.6595,
  lng: 139.7004,
  location: "도쿄 시부야 교차로",   // 장소명
  city: "Tokyo",
  country: "JP",                   // ISO 3166-1 alpha-2
  continent: "asia",               // asia | europe | americas | africa | oceania | middleeast

  // ─── 분류 ─────────────────────────────────────────────
  // (구) category 필드는 장소 특성 태그(tags)로 통합되어 삭제됨. 더 이상 사용하지 않음.
  tags: ["해변", "서핑"],          // 장소 특성 태그 (지역 분류와 별개, 최대 3개)

  // ─── YouTube 정보 (관리자 입력 + 자동 수집) ───────────
  youtube_url: "https://www.youtube.com/watch?v=xxxxx",
  youtube_video_id: "xxxxx",       // URL에서 자동 추출
  youtube_title: "...",            // videos.list로 자동 수집 (1유닛)
  youtube_description: "...",      // videos.list로 자동 수집 (첫 500자)
  youtube_channel_name: "...",     // videos.list로 자동 수집
  youtube_thumbnail_url: "...",    // 썸네일 URL (관련 영상 목록 표시용)

  // ─── 라이브 상태 (자동 감지 + 관리자 수동 관리) ────────
  is_live: true,                   // 현재 실시간 재생 가능 여부
  is_active: true,                 // 지도/목록 표시 여부
  auto_disabled: false,            // true = 재생 불가로 자동 비활성화된 상태
  last_checked_at: Timestamp,      // 마지막 재생 상태 확인 시각
  disabled_reason: null,           // "embed_blocked" | "stream_ended" | "video_deleted" | null

  // ─── AI 생성 설명 (관리자 검토 후 확정) ─────────────────
  description: {
    ko: "도쿄 시부야 교차로는...",
    en: "Shibuya Crossing is...",
  },
  description_confirmed: false,    // 관리자 확정 여부

  // ─── 메타 ──────────────────────────────────────────────
  created_at: Timestamp,
  updated_at: Timestamp,
}
```

### 재생 불가 자동 감지 및 복원 흐름

```
클라이언트 YouTube iframe onError 이벤트 감지
  → /api/markers/[id]/report-error 호출
  → auto_disabled: true, is_active: false, disabled_reason 저장
  → 지도/목록/정적 페이지에서 자동 제외
  → ISR 재생성으로 정적 페이지에도 즉시 반영

관리자가 URL 교체 후 "재생 확인" 버튼 클릭
  → videos.list 재확인 (1유닛)
  → 정상이면 auto_disabled: false, is_active: true 복원
  → ISR 재생성으로 정적 페이지에도 즉시 반영
```

### 컬렉션: `api_usage`

```javascript
{
  date: "2026-07-06",
  youtube: {
    videos_list_calls: 12,
    units_used: 12,
    units_limit: 10000,
  },
  ai: {
    calls: 15,
    tokens_used: 45000,
    estimated_cost_usd: 0.045,
  },
  maps: {
    map_loads: 320,
    static_maps_calls: 5,
  },
  total_estimated_cost_usd: 2.29,
}
```

### 컬렉션: `analytics`

```javascript
{
  date: "2026-07-06",
  daily_visitors: 120,
  total_visitors: 3450,
  total_marker_clicks: 890,
  auto_disabled_count: 3,
}
```

---

## 5. API 사용 원칙 및 비용 구조

### YouTube API — 핵심 원칙

```
신규 마커 등록 시:
  관리자가 YouTube 링크 직접 입력
  → videos.list 1회 호출 (1유닛)
  → Firestore에 영구 저장
  → 이후 사용자 조회 시 API 호출 0유닛

재생 복원 확인 시:
  관리자가 "재생 확인" 버튼 클릭
  → videos.list 1회 호출 (1유닛)

YouTube Search API (100유닛/회) 절대 사용하지 않는다.
```

| 항목 | 비용 |
|---|---|
| 마커 등록 1회 (videos.list) | 1유닛 |
| 재생 복원 확인 1회 | 1유닛 |
| 이후 사용자 조회 | 영구 0유닛 |
| YouTube Search API | **사용 안 함** |

### 지도 렌더링 (Leaflet + OpenStreetMap)

- Leaflet + OpenStreetMap 무료 타일 사용으로 **지도 렌더링 비용 $0** (단, 대량 트래픽 시 유료 타일 서비스로 전환 권장 — MapTiler 등으로 타일 URL만 교체)
- 지도 타입 전환 (위성/일반): Leaflet의 레이어 전환(TileLayer 교체)으로 지원 가능, 추가 비용 없음

### Google Static Maps API (SNS 공유 이미지 전용)

| SKU | 무료 한도/월 | 단가 |
|---|---|---|
| Static Maps (SNS 공유) | 10,000건 | $2.00/1,000건 |

### AI (OpenAI gpt-4.1-mini)

- 마커 등록 시 장소 설명 1회 생성
- 마커 1개당 약 $0.001~0.003

---

## 6. 관리자 페이지 기능

### 6-1. 마커 등록 (단일 등록 폼)

관리자 페이지에는 **등록 섹션 1개**만 존재한다. 입력 후 "등록" 버튼을 누르면 자동으로 대륙/국가/도시 카테고리로 분류된다.

**등록 폼 입력 항목:**

| 필드 | 입력 방식 | 설명 |
|---|---|---|
| YouTube URL | 직접 입력 | 붙여넣기 즉시 video_id 자동 추출 + 썸네일 미리보기 |
| 장소명 | 직접 입력 | |
| 위도/경도 | 직접 입력 또는 지도 핀 클릭 | |
| 도시 | 직접 입력 | |
| 국가 | 드롭다운 | ISO 코드 자동 매핑 |
| 대륙 | 국가 선택 시 자동 입력 | 수동 수정 가능 |
| 장소 특성 태그 | 체크박스 (최대 3개) | 기존 태그 목록에서 선택하거나 새 태그 추가 (구 '카테고리' 필드는 이 태그로 통합되어 삭제됨) |
| is_live | 토글 | 기본값: true |

**등록 시 자동 처리:**
1. YouTube URL → video_id 자동 추출
2. videos.list → 제목·설명·채널명·썸네일 자동 수집 (1유닛)
3. gpt-4.1-mini → AI 장소 설명 자동 생성 (ko, en)
4. 관리자가 설명 미리보기 → 수정 → 확정 저장
5. 해당 대륙/국가/도시 정적 페이지 ISR 재생성

### 6-2. 마커 목록 — 대륙/국가/도시 트리 구조

```
📁 아시아 (42개)
  📁 일본 (12개)
    📁 도쿄 (8개)
      [썸네일] 시부야 교차로 | 🔴 LIVE | 채널명 | 최종확인 7/6 | ✏️ 🗑️
      [썸네일] 신주쿠 야경   | 🔴 LIVE | 채널명 | 최종확인 7/5 | ✏️ 🗑️
      [썸네일] 도쿄타워 뷰   | ⚫ 재생불가 | 자동비활성화 | [재생확인] ✏️ 🗑️
```

**목록 표시 항목:**
- YouTube 썸네일
- 장소명
- 재생 현황 배지: `🔴 LIVE` / `⚫ 재생불가` / `⚪ 비활성`
- 채널명
- 마지막 확인 시각
- 비활성 이유 (해당 시)
- 수정 / 삭제 / 재생확인 버튼

### 6-3. 재생불가 마커 알림

- 관리자 대시보드 상단: `⚠️ 재생 불가 마커 3개 — 확인 필요`
- 클릭 시 해당 마커만 필터링

### 6-4. API 사용량 대시보드

- YouTube units / AI 호출 / Maps 로드 / 예상 비용
- 일별 한도 대비 현황 시각화

### 6-5. 방문자 통계

- 일별/누적 방문자, 마커 클릭 수, 자동 비활성화 건수

---

## 7. 페이지 구조 및 SEO 전략

```
/                                      ← 메인 지도 + 카테고리 트리
/asia                                  ← 아시아 전체 마커 목록
/asia/jp                               ← 일본 마커 목록
/asia/jp/tokyo                         ← 도쿄 마커 목록
/europe                                ← 유럽 전체 마커 목록
/europe/fr                             ← 프랑스 마커 목록
/americas                              ← 아메리카 목록
/africa                                ← 아프리카 목록
/oceania                               ← 오세아니아 목록
/middleeast                            ← 중동 목록
/marker/[markerId]                     ← 마커 상세 SEO 페이지
```

**정적 페이지 재생성:**
- 신규 마커 등록 시 On-Demand ISR로 해당 대륙/국가/도시 페이지 즉시 재생성
- 마커 자동 비활성화/복원 시 해당 페이지 ISR 재생성
- 24시간마다 ISR 자동 갱신 (`revalidate = 86400`)

**JSON-LD 구조화 데이터:**
- 마커 상세 페이지: `TouristAttraction`
- 루트 페이지: `WebSite` + `SoftwareApplication`

---

## 8. 다국어(i18n) 처리

- 라이브러리: `next-intl`
- 지원 언어: en(기본), ko, ja, zh, th, hi, ar, fr, es, pt, de, id (12개)
- AI 설명은 ko, en 2개 언어 우선 생성

---

## 9. 디자인 원칙 및 이탈률 최소화 전략

### earthcam.com 분석에서 도출한 핵심 원칙

**이탈률을 낮추는 구조 (earthcam.com 참고):**
- **지도 UI가 핵심**: 마커를 보다가 주변 마커가 눈에 보여 자연스러운 탐색 유도
- 말풍선 정보창 안에서 관련 영상 썸네일이 보여 추가 탐색 유도
- 카테고리 트리에서도 연속적인 탐색이 가능하여 체류시간 증가
- 처음 등록할 마커는 Times Square, 시부야, 에펠탑 등 전 세계 유명 장소 위주
- 계절별 특집 섹션으로 재방문 유도

**skylinewebcams.com과 차별화:**
- 이탈률이 높은 이유: 단일 목적 방문 구조, 광고가 콘텐츠 흐름 방해
- 형의 사이트는 지도 UI로 연속 탐색이 자연스럽게 유도됨

### 일반 디자인 원칙

- 사용자 편의성 최우선: 클릭 최소화
- 모바일 반응형 필수 (375px ~ 1440px)
- 색상: `#1A73E8` (구글 블루) 포인트 컬러
- 폰트: 한국어 `Noto Sans KR`, 영문 `Inter`
- 로딩/에러/빈 상태 UI 항상 구현
- 광고 슬롯에 "광고" 라벨 필수 표기

---

## 10. 광고 전략

### 기존 tripbyclip.com 제휴 광고 (도메인 동일 → 재승인 불필요)

- Klook 직접 제휴 배너 (468×60 PC / 300×250 모바일)
- Kiwi.com 항공권 검색
- Coupang Partners (한국 IP 전용)
- Travelpayouts (Agoda, Booking.com 등)

### 애드센스

- 대륙/국가/도시 정적 목록 페이지 + AI 작성 장소 설명으로 승인 가능성 높음
- 기존 거절 사유 모두 해소됨 (메인=지도만, 자동생성 콘텐츠 문제)
- 광고 슬롯 위치: 목록 페이지 상단, 마커 목록 중간, 마커 상세 페이지

---

## 11. 보안 규칙

- YouTube/AI/Places API 키는 서버(API Route)에서만 호출. 클라이언트 직접 호출 금지
- Firestore Security Rules: 일반 사용자는 읽기만, 쓰기는 관리자만
- 관리자 페이지(`/admin`)는 Firebase Authentication으로 보호
- `.env.local`은 절대 Git에 커밋하지 않는다
- **서비스 계정 JSON, 비밀키는 절대 채팅창에 붙여넣기 금지**
- API 키 하드코딩 금지

---

## 12. Git 브랜치 전략

- 모든 작업은 `develop` 브랜치에서 진행
- `master` 브랜치 병합은 "게시 반영해줘" 트리거 시에만
- 커밋 메시지: `[feat]` / `[fix]` / `[style]` / `[refactor]`
- `.gitignore` 필수: `.env.local`, `node_modules/`, `.next/`, `firebase-service-account.json`

---

## 13. 주요 컴포넌트 목록

| 파일 경로 | 역할 |
|---|---|
| `src/app/page.js` | 메인 화면 (지도 + 카테고리 트리) |
| `src/app/admin/page.js` | 관리자 대시보드 |
| `src/app/admin/login/page.js` | 관리자 로그인 |
| `src/app/[continent]/page.js` | 대륙별 정적 목록 |
| `src/app/[continent]/[country]/page.js` | 국가별 정적 목록 |
| `src/app/[continent]/[country]/[city]/page.js` | 도시별 정적 목록 |
| `src/app/marker/[markerId]/page.js` | 마커 상세 SEO 페이지 |
| `src/components/LeafletMap.js` | Leaflet 지도 (마커 표시, 클릭 이벤트, flyTo) |
| `src/components/MarkerInfoWindow.js` | 마커 말풍선 정보창 (영상 + 관련 영상 썸네일) |
| `src/components/RelatedVideos.js` | 관련 영상 썸네일 목록 (같은 도시/국가) |
| `src/components/CategoryTree.js` | 오른쪽 카테고리 트리 (대륙/국가/도시/마커) |
| `src/components/TopNav.js` | 상단 대륙별 드롭다운 네비게이션 메뉴 |
| `src/components/MarkerForm.js` | 마커 등록/수정 폼 (관리자) |
| `src/components/MarkerTree.js` | 관리자용 대륙/국가/도시 트리 목록 |
| `src/components/LiveStatusBadge.js` | 재생 현황 배지 |
| `src/components/AiDescriptionEditor.js` | AI 설명 미리보기·수정·확정 (관리자) |
| `src/components/AutoDisabledAlert.js` | 재생불가 마커 알림 배너 (관리자) |
| `src/components/Header.js` | 공통 헤더 |
| `src/components/AdSlot.js` | 광고 슬롯 |
| `src/app/api/markers/route.js` | 마커 CRUD API |
| `src/app/api/markers/[id]/route.js` | 마커 단건 수정/삭제 |
| `src/app/api/markers/[id]/report-error/route.js` | 재생 불가 자동 보고 |
| `src/app/api/markers/[id]/verify/route.js` | 재생 상태 재확인 (복원용) |
| `src/app/api/markers/related/route.js` | 관련 영상 목록 조회 (같은 도시/국가) |
| `src/app/api/youtube-info/route.js` | videos.list 호출 (1유닛) |
| `src/app/api/ai-description/route.js` | AI 장소 설명 생성 |
| `src/app/api/revalidate/route.js` | ISR 재검증 트리거 |
| `src/app/api/analytics/route.js` | 방문자 통계 기록 |
| `src/lib/firebase.js` | Firebase 클라이언트 초기화 |
| `src/lib/firebaseAdmin.js` | Firebase Admin 초기화 |
| `src/lib/youtubeUtils.js` | video_id 추출, videos.list 호출, 썸네일 URL |
| `src/lib/continentUtils.js` | 국가코드 → 대륙 자동 매핑 |
| `src/lib/usageCounter.js` | API 사용량 카운팅 |

---

## 14. 에러 처리

- **재생 불가 자동 감지**: YouTube iframe `onError` → `report-error` API → `auto_disabled: true` 저장 → 지도/목록/정적 페이지에서 즉시 제외 → ISR 재생성
- **관리자 복원**: 수정 후 "재생 확인" → `verify` API → 정상이면 `is_active: true` 복원 → ISR 재생성
- **임베드 차단 영상**: `disabled_reason: "embed_blocked"` 저장, 관리자 페이지 안내
- **관련 영상 없음**: 관련 영상 섹션 자체를 렌더링하지 않음 (빈 공간 금지)
- API 호출 실패: try-catch 후 사용자에게 안내

---

## 15. 주의사항 및 금지 사항

- YouTube Search API (100유닛/호출) **절대 사용 금지** — videos.list(1유닛)만 사용
- 관리자가 직접 등록하지 않은 마커는 지도에 표시하지 않는다
- `console.log` 배포 전 전량 제거 (`// TODO: 배포 전 제거` 주석 사용)
- API 키 하드코딩 금지, 환경변수만 사용
- TypeScript 사용 안 함 (.js 파일만)
- 서비스 계정 JSON 채팅창 붙여넣기 절대 금지
- **채팅방별 작업 범위 준수**: 1개 채팅방에서 여러 파일을 동시에 작업하지 않는다

---

## 16. 각 답변 마지막줄 모델 표시 규칙

- 단순 반복 작업 (컴포넌트 하나 작성, 간단한 수정) → **Claude Sonnet**
- 복잡한 로직 (API 라우트, AI 연동, 보안, 캐싱, 재생 감지처럼 실수하면 비용이 발생하거나 데이터가 깨지는 부분) → **Claude Opus**

※ 실제 설치 버전: Next.js 16 (App Router, Turbopack), src 폴더 구조 사용
@AGENTS.md
