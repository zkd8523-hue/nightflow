import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "Seoul Club Booking FAQ — Korea Nightlife Questions Answered (For Foreigners)",
  },
  description:
    "Frequently asked questions about Seoul club booking for foreign travelers. Korean prices, VIP tables, dress codes, broker problems — answered in English.",
  keywords: [
    "Seoul club FAQ",
    "Korea nightlife questions",
    "Seoul club booking FAQ",
    "Gangnam club FAQ",
    "Hongdae club questions",
    "Korea club guide",
    "foreigner Seoul nightlife",
    // "Korean" 형용사 패턴
    "Korean club FAQ",
    "Korean nightlife guide",
    "Korean club questions",
    "Korean bar guide",
    "K-pop club FAQ",
    "Korean VIP table",
  ],
  alternates: {
    canonical: "https://nightflow.kr/en/faq",
  },
  openGraph: {
    title: "Seoul Club Booking FAQ — Korea Nightlife Questions Answered",
    description:
      "Real answers about Seoul club booking, prices, dress codes, and how foreigners actually book VIP tables.",
    url: "https://nightflow.kr/en/faq",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const FAQS = [
  {
    q: "Do I need to speak Korean to book a Seoul club?",
    a: "No. NightFlow lets foreign travelers book Seoul clubs entirely in English. You plant a flag with your date, group size, and budget, and Seoul clubs send you private VIP offers — no Korean required, no broker.",
  },
  {
    q: "How much does a Seoul club night cost for foreigners?",
    a: "Casual entry is ₩20,000–30,000 per person. Main VIP tables in Gangnam start at ₩750,000 (₩150–300K per person split among 4–6). Apgujeong premium lounges start at ₩2,000,000. Through NightFlow you pay the same prices Koreans pay — no tourist tax.",
  },
  {
    q: "Which Seoul district is best for foreigners?",
    a: "Itaewon is the most foreigner-friendly with English-speaking staff and an international crowd. Hongdae is best for K-pop and hip-hop fans, walk-in friendly. Gangnam is for luxury VIP table experiences. Apgujeong is for high-end lounges with champagne service.",
  },
  {
    q: "How early should I book a Seoul club?",
    a: "Best 3–7 days before your night. Acceptable 24 hours before. Last resort same day — still works but fewer offers. Friday/Saturday peak nights have the most action and require earlier booking.",
  },
  {
    q: "Is there a booking fee or deposit?",
    a: "No booking fee, no deposit. Planting a flag on NightFlow is free. Receiving offers is free. You only pay the club directly when you accept an offer and arrive — at Korean prices, no broker markup.",
  },
  {
    q: "Can I book a VIP table without Korean MD connections?",
    a: "Yes. Traditional Seoul club booking required Korean MD (promoter) contacts via Instagram or KakaoTalk. NightFlow inverts this — clubs and their MDs send you offers based on your flag. You pick the best one. No connections, no language barrier.",
  },
  {
    q: "What's the dress code for Seoul clubs?",
    a: "Gangnam: smart casual minimum — no flip flops, shorts, or ripped jeans. Hongdae: anything goes including streetwear. Itaewon: international smart casual standard. Always bring your physical passport (Korean law requires ID for club entry).",
  },
  {
    q: "Do Seoul clubs accept foreigners?",
    a: "Most do. Hongdae and Itaewon clubs welcome foreigners — many actively cater to international visitors. Some Gangnam clubs have strict door policies based on appearance and Korean fluency, but pre-booked VIP table guests are essentially never turned away.",
  },
  {
    q: "Can I book a club for a group of 6 or more?",
    a: "Yes. Group sizes of 4–6 are ideal for VIP tables (best cost split per person). Above 6 you may need to book multiple tables side by side. NightFlow lets you specify group size when you plant a flag, and clubs match accordingly.",
  },
  {
    q: "What if I want to skip the line without a VIP table?",
    a: "Many clubs offer guest list (게스트) options — free or discounted entry in exchange for early arrival. NightFlow's 'Guest Sign' feature shows which Seoul clubs are running guest list deals each week. Updates every Monday at 6 PM KST.",
  },
  {
    q: "Are there clubs for specific music genres in Seoul?",
    a: "Yes. Hip-hop: Club Dokkaebi (Hongdae), Club Arzu (Cheongdam), DM Seoul (Apgujeong). EDM: Club ACE (Gangnam), Core Lounge (Apgujeong), Bermuda (Hongdae). House/Techno: Soap Seoul (Itaewon), Faust (Itaewon), Vurt (Itaewon). K-pop: NB2 (Hongdae).",
  },
  {
    q: "Can I share a table with strangers to lower the cost?",
    a: "Yes — this is called 'Share' (조각) on NightFlow. MDs sell individual seats at premium tables, so you pay 1/N of the bottle price instead of booking the whole table. Great for solo travelers or pairs who want VIP access without group cost.",
  },
];

export default function EnFaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/en" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://nightflow.kr/en/faq" },
    ],
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        {/* Header */}
        <header className="space-y-4 text-center">
          <Link href="/en" className="text-[12px] text-neutral-500 hover:text-white">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            Seoul Club Booking FAQ
          </h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Real answers about Seoul nightlife, written for foreign travelers. Prices, dress codes, VIP tables, broker problems — everything you wish someone told you before your first Seoul club night.
          </p>
        </header>

        {/* FAQ list */}
        <section className="space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl bg-[#1C1C1E] border border-neutral-800 overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                <span className="font-bold text-[15px] text-neutral-100 leading-snug">
                  {f.q}
                </span>
                <span className="text-neutral-500 transition-transform group-open:rotate-180 shrink-0">
                  ▾
                </span>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-[13px] text-neutral-400 leading-relaxed">{f.a}</p>
              </div>
            </details>
          ))}
        </section>

        {/* CTA */}
        <section className="space-y-3 pt-4 text-center">
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors"
          >
            🚩 Plant your flag — get VIP offers
          </Link>
          <p className="text-[12px] text-neutral-600">
            19+ only · Bring your passport · No booking fee
          </p>
        </section>
      </div>
    </div>
  );
}
