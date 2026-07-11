"use client";

// ─────────────────────────────────────────────────────────────
// YouTubeEmbed — 마커 상세 페이지 인라인 유튜브 재생 (클라이언트)
//
// 상세 페이지에서는 재생불가 자동신고(report-error) 없이 단순 임베드만 한다.
// (메인 화면 VideoListPanel 은 IFrame Player API 로 에러를 감지하지만, 상세 페이지는
//  가벼운 임베드로 충분하다.)
//
// props: videoId, title
// ─────────────────────────────────────────────────────────────

export default function YouTubeEmbed({ videoId, title }) {
  if (!videoId) return null;

  return (
    <div
      style={{ aspectRatio: "16 / 9" }}
      className="w-full overflow-hidden rounded-lg bg-black"
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title || "YouTube video"}
        className="h-full w-full"
        style={{ border: 0 }}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
