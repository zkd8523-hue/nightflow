import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute:
      "首爾夜店預訂 FAQ — 韓國夜生活常見問題 (台港遊客)",
  },
  description:
    "首爾夜店預訂常見問題，專為台港遊客整理。韓國價格、VIP 包廂、著裝要求、中介陷阱 — 繁體中文解答。",
  keywords: [
    "首爾夜店 FAQ",
    "韓國夜生活問答",
    "首爾夜店預訂 FAQ",
    "江南夜店 FAQ",
    "弘大夜店問答",
    "韓國夜店指南",
    "外國人首爾夜生活",
    "韓國夜店中介",
    "首爾包廂價格",
    "韓國VIP包廂",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/faq",
    languages: {
        "ko-KR": "https://nightflow.kr/faq",
        "en-US": "https://nightflow.kr/en/faq",
        "zh-CN": "https://nightflow.kr/zh/faq",
        "zh-TW": "https://nightflow.kr/zh-tw/faq",
        "zh-Hant": "https://nightflow.kr/zh-tw/faq",
        "zh-HK": "https://nightflow.kr/zh-tw/faq",
        "ja-JP": "https://nightflow.kr/ja/faq",
        "x-default": "https://nightflow.kr/faq",
    },
  },
  openGraph: {
    title: "首爾夜店預訂 FAQ — 韓國夜生活常見問題",
    description: "韓國夜店真實價格、著裝要求、外國人如何預訂 VIP 包廂。",
    url: "https://nightflow.kr/zh-tw/faq",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

const FAQS = [
  {
    q: "我不會韓語,能預訂首爾夜店嗎?",
    a: "可以。NightFlow 讓外國遊客全程用繁體中文/英文預訂首爾夜店。您選好想去的夜店(或者只告訴我們預算和喜好),我們會直接聯絡夜店為您鎖定座位 — 無需韓語,無中介。",
  },
  {
    q: "外國人在首爾夜店一晚要花多少錢?",
    a: "普通入場每人 ₩20,000–30,000。江南主桌 VIP 包廂起價 ₩750,000(4–6 人均攤每人 ₩150–300K)。狎鷗亭高端包廂起價 ₩2,000,000。透過 NightFlow 預訂,您支付的是韓國本地價 — 無遊客加價。",
  },
  {
    q: "首爾哪個區最適合外國人?",
    a: "梨泰院最外國人友善,員工會說英語,國際化人群。弘大最適合 K-POP 和嘻哈粉絲,walk-in 友善。江南適合奢華 VIP 體驗。狎鷗亭適合高端香檳包廂。",
  },
  {
    q: "應該提前多久預訂首爾夜店?",
    a: "最佳:出行前 3–7 天。可接受:24 小時前。最後底線:當天 — 我們仍會嘗試,但可預訂的夜店會較少。週五/週六是高峰之夜,最先約滿。",
  },
  {
    q: "需要押金或預訂費嗎?",
    a: "無預訂費,無押金。在 NightFlow 提交請求免費。您只在到場後直接付款給夜店 — 韓國本地價,無中介加價。",
  },
  {
    q: "沒有韓國 MD 關係也能預訂 VIP 包廂嗎?",
    a: "可以。傳統首爾夜店預訂需要韓國 MD(推廣員)聯絡人。NightFlow 幫您解決這一切 — 我們直接聯絡夜店,為您鎖定預算內最好的桌位。無需關係,無語言障礙。",
  },
  {
    q: "首爾夜店的著裝要求是什麼?",
    a: "江南:smart casual 起步 — 不可穿夾腳拖、短褲、破洞牛仔褲。弘大:隨意,街頭風可以。梨泰院:國際化 smart casual。務必攜帶實體護照(韓國法律要求 ID 入場)。",
  },
  {
    q: "首爾夜店接受外國人嗎?",
    a: "大多數接受。弘大和梨泰院夜店歡迎外國人 — 許多場所積極接待國際遊客。部分江南夜店根據外貌和韓語能力有嚴格門控,但預訂 VIP 包廂的客人幾乎不會被拒。",
  },
  {
    q: "6 人以上的團體可以預訂嗎?",
    a: "可以。4–6 人最適合 VIP 包廂(人均成本最優)。6 人以上可能需要預訂相鄰多桌。NightFlow 讓您在提交請求時指定團體人數,我們會相應為您匹配。",
  },
  {
    q: "不訂 VIP 包廂,能跳過排隊嗎?",
    a: "許多夜店提供 guest list(게스트)選項 — 提前到場可享免費或折扣入場。NightFlow 的'Guest Sign'功能展示每週韓國夜店的 guest list 優惠。每週一晚 18:00 KST 更新。",
  },
  {
    q: "首爾有哪些音樂風格的夜店?",
    a: "嘻哈:Club Dokkaebi (弘大)、Club Arzu (清潭)、DM Seoul (狎鷗亭)。EDM:Club ACE (江南)、Core Lounge (狎鷗亭)、Bermuda (弘大)。House/Techno:Soap Seoul (梨泰院)、Faust (梨泰院)、Vurt (梨泰院)。K-POP:NB2 (弘大)。",
  },
  {
    q: "可以與陌生人拼桌降低成本嗎?",
    a: "可以 — NightFlow 上稱為'Share'(파티)。MD 出售高級桌的單個座位,您只需支付桌價的 1/N。單人遊客或情侶想要 VIP 體驗但又不想全包時非常合適。",
  },
];

export default function ZhTwFaqPage() {
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
      { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/zh-tw" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://nightflow.kr/zh-tw/faq" },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/zh-tw" className="text-[12px] text-muted-foreground hover:text-foreground">
            ← NightFlow
          </Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">
            首爾夜店預訂 FAQ
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            關於首爾夜生活的真實解答,專為台港遊客整理。價格、著裝、VIP 包廂、中介問題 — 您第一次在首爾玩之前應該知道的一切。
          </p>
        </header>

        <section className="space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl bg-card border border-border overflow-hidden"
            >
              <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                <span className="font-bold text-[15px] text-foreground leading-snug">
                  {f.q}
                </span>
                <span className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0">
                  ▾
                </span>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-[13px] text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            </details>
          ))}
        </section>

        <section className="space-y-3 pt-4 text-center">
          <Link
            href="/flags/new?lang=zh-tw"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors"
          >
            🍾 透過 NightFlow 預訂
          </Link>
          <p className="text-[12px] text-muted-foreground">
            19+ · 攜帶護照 · 無預訂費
          </p>
        </section>
      </div>
    </div>
  );
}
