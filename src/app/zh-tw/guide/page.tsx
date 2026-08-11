import type { Metadata } from "next";
import Link from "next/link";
import { krwToAll, getKrwRates } from "@/lib/utils/currency";

export const metadata: Metadata = {
  title: {
    absolute:
      "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
  },
  description:
    "無需韓語預訂首爾頂級夜店。江南、弘大、梨泰院、狎鷗亭最佳 VIP 包廂。公平價格,跳過排隊和中介。台港遊客韓國夜生活指南。",
  keywords: [
    "韓國夜店預訂指南",
    "韓國夜生活指南",
    "韓國VIP包廂",
    "韓國夜店指南",
    "首爾夜店預訂指南",
    "首爾VIP包廂預訂",
    "首爾派對預訂",
    "首爾夜店指南",
    "弘大夜店預訂",
    "弘大VIP包廂",
    "弘大夜店指南",
    "江南夜店預訂",
    "江南VIP包廂",
    "江南夜店指南",
    "梨泰院夜店預訂",
    "梨泰院夜生活指南",
    "狎鷗亭包廂預訂",
    "清潭包廂",
  ],
  alternates: {
    canonical: "https://nightflow.kr/zh-tw/guide",
    languages: {
        "en-US": "https://nightflow.kr/en/guide",
        "zh-CN": "https://nightflow.kr/zh/guide",
        "zh-TW": "https://nightflow.kr/zh-tw/guide",
        "zh-Hant": "https://nightflow.kr/zh-tw/guide",
        "zh-HK": "https://nightflow.kr/zh-tw/guide",
        "ja-JP": "https://nightflow.kr/ja/guide",
        "x-default": "https://nightflow.kr/en/guide",
    },
  },
  openGraph: {
    title: "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
    description: "無需韓語預訂首爾頂級夜店。真實價格,無中介。",
    url: "https://nightflow.kr/zh-tw/guide",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function ZhTwGuidePage() {
  // 환율은 15일 주기 갱신 (실패 시 폴백) — currency.ts 참고
  const { rates: fxRates } = await getKrwRates();
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP",
    description:
      "無需韓語預訂首爾最熱夜店。江南、弘大、梨泰院、狎鷗亭最佳 VIP 包廂。公平價格,跳過排隊和中介。",
    image: ["https://nightflow.kr/og-image.png"],
    datePublished: "2026-01-01T00:00:00+09:00",
    dateModified: new Date().toISOString().split("T")[0] + "T00:00:00+09:00",
    author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/zh-tw" },
    publisher: {
      "@type": "Organization",
      name: "NightFlow",
      logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/zh-tw/guide" },
    inLanguage: "zh-TW",
    about: [
      { "@type": "Thing", name: "首爾夜生活" },
      { "@type": "Thing", name: "韓國夜店預訂" },
      { "@type": "Thing", name: "江南VIP包廂" },
      { "@type": "Thing", name: "弘大夜店" },
      { "@type": "Thing", name: "梨泰院夜生活" },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韓國夜店預訂指南 — 在江南、弘大、梨泰院做 VIP (首爾)</h1>
        <p>
          在尋找真正適合台港遊客的首爾夜店預訂方式?NightFlow 是專為外國遊客打造的韓國夜店預訂平台 — 江南 VIP 包廂預訂、弘大夜店預訂、梨泰院國際化夜生活。真實價格,無中介,無需韓語。像本地人一樣預訂首爾夜店。
        </p>
        <h2>透過 NightFlow 預訂韓國夜店的流程</h2>
        <p>
          選好想去的夜店(或者只告訴我們您的預算和喜好) — 加上日期、人數、預算。NightFlow 會直接聯絡夜店,為您鎖定預算內最好的桌位,通常數小時內就有回覆。到場後直接付款給夜店。零預訂費,無中介加價,無押金。
        </p>
        <h2>為什麼在這裡預訂韓國夜店而不是 walk-in</h2>
        <p>
          在首爾 walk-in 預訂意味著遊客價格和最差座位。NightFlow 以在地價格為您代訂 — 我們直接聯絡夜店,無中介加價。真正的本地人這樣預訂,現在您也可以。
        </p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <Link href="/zh-tw" className="text-2xl font-black tracking-tight text-foreground">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            在首爾最佳夜店
            <br />
            做 VIP
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            韓國夜店預訂輕鬆簡單。無關係,無韓語,無中介。NightFlow 讓您在江南、弘大、梨泰院夜店獲得最佳座位 — 公平、透明的價格。從第一晚就像本地人一樣預訂。
          </p>
        </header>
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">受夠了遊客待遇?</h2>
          <div className="space-y-4">
            {[
              { icon: "🤷", title: "不知道哪家夜店好", body: "您不了解本地圈子。評論全是韓語。最後被拉客的人帶去隨便哪家。" },
              { icon: "💸", title: "遊客價格", body: "Walk-in 還是中介,您都不知道是否被宰。無法比較,無法砍價。" },
              { icon: "🧍", title: "在外排隊", body: "無關係,無包廂,無 guest list。您在冷風中等待,本地人卻直接進入。" },
            ].map((p) => (
              <div key={p.title} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{p.icon}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-foreground">{p.title}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/zh-tw/clubs" className="block text-center text-[13px] text-blue-400 underline">
            瀏覽首爾夜店真實價格 →
          </Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-muted-foreground uppercase text-center">
            首爾夜店預訂流程
          </h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "選擇您的夜店", body: "選好想去的夜店(或者只告訴我們您的喜好) — 日期、預算、人數。" },
              { n: "2", title: "我們直接為您預訂", body: "NightFlow 直接聯絡夜店,為您鎖定預算內最好的桌位 — 真實價格,無中介加價。" },
              { n: "3", title: "像 VIP 一樣入場", body: "最佳包廂已預訂,無排隊,無中介。在 Instagram 聯絡夜店,到門口出示護照 (19+)。" },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 w-9 h-9 rounded-full bg-inverse text-inverse-foreground font-black flex items-center justify-center">{s.n}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 信任 — VIP、公平價格 */}
        <section className="space-y-4 text-center">
          <h2 className="text-2xl font-black tracking-tight">
            VIP 夜店預訂,公平價格
          </h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            我們會親自代您聯絡夜店,為您鎖定預算內最好的桌位。價格透明公開,直接付款給夜店,無預訂費,無中介抽成。就是最好的座位,本地人的預訂方式。
          </p>
        </section>

        {/* 預算等級 — 真實價格 + 引導預算感 */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black tracking-tight">
              想體驗完整 VIP 之夜?
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              和朋友們一起,花費 ₩500,000 以上,留下這趟旅程最美好的回憶。以下是首爾夜店真實的消費行情 — 不用再猜了。
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: "🎟️", label: "先進場再說", price: "₩20,000–30,000 / 人", krwAmount: 25000, desc: "入場費 + 第一杯飲料。輕鬆享受一晚舞池時光。" },
              { icon: "👑", label: "完整 VIP 體驗", price: "₩500,000 起", krwAmount: 500000, desc: "頂級桌位、瓶裝服務、專屬人員全程照顧 — 讓您難忘的一夜。" },
            ].map((t) => (
              <div key={t.label} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{t.icon}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-[15px] text-foreground">{t.label}</p>
                    <p className="font-black text-[14px] text-brand-amber whitespace-nowrap">{t.price}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">≈ {krwToAll(t.krwAmount, fxRates)}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            設定您的預算 — 我們會為您找到最合適的桌位。帶的人越多,這一夜就越 VIP。
          </p>
          <Link
            href="/flags/new?lang=zh-tw"
            className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors"
          >
            透過 NightFlow 預訂
          </Link>
        </section>

        {/* 安全提示 — 可展開(原生 details,無需 JS) */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black tracking-tight text-center">
            出發前必看
          </h2>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            首爾夜生活很精彩 — 但遊客確實有被騙的案例。以下教您如何保護自己。
          </p>
          <div className="space-y-3">
            {[
              {
                q: "🚩 常見詐騙手法",
                items: [
                  "「免費入場」陷阱 — 先誘騙入場,之後不付高額飲料費或最低消費就不讓離開。",
                  "隱藏價格 — 沒有正式菜單,外國人被收取遠高於實際價格的桌位費和飲料費。",
                  "盜刷卡片 — 趁客人喝醉,拿走信用卡在未經同意下重複刷卡。",
                  "假冒中介 — 私訊聲稱可「代訂」,實際收取遠高於實際價格的費用後私吞差額。",
                ],
              },
              {
                q: "🛡️ 如何保護自己",
                items: [
                  "不要跟隨弘大或梨泰院街頭派發「免費入場」卡片的拉客人員。",
                  "務必確認有印刷版的價目表,每筆消費先付款。",
                  "檢查收據,並在手機上開啟即時刷卡通知。",
                  "只透過官方管道預訂 — 夜店官方帳號,絕不透過未經驗證的中介。",
                ],
              },
              {
                q: "📞 遇到問題時",
                items: [
                  "報警 — 112。如遇立即危險、被限制人身自由或被強迫付款。",
                  "旅遊申訴中心 — 1330。由韓國觀光公社營運,提供外語協助與超收爭議調解。",
                ],
              },
            ].map((t) => (
              <details key={t.q} className="group rounded-2xl bg-card border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                  <span className="font-bold text-[15px] text-foreground">{t.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="px-5 pb-5 space-y-2">
                  {t.items.map((it, i) => (
                    <p key={i} className="text-[13px] text-muted-foreground leading-relaxed">
                      • {it}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            或者直接跳過這些風險 — NightFlow 是經過驗證的正規管道。真實夜店,價格透明,沒有拉客。
          </p>
        </section>

        <section className="space-y-3 pt-2">
          <Link href="/flags/new?lang=zh-tw" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">
            獲取 VIP 通道 — 無需註冊
          </Link>
          <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
            19+ · 攜帶護照到場
            <br />
            讓夜晚更美好
          </p>
        </section>
      </div>
    </div>
  );
}
