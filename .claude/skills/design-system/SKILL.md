---
name: design-system
description: 이 프로젝트(TripByClip 라이브캠 지도)의 UI/UX를 만들거나 다듬을 때 반드시 따르는 디자인 시스템 — 색·타이포·간격·그림자 토큰, 컴포넌트 패턴, shadcn/ui 사용 규칙. 화면/컴포넌트/스타일 관련 작업이면 항상 먼저 참고.
---

# TripByClip 디자인 시스템

라이브캠 지도 서비스의 화면을 "고급스럽고 절제된(premium & restrained)" 톤으로 일관되게 만들기 위한 기준. **모든 UI 작업(신규/수정)은 이 문서를 따른다.**

Single Source of Truth = `src/app/globals.css` 의 `@theme` 블록 + `src/app/layout.js` 의 폰트. 아래 값과 코드가 다르면 **코드를 신뢰**하고 이 문서를 업데이트한다.

---

## 1. 색상 토큰 (Tailwind v4 `@theme`)

Tailwind 클래스로 바로 쓴다. 예: `bg-surface`, `text-ink`, `border-border`, `text-brand`.

| 토큰 | 값 | 용도 |
|---|---|---|
| `bg` | `#f7f8fa` | 전체 페이지 배경 (부드러운 흰색) |
| `surface` | `#ffffff` | 카드·패널·모달 표면 |
| `ink` | `#12181f` | 본문 텍스트 (진한 슬레이트) |
| `ink-muted` | `#5b6472` | 보조/설명 텍스트 |
| `border` | `#e4e7ec` | 구분선·테두리 |
| `brand` | `#146c6b` | 포인트색(청록/바다색) — CTA·링크·강조 |
| `brand-hover` | `#0f5654` | 브랜드 hover |
| `brand-light` | `#e6f2f1` | 브랜드 연한 배경(선택 강조 등) |
| `live` | `#e1483c` | LIVE 신호색(재생 중·라이브 배지) |
| `live-light` | `#fdecea` | LIVE 연한 배경 |

**색 사용 원칙**
- 화면 대부분은 무채색(bg/surface/ink/border)으로 조용하게. 색(brand/live)은 **행동을 유도하거나 상태를 알릴 때만** 소량.
- `live`(빨강)는 실제 라이브/재생 상태에만. 장식으로 쓰지 않는다.
- 새 색이 필요하면 임의 hex 하드코딩 금지 → 토큰을 추가(globals.css `@theme`)하고 이 표에 반영.

---

## 2. 타이포그래피

폰트는 `next/font` 로 로드되어 CSS 변수로 주입됨. Tailwind 유틸: `font-display`, `font-body`, `font-mono`, `font-kr`.

| 역할 | 폰트 | Tailwind |
|---|---|---|
| 제목/디스플레이 | Space Grotesk → Inter | `font-display` |
| 본문(영문·숫자 우선, 한글 폴백) | Inter → Noto Sans KR | `font-body`(기본) |
| 한국어 우선 | Noto Sans KR | `font-kr` |
| 숫자/코드 | IBM Plex Mono | `font-mono` |

**위계 가이드(권장)**
- 페이지 제목 h1: `font-display text-2xl~3xl font-bold text-ink`
- 섹션 제목 h2: `font-display text-lg~xl font-bold text-ink`
- 본문: `text-sm~base text-ink`
- 보조: `text-xs~sm text-ink-muted`
- 숫자 데이터(개수·좌표·통계): `font-mono tabular-nums`

가독성: 본문 줄간 `leading-relaxed`, 길이 제한이 필요한 설명은 `max-w-prose` / `line-clamp-*`.

---

## 3. 모서리 · 그림자 · 간격

| 토큰 | 값 | 용도 |
|---|---|---|
| `rounded-sm` | 6px | 작은 요소(배지·인풋) |
| `rounded-md` | 10px | 버튼·카드 기본 |
| `rounded-lg` | 16px | 큰 패널·모달 |
| `shadow-card` | 은은한 2단 그림자 | 카드·팝오버 |

- **그림자는 절제**: `shadow-card` 정도. 진하고 넓은 그림자(과한 elevation) 금지.
- 간격은 4px 배수(Tailwind 기본 스케일)로. 촘촘함보다 **넉넉한 여백**이 고급스러움의 핵심 — 카드 내부 `p-4~6`, 섹션 간 `gap-6~10`.
- 테두리는 `border-border` 1px. 필요 이상으로 선을 많이 긋지 않는다(여백으로 구분).

---

## 4. 컴포넌트 패턴 (일관성 규칙)

- **버튼(주요/CTA)**: `bg-brand text-white hover:bg-brand-hover rounded-md px-4 py-2 text-sm font-semibold transition`.
- **버튼(보조)**: `border border-border text-ink hover:bg-gray-100 rounded-md ...`.
- **카드/패널**: `bg-surface border border-border rounded-md shadow-card`.
- **모달**: 오버레이 `fixed inset-0 bg-black/40` + 본체 `bg-surface rounded-lg shadow-card`. 넓은 폼은 2열(입력/지도) 레이아웃, 한 화면에 담기(스크롤 최소화).
- **배지**: 라운드 `rounded-full px-2 py-0.5 text-xs font-semibold`. LIVE=`bg-live-light text-live`, 브랜드=`bg-brand-light text-brand`.
- **툴팁/팝오버**: `bg-surface border border-border rounded-md shadow-card text-xs`, 화살표(꼬리)는 과하지 않게.
- **상태 UI 필수**: 로딩(스켈레톤/스피너)·빈 상태·에러 상태를 항상 구현. 빈 공간 방치 금지.
- **포커스 접근성**: 인터랙티브 요소는 `focus-visible:outline` 또는 `focus:ring`로 키보드 포커스가 보이게. 색만으로 상태를 전달하지 말 것(아이콘/텍스트 병행).

**모션**: `transition`(150~200ms, ease)로 hover/색 변화만 은은하게. 과한 바운스·긴 애니메이션 금지. `prefers-reduced-motion` 존중.

---

## 5. shadcn/ui 사용 규칙

이 프로젝트는 **JavaScript(.js) + Next 16 + React 19 + Tailwind v4 + `src/` 구조**. shadcn 컴포넌트를 우리 토큰에 맞춰 쓴다.

- 컴포넌트 설치는 shadcn MCP(또는 `npx shadcn@latest add <name>`)로. 설치 위치는 `src/components/ui/`.
- **우리 색으로 매핑**: shadcn 기본 변수(`--primary`,`--ring` 등)는 `globals.css` 에서 우리 브랜드값(`--color-brand` 계열)에 매핑한다. shadcn 기본 네이비/검정 그대로 두지 말 것 → 사이트가 청록 브랜드로 통일되게.
- 아이콘은 **lucide-react** 사용(shadcn 표준). 크기 `w-4 h-4`~`w-5 h-5`, 색은 `currentColor`.
- shadcn 컴포넌트도 위 1~4의 토큰·간격·모션 원칙을 그대로 따른다(임의 색/과한 그림자 금지).
- TypeScript 파일 생성 금지 — `.js`/`.jsx` 로. `components.json` 의 `tsx:false` 유지.

---

## 6. 하지 말 것 (금지)

- 토큰 밖 임의 hex 색 하드코딩.
- 과한 그림자·글로우·그라데이션 남발(고급스러움은 절제에서 나온다).
- 화면마다 다른 버튼/카드 스타일(패턴 통일).
- 색만으로 상태 표시(접근성 위반).
- 지도/영상 등 핵심 콘텐츠를 광고·장식이 가리는 배치.
- 모바일(375px~) 깨짐 방치 — 모든 변경은 반응형 확인.

---

## 7. 리디자인 우선순위(현재)

1. 관리자 페이지(등록 폼·마커 목록·채널 관리) — 밀도 높은 화면부터 정돈.
2. 마커 말풍선 정보창 / hover 툴팁.
3. 상단 헤더·네비게이션.
4. 정적 SEO 목록 페이지(대륙/국가/도시/마커/채널).

각 작업 후 브라우저(또는 Playwright MCP)로 **데스크톱+모바일** 스크린샷 확인 → 여백·위계·색 사용을 이 문서 기준으로 점검.
