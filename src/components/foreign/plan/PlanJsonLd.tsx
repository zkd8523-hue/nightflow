// Plan your Memory 구조화 데이터 — SEO 세션 지정(2026-10-01): 7개 모두 Article + BreadcrumbList.
// tours의 ItemList(외부 제휴 상품), getting-around의 FAQPage(리치 결과 대상 아님),
// 드론쇼 Event(반복·날씨 취소로 날짜 고정 불가)는 일부러 넣지 않는다.
const SITE = "https://nightflow.kr";
export const PLAN_DATE_MODIFIED = "2026-10-01T00:00:00+09:00";

export function PlanJsonLd({
  path,
  headline,
  description,
  image,
  crumbs,
}: {
  path: string;
  headline: string;
  description: string;
  image: string;
  crumbs: { name: string; path: string }[];
}) {
  const org = { "@type": "Organization", name: "NightFlow", url: `${SITE}/en` };
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline,
        description,
        image: [image],
        datePublished: PLAN_DATE_MODIFIED,
        dateModified: PLAN_DATE_MODIFIED,
        author: org,
        publisher: { ...org, logo: { "@type": "ImageObject", url: `${SITE}/og-image-v2.png` } },
        mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}${path}` },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
