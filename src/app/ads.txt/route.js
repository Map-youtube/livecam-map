// ─────────────────────────────────────────────────────────────
// /ads.txt — 애드센스 승인 심사 및 광고 사기 방지용 표준 파일
//
// - 실제 게시자 ID(ADSENSE_PUBLISHER_ID, 서버 전용 환경변수, 예: "pub-1234567890123456")가
//   설정되기 전까지는 아직 애드센스 승인 전이므로 404를 반환한다.
// - 승인 후 Vercel 환경변수에 ADSENSE_PUBLISHER_ID 를 추가하면 별도 코드 수정 없이
//   자동으로 올바른 ads.txt 내용이 노출된다.
// ─────────────────────────────────────────────────────────────

export async function GET() {
  const publisherId = process.env.ADSENSE_PUBLISHER_ID;

  if (!publisherId) {
    return new Response("ads.txt not configured yet", { status: 404 });
  }

  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
