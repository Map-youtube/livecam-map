// ─────────────────────────────────────────────────────────────
// CjBanner — 하단 CJ 제휴 배너(728×90) 렌더링
//
// 원본 배너 이미지에 얇은 회색 테두리가 있어, overflow:hidden 컨테이너 +
// <a> 음수 margin 으로 사방을 AD_BORDER_CROP_PX 만큼 잘라 테두리를 감춘다.
//   - 바깥 div: (원본 - 크롭×2) 크기 + overflow:hidden
//   - 안쪽 a : margin -크롭px (이미지를 사방으로 밀어 넣어 넘치는 테두리를 잘라냄)
//
// ★ 조정: 테두리가 두꺼우면 AD_BORDER_CROP_PX 를 3~4 로, 너무 많이 잘리면 1 로.
//   크롭을 끄려면(원본 그대로) 0 으로 설정하면 된다.
//
// ⚠️ target 은 형 요청("새 탭 열기")에 따라 _blank 유지(+ rel sponsored noopener).
// ⚠️ 외부 광고 이미지라 next/image 대신 <img> 사용.
// ─────────────────────────────────────────────────────────────

// 배너 테두리 크롭 량(px) — 실제 배너를 보고 조정
const AD_BORDER_CROP_PX = 2;

// 원본 배너 크기(px)
const AD_WIDTH = 728;
const AD_HEIGHT = 90;

// CJ 제휴 링크/이미지 주소
const AD_HREF = "https://www.anrdoezrs.net/click-101809732-17272970";
const AD_IMG = "https://www.ftjcfx.com/image-101809732-17272970";

export default function CjBanner() {
  const crop = AD_BORDER_CROP_PX;

  return (
    <div
      style={{
        width: `${AD_WIDTH - crop * 2}px`,
        height: `${AD_HEIGHT - crop * 2}px`,
        overflow: "hidden",
      }}
    >
      <a
        href={AD_HREF}
        target="_blank"
        rel="sponsored noopener"
        style={{ display: "block", margin: `-${crop}px` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={AD_IMG}
          width={AD_WIDTH}
          height={AD_HEIGHT}
          alt=""
          style={{ display: "block", border: "none" }}
        />
      </a>
    </div>
  );
}
