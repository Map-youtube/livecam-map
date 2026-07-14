# 세션 인수인계 — Claude 채팅 → Code 탭 이어받기

> 이 문서는 별도 채팅(claude.ai)에서 진행된 논의 내용을 정리한 것입니다.
> 기존 `CLAUDE.md`, `HANDOVER.md`, `AGENTS.md` 를 먼저 참고하고, 그 이후 이 문서의 내용을 이어서 반영해주세요.
> 실제 코드 상태와 이 문서 내용이 다를 수 있으니, 각 항목마다 "실제 코드에 반영되어 있는지 먼저 확인" 후 작업할 것.

---

## 1. 이 세션에서 논의/지시된 기능들 (최근 순)

### 1-1. ISS 실시간 추적
- 위치: WTIA(2초 캐시) 1순위, Open Notify 폴백, 서버 프록시 경유
- 궤적: Celestrak TLE + satellite.js(v5, WASM 이슈로 v7에서 다운그레이드함 — **반드시 v5 유지**, v7로 되돌리면 Turbopack 빌드가 멈추는 버그 재발함)
- 궤적 범위: 과거 없이 "현재 위치 ~ 정확히 공전주기 1바퀴"만 표시하도록 여러 번 수정 지시함 — **실제로 과거 구간이 완전히 제거됐는지 재확인 필요** (2D/3D 렌더링 코드 양쪽 다)
- 2D 궤적 화살표: leaflet-polylinedecorator, 간격 80px→120px→240px로 계속 넓힘 (최종 240px 반영됐는지 확인)
- 3D 궤적 화살표: 특정 각도에서 찌그러지는 문제로 **완전히 제거하기로 결정** (원뿔 등 대안은 시도 안 함). 3D는 선만 있고 화살표 없음이 최종 상태.
- 3D 고도 표현: fromDegreesArrayHeights 등으로 실제 고도(~400km) 반영해 지구 위로 떠 보이는 궤도 표현 완료

### 1-2. 실시간 자연현상 오버레이 (지진/오로라/자연재해)
- 지진: USGS, 5분 캐시, 규모별 색상/반경, 2D(Leaflet circle)+3D(Cesium Ellipse)
- 자연재해: NASA EONET, 15분 캐시, 카테고리별 이모지, "공식 경보 아님" 안내문구 필수
- 오로라: NOAA OVATION, 10분 캐시. **점묘화 방식 → 캔버스 히트맵 이미지 오버레이 방식으로 변경 완료**. 날짜변경선(경도 ±180) 부근 이음매(seam) 버그 수정 지시함 — 캔버스 양 끝을 wrap해서 그리는 방식으로 수정했는지 재확인 필요
- 최근 추가 지시 (반영 여부 미확인, 확인 후 진행):
  - 지진: 원 위에 상시 라벨 "🌍 지진규모 M{X.X}" 표시 (클릭 없이 항상 보이게, 2D+3D)
  - 자연재해: EONET의 magnitudeValue/magnitudeUnit을 활용해 태풍은 "🌀 {태풍이름} · 최대풍속 {값}{단위}", 산불은 "🔥 {이름} · {면적}{단위}" 형태로 상시 라벨 표시
  - 밝은 3D 타일(voyager)로 되돌린 뒤에도 지진 색상이 잘 보이도록 팔레트 조정(진한 주황/빨강 계열 + 테두리선)
- 토글 방식: ISS와 동일하게 켜고 끄는 버튼, 꺼지면 API 호출/interval 전부 정지

### 1-3. 카테고리 Space > ISS (NASA 라이브 영상 목록)
- NASA 유튜브 채널 RSS(무료) → 최신 영상 15개 ID 수집 → videos.list(1유닛)로 실제 라이브 중인 것만 필터링
- 5분 캐시로 방문자 수와 무관하게 하루 최대 288유닛 소모
- ISS 마커 클릭 시 → 카테고리 트리 하이라이트 + 이 영상 목록 패널이 열리도록 지시함 (기존 라이브캠 마커와 동일한 패턴)

### 1-4. 2D(Leaflet)/3D(Cesium) 지도 통합 — 가장 큰 리팩토링
- 별도 `/space-map` 페이지를 없애고, 메인 화면의 지도 영역 자체가 2D↔3D 전환되도록 통합 완료 (커밋 e91a5aa, 이후 3d9122b 등에서 계속 보완)
- 공통 인터페이스(flyToLocation, focusMarker, highlightSelection)로 카테고리 트리/마커클릭/토글이 2D·3D 어느 쪽이든 동일하게 동작하도록 설계
- Cesium은 next/dynamic(ssr:false)로 3D 전환 시에만 로드 (대역폭 절약)
- **미해결/재확인 필요한 이슈들:**
  - 대륙/국가 선택 시 3D 확대가 여전히 부정확했던 문제 → "Bounding Box(경계 사각형) 기반 Cesium Rectangle fitting" 방식으로 재설계 지시함 (continentGeo.js, countryList.js에 west/south/east/north 추가). **실제 반영 및 정상 작동 여부 미확인**
  - 3D에서 마커 클릭 시 2D처럼 자동으로 그 위치로 카메라 이동하는 기능이 빠져있었음 → onMarkerClick에서 flyToLocation도 같이 호출하도록 수정 지시함. **반영 여부 미확인**
  - 3D 타일: dark_matter(어두운 톤) → 밝은 voyager 톤으로 최종 복귀 결정
  - requestRenderMode 최적화(성능) 적용함 — 이후 데이터 변경 시마다 requestRender() 호출 누락 없는지 계속 주의 필요

### 1-5. Leaflet 지도 무한반복(월드랩) 버그
- 원인: 세계지도가 옆으로 끝없이 반복되도록 기본 설정되어 있었음 → 마커 중복 표시 + 무한 스크롤 두 증상의 공통 원인
- 해결: `noWrap: true` + `maxBounds` + `maxBoundsViscosity: 1.0`
- 부작용: maxBounds를 너무 타이트하게 잡으면 대륙 단위 축소(fitBounds)가 막히는 부작용 발견 → 여유폭을 ±180 → ±220 → ±220*1.3(약 ±286)로 계속 넓혀옴. **현재 정확히 어떤 값으로 최종 세팅되어 있는지 코드에서 재확인 필요**

### 1-6. 아메리카 대륙 분리 (북아메리카/남아메리카)
- 이유: 세로로 긴 대륙이라 지도 잘림 문제와 겹쳐 포커싱이 어려웠음
- continentGeo.js, continentUtils.js, MainCategoryTree.js, MarkerForm.js 수정 지시
- ⚠️ **기존 Firestore 마커의 `continent: "americas"` 값을 north_america/south_america로 재분류하는 마이그레이션 스크립트도 함께 지시함 — 실행 여부, 실행 결과(몇 건 변경됐는지) 반드시 확인 필요**

### 1-7. 다국어(i18n)
- 17개 언어 완료, 브라우저 언어 자동감지, RTL 지원
- 도시명/장소명/태그 자동번역: 처음엔 OpenAI, 청크분할+캐시 구조로 안정화
- **이번 세션에서 이 번역 엔진을 OpenAI → Google Cloud Translation API(무료 50만자/월)로 전환 지시함 (완료 여부 확인 필요, GOOGLE_TRANSLATE_API_KEY 환경변수 필요)**
- AI 장소 설명(gpt-4.1-mini)을 무료 Gemini API로 바꾸는 건 **보류 결정** — 현재 상태(gpt-4.1-mini) 유지, 추후 재검토

### 1-8. 법적 페이지 + 광고 표시 정책
- 이용약관(/terms), 개인정보처리방침(/privacy), 제휴 링크 고지(/affiliate-disclosure) 3종 신규 지시함 (변호사 검토 안 거친 일반 템플릿 수준, 페이지 하단에 그 취지 문구 포함)
- 처음엔 배너마다 "제휴링크" 개별 라벨도 지시했으나, **이후 배너 개별 라벨은 제거하고 사이트 전체 고지 페이지만 유지하는 것으로 최종 결정** (경쟁 사이트 관례 참고)
- 관리자 로그인용 이메일과 개인정보처리방침에 공개하는 문의용 이메일은 **의도적으로 다르게 설정** (보안상 정상적인 분리)

### 1-9. 광고 배너 시각적 이슈
- CJ 어필리에이트(부킹닷컴 등) 배너 이미지 자체에 인쇄된 회색 테두리 발견 → CSS border로는 제거 불가 → **컨테이너를 원본보다 작게 만들고 이미지를 음수 margin으로 밀어넣어 테두리 부분을 크롭하는 방식**으로 해결 지시함 (CroppedAdBanner.js 컴포넌트, cropPx 조정 가능하게)

### 1-10. Klook 제휴광고 트러블슈팅 (중요, 미해결)
- 증상: 어떤 위젯(Hotel, Activities 등)을 만들어도 클릭 시 Klook의 "Where did that page go?"(lost page)로 연결됨
- **오해 정리 완료**: 위젯 코드 안의 `<a href="...aid=">`가 비어있는 건 정상(스크립트 실행 전 임시 placeholder일 뿐, 실제 링크는 JS가 iframe으로 교체하며 wid=125414 등 정상 값이 채워짐 — Network 탭으로 확인함)
- **실제 원인 미확정**: 서로 다른 위젯에서 전부 동일 증상 재현 → 특정 상품 링크 문제가 아니라 계정/사이트(AID 125414, tripbyclip.com) 단의 딥링크 생성 기능 활성화 문제로 추정
- **현재 상태**: 사용자가 Klook 고객센터(또는 문의하기)에 짧은 문의를 넣은 상태. **답변 대기 중 — 이 채팅으로 돌아와서 결과를 알려주면 다음 조치 진행 예정. Code 탭에서는 이 건에 대해 코드로 할 수 있는 게 없음 (계정 설정 문제).**

### 1-11. Vercel 배포 / 도메인 연결
- 기존 Vercel 프로젝트(`livecam-map`, GitHub `Map-youtube/livecam-map`)를 그대로 사용하기로 결정
- `tripbyclip.com`, `www.tripbyclip.com` 도메인 연결 완료 확인됨 (Valid Configuration)
- Production Branch를 `master`로 두고 있어서, `develop`에서 작업 후 `master`로 병합해야 실제 도메인에 반영됨 — **이 세션 이후에도 계속 develop→master 병합 필요**
- 요금제(Pro $20/월) 업그레이드 필요성 안내함 — **실제로 업그레이드 완료했는지 확인 필요** (광고 붙이려면 필수)
- 중복/미사용 Vercel 프로젝트(`livecam-map-9xma`) 발견 → 삭제 권장함 (실행 여부 미확인)

### 1-12. SEO / 애드센스 관련
- Google 퍼블리셔 콘솔에서 `tripbyclip.com`에 대해 **"주의 필요 — 게시자 콘텐츠가 없는 화면에 Google 게재 광고, 가치가 별로 없는 콘텐츠"** 경고를 실제로 확인함
- 원인 진단: 대륙/국가/도시별 정적 목록 페이지(`/asia`, `/asia/jp`, `/asia/jp/tokyo`)와 마커 상세 페이지(`/marker/[markerId]`)가 **아직 구현되지 않은 상태**로 확인됨 (CLAUDE.md 7장 계획에는 있으나 미구현 — Claude Code가 직접 확인해준 사실)
- **최우선 작업으로 이 SEO 정적 페이지 4종 구현을 지시함 — 이 문서를 이어받는 시점에 최우선으로 진행할 작업**
  - `/[continent]/page.js`, `/[continent]/[country]/page.js`, `/[continent]/[country]/[city]/page.js`, `/marker/[markerId]/page.js`
  - 각각 On-Demand ISR(24시간 자동 + 마커 등록/수정 시 즉시 재생성) 필요
  - JSON-LD 구조화 데이터(ItemList, TouristAttraction) 포함
  - 신규 마커 등록 시 위 페이지들이 자동 생성/갱신되는지 — 등록 API와 revalidate 연결이 실제로 되어 있는지 반드시 확인
- 함께 지시한 것: `src/app/sitemap.js`, `src/app/robots.js`, GA4 연동(gtag.js, NEXT_PUBLIC_GA_MEASUREMENT_ID), `public/ads.txt` 자리 마련
- **권장 순서**: (1) 정적 페이지 구현 → (2) 사이트맵/robots.txt → (3) 서치콘솔 등록 및 sitemap 제출 → (4) 콘텐츠 쌓이고 크롤링될 시간(1~2주) 확보 → (5) 애드센스 재승인 여부 확인
- 광고 배치 원칙: **지도만 있는 메인 화면에는 광고를 넣지 않고, 텍스트 콘텐츠가 있는 정적 페이지(도시 목록, 마커 상세) 쪽에 배치**하는 방향으로 진행하기로 함 (애드센스 경고와 직결되는 부분이므로 중요)

---

## 2. 지금 시점에 최우선으로 확인/진행해야 할 것 (체크리스트)

1. [ ] SEO 정적 페이지 4종(대륙/국가/도시/마커상세) 구현 — **최우선**
2. [ ] 위 페이지 구현 후 sitemap.js/robots.js 작업 이어서 진행
3. [ ] 대륙/국가 3D 확대(Bounding Box 기반) 정상 작동 여부 재확인
4. [ ] 3D 마커 클릭 시 자동 줌 이동 정상 작동 여부 재확인
5. [ ] ISS 궤적에 과거 구간이 완전히 없는지 재확인
6. [ ] 오로라 히트맵 날짜변경선 이음매 제거 여부 재확인
7. [ ] 아메리카 대륙 분리 마이그레이션 스크립트 실행 여부/결과 확인
8. [ ] Google Cloud Translation API 전환 완료 여부 확인 (GOOGLE_TRANSLATE_API_KEY)
9. [ ] 법적 페이지(이용약관/개인정보/제휴고지) 실제 생성 여부 확인
10. [ ] 지진/자연재해 상시 라벨(규모, 태풍 풍속, 산불 면적) 추가 여부 확인
11. [ ] Vercel Pro 플랜 업그레이드 여부 확인 (사용자에게 직접 질문 필요할 수 있음 — 코드로 확인 불가)
12. [ ] Klook 광고는 사용자의 Klook 문의 답변을 기다리는 중 — 코드 작업 보류

---

## 3. 진행하지 않기로 결정된 것 (재작업 불필요)

- AI 장소 설명을 무료 Gemini API로 바꾸는 것 — **보류**, 현재 gpt-4.1-mini 그대로 유지
- 배너마다 개별 "제휴링크" 라벨 표시 — **제거하기로 결정**, 사이트 전체 고지 페이지만 유지
- Microsoft Translator — 검토했으나 **Google Cloud Translation으로 최종 결정** (이미 결제계좌 있어서)
- Google Maps API 전환 — 월 50만 방문자 기준 약 $2,900~3,900 비용 계산 후 **채택 안 함**, Leaflet+OSM 유지 확정

---

*이 문서는 claude.ai 채팅에서의 논의를 정리한 것이며, 실제 코드베이스가 최종 진실입니다. 위 체크리스트 각 항목은 코드를 직접 확인한 뒤 실제 상태에 맞게 작업을 이어가 주세요.*
