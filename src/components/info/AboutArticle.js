"use client";

// ─────────────────────────────────────────────────────────────
// AboutArticle — 사이트 소개(About) 본문 (한국어/영어). 현재 언어에 따라 렌더.
//   서비스가 무엇인지·어떻게 동작하는지·무엇을 볼 수 있는지 등 고유 소개 콘텐츠.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import InfoPageLayout from "@/components/InfoPageLayout";
import { useI18n } from "@/components/i18n/LanguageProvider";

const H2 = "mb-2 font-display text-base font-bold text-ink";
const P = "text-sm leading-relaxed text-ink-muted";
const UL = "mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-muted";

export default function AboutArticle() {
  const { locale } = useI18n();
  const isKo = locale === "ko";

  if (isKo) {
    return (
      <InfoPageLayout
        title="TripByClip 소개"
        subtitle="집에서, 지도 위 라이브 웹캠 클립으로 세계를 여행하세요."
      >
        <section>
          <h2 className={H2}>우리가 만드는 것</h2>
          <p className={P}>
            TripByClip은 전 세계의 <strong className="text-ink">실시간 라이브 웹캠</strong>을
            지도 위에서 탐험하는 여행 서비스입니다. 도쿄의 번화한 교차로, 하와이의 파도,
            파리의 거리, 알프스의 설산 — 지금 이 순간 세계 곳곳에서 벌어지는 풍경을,
            비행기표 없이 집에서 클릭 한 번으로 둘러볼 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>어떻게 동작하나요</h2>
          <ul className={UL}>
            <li>
              지도 위의 각 마커는 그 위치에서 방송 중인 <strong className="text-ink">유튜브
              라이브 스트림</strong>과 연결되어 있습니다.
            </li>
            <li>
              마커를 클릭하면 말풍선 안에서 라이브 영상이 바로 재생되고, 같은 도시·국가의
              다른 라이브도 이어서 탐색할 수 있습니다.
            </li>
            <li>
              대륙 → 국가 → 도시 순으로 정리된 목록에서 원하는 지역을 골라 볼 수 있습니다.
            </li>
            <li>
              각 장소에는 그곳이 어떤 곳인지 이해를 돕는 짧은 설명이 함께 제공됩니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>무엇을 볼 수 있나요</h2>
          <p className={P}>
            도시 전경, 해변과 서핑 포인트, 광장과 명소, 항구와 공항, 산과 자연 등 다양한
            장면의 라이브를 제공합니다. 여기에 더해 국제우주정거장(ISS) 실시간 위치, 지진,
            오로라, 자연재해 같은 지구 규모의 레이어도 지도 위에서 함께 살펴볼 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>영상의 출처</h2>
          <p className={P}>
            사이트에 나오는 모든 라이브 영상은 공개적으로 이용 가능한 유튜브 라이브 스트림을
            임베드한 것으로, 카메라와 영상의 모든 권리는 각 채널 운영자에게 있습니다.
            자세한 내용은{" "}
            <Link href="/terms" className="text-brand hover:underline">
              이용약관
            </Link>
            에 정리되어 있습니다.
          </p>
        </section>

        <section>
          <h2 className={H2}>운영</h2>
          <p className={P}>
            TripByClip은 여행과 지도를 좋아하는 개인이 운영하는 독립 프로젝트입니다.
            더 나은 장소와 더 정확한 정보를 위해 꾸준히 마커를 손보고 있습니다. 의견이나
            제보가 있다면 언제든{" "}
            <Link href="/contact" className="text-brand hover:underline">
              문의
            </Link>{" "}
            페이지로 알려주세요.
          </p>
        </section>
      </InfoPageLayout>
    );
  }

  // ─── 영어(기본) ───────────────────────────────────────────
  return (
    <InfoPageLayout
      title="About TripByClip"
      subtitle="Travel the world from home, through live web cam clips on a map."
    >
      <section>
        <h2 className={H2}>What we build</h2>
        <p className={P}>
          TripByClip is a map-based travel service for exploring{" "}
          <strong className="text-ink">live webcams</strong> from all over the world.
          A busy crossing in Tokyo, waves in Hawaii, a Paris street, snow on the Alps —
          you can wander through what is happening around the globe right now, from home,
          with a single click and no plane ticket.
        </p>
      </section>

      <section>
        <h2 className={H2}>How it works</h2>
        <ul className={UL}>
          <li>
            Each marker on the map is linked to a{" "}
            <strong className="text-ink">live YouTube stream</strong> broadcasting from
            that location.
          </li>
          <li>
            Click a marker and the live video plays right inside the popup, with nearby
            streams from the same city or country to explore next.
          </li>
          <li>
            Browse by a tidy list organized continent → country → city to jump straight
            to the region you want.
          </li>
          <li>
            Every place comes with a short description to help you understand what you
            are looking at.
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H2}>What you can watch</h2>
        <p className={P}>
          City skylines, beaches and surf spots, squares and landmarks, harbors and
          airports, mountains and nature — a wide range of live scenes. On top of that,
          planet-scale layers such as the live position of the International Space Station
          (ISS), earthquakes, auroras, and natural disasters can be viewed on the same map.
        </p>
      </section>

      <section>
        <h2 className={H2}>Where the footage comes from</h2>
        <p className={P}>
          All live footage shown on the site consists of publicly available YouTube live
          streams that are embedded here; all rights to the cameras and footage belong to
          their respective channel owners. Details are set out in our{" "}
          <Link href="/terms" className="text-brand hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className={H2}>Who runs it</h2>
        <p className={P}>
          TripByClip is an independent project run by an individual who loves travel and
          maps, and the markers are curated continually for better places and more
          accurate information. If you have feedback or a tip, please reach us any time
          via the{" "}
          <Link href="/contact" className="text-brand hover:underline">
            Contact
          </Link>{" "}
          page.
        </p>
      </section>
    </InfoPageLayout>
  );
}
