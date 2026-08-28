import type { Metadata } from "next";
import Link from "next/link";
import { krwToAll, getKrwRates } from "@/lib/utils/currency";
import { ForeignShell } from "@/components/foreign/ForeignShell";

// 外国人観光客向け 詐欺注意アコーディオン（英語版 TIPS と同じ内容）
const TIPS = [
  {
    q: "🚩 よくある詐欺に注意",
    items: [
      "「無料入場」の罠 — 無料で誘い込み、高額なドリンク代やカバーチャージを払うまで帰してもらえない。",
      "不透明な価格 — 公式メニューがなく、外国人は実際の数倍の料金をテーブルやドリンクに請求される。",
      "カード不正利用 — 酔った客のカードを預かり、同意なく何度も繰り返し決済される。",
      "偽プロモーター — DMで「予約できます」と持ちかけ、実際の価格よりはるかに多くの金額を中抜きする。",
    ],
  },
  {
    q: "🛡️ 身を守る方法",
    items: [
      "弘大や梨泰院で「無料入場」カードを配る客引きについて行かない。",
      "必ず印刷された価格メニューを確認する。注文ごとに前払いする。",
      "レシートを必ず確認し、スマホでカード決済の即時通知をオンにしておく。",
      "公式チャンネルのみで予約する — クラブの公式アカウント経由で。未確認のプロモーター経由は避ける。",
    ],
  },
  {
    q: "📞 トラブルが起きたら",
    items: [
      "警察 — 112。すぐの危険、監禁、支払いの強要があった場合。",
      "観光苦情センター — 1330。韓国観光公社が運営し、外国語対応と過剰請求の仲裁を行う。",
    ],
  },
];

// 予算ティア — 本物の価格を伝える
const PRICE_TIERS = [
  {
    icon: "🎟️",
    label: "とりあえず入場",
    price: "₩20,000〜30,000 / 人",
    krwAmount: 25000,
    desc: "入場料 + 最初の1杯。ダンスフロアで軽く楽しむ夜。",
  },
  {
    icon: "👑",
    label: "本物のVIP体験",
    price: "₩500,000〜",
    krwAmount: 500000,
    desc: "一等席のテーブル、ボトルサービス、夜通しのスタッフ対応 — 忘れられない夜に。",
  },
];

export const metadata: Metadata = {
  title: { absolute: "韓国クラブ予約ガイド — 江南・弘大・梨泰院でVIPに" },
  description: "韓国語不要でソウルのトップクラブを予約。江南・弘大・梨泰院・狎鴎亭のベストVIPルーム。公平な価格、列とブローカーをスキップ。日本人旅行者向け韓国ナイトライフガイド。",
  keywords: ["韓国クラブ予約ガイド","韓国ナイトライフガイド","韓国VIPルーム","韓国クラブガイド","ソウルクラブ予約ガイド","ソウルVIPルーム予約","ソウルパーティー予約","ソウルクラブガイド","弘大クラブ予約","弘大VIPルーム","弘大クラブガイド","江南クラブ予約","江南VIPルーム","江南クラブガイド","梨泰院クラブ予約","梨泰院ナイトライフガイド","狎鴎亭ラウンジ予約","清潭ラウンジ"],
  alternates: {
    canonical: "https://nightflow.kr/ja/guide",
    languages: {
        "en-US": "https://nightflow.kr/en/guide",
        "zh-CN": "https://nightflow.kr/zh/guide",
        "zh-TW": "https://nightflow.kr/zh/guide",
        "ja-JP": "https://nightflow.kr/ja/guide",
        "x-default": "https://nightflow.kr/en/guide",
    },
  },
  openGraph: { title: "韓国クラブ予約ガイド — 江南・弘大・梨泰院でVIPに", description: "韓国語不要でソウルのトップクラブを予約。本物の価格、ブローカーなし。", url: "https://nightflow.kr/ja/guide", locale: "ja_JP", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630 }] },
};

export default async function JaGuidePage() {
  // 환율은 15일 주기 갱신 (실패 시 폴백) — currency.ts 참고
  const { rates: fxRates } = await getKrwRates();
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "韓国クラブ予約ガイド — 江南・弘大・梨泰院でVIPに",
    description: "韓国語不要でソウルの最熱クラブを予約。江南・弘大・梨泰院・狎鴎亭のベストVIPルーム。公平な価格、列とブローカーをスキップ。",
    image: ["https://nightflow.kr/og-image.png"],
    datePublished: "2026-01-01T00:00:00+09:00",
    dateModified: new Date().toISOString().split("T")[0] + "T00:00:00+09:00",
    author: { "@type": "Organization", name: "NightFlow", url: "https://nightflow.kr/ja" },
    publisher: { "@type": "Organization", name: "NightFlow", logo: { "@type": "ImageObject", url: "https://nightflow.kr/og-image.png" } },
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://nightflow.kr/ja/guide" },
    inLanguage: "ja-JP",
    about: [{ "@type": "Thing", name: "ソウルナイトライフ" }, { "@type": "Thing", name: "韓国クラブ予約" }, { "@type": "Thing", name: "江南VIPルーム" }, { "@type": "Thing", name: "弘大クラブ" }, { "@type": "Thing", name: "梨泰院ナイトライフ" }],
  };

  return (
    <ForeignShell lang="ja">
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韓国クラブ予約ガイド — 江南・弘大・梨泰院でVIPに (ソウル)</h1>
        <p>日本人旅行者に本当に役立つソウルクラブ予約を探していますか？NightFlowは外国人旅行者のための韓国クラブ予約プラットフォーム — 江南VIPルーム予約、弘大ナイトクラブ予約、梨泰院国際ナイトライフ。本物の価格、ブローカーなし、韓国語不要。地元民と同じ方法でソウルクラブを予約。</p>
        <h2>NightFlowを通じた韓国クラブ予約の流れ</h2>
        <p>行きたいクラブを選んでください（または予算と雰囲気だけ伝えてください）— 日付、人数、予算と一緒に。NightFlowが直接クラブに連絡し、予算内で一番良い席を確保します。通常数時間以内に返信。到着後、クラブに直接支払い。予約手数料ゼロ、ブローカー手数料なし、デポジット不要。</p>
        <h2>ウォークインの代わりにここで韓国クラブを予約する理由</h2>
        <p>ソウルでウォークイン予約は観光客価格と最悪の席を意味します。NightFlowは現地価格であなたの代わりに予約します — 直接クラブに連絡し、ブローカー手数料なし。本物の地元民はこの方法で予約。今、あなたもできます。</p>
      </div>
      <div className="max-w-lg lg:max-w-[860px] mx-auto px-6 lg:px-10 py-16 space-y-16">
        <div className="text-center">
          <Link href="/ja" className="text-2xl font-black tracking-tight text-foreground">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">ソウルの最高のクラブで<br />VIPに</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">韓国クラブ予約を簡単に。コネ不要、韓国語不要、ブローカーなし。NightFlowで江南・弘大・梨泰院クラブの最高の席を — 公平で透明な価格で。初日から地元民のように予約。</p>
        </header>
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">観光客扱いにうんざり？</h2>
          <div className="space-y-4">
            {[
              { icon: "🤷", title: "どのクラブが良いかわからない", body: "現地の事情を知らない。レビューは韓国語。結局、客引きに連れて行かれた場所に。" },
              { icon: "💸", title: "観光客価格", body: "ウォークインかブローカーか、自分が騙されているか分からない。比較も交渉もできない。" },
              { icon: "🧍", title: "外で行列", body: "コネなし、ルームなし、ゲストリストなし。寒い中待つあなたを地元民が追い越して入場。" },
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
          <Link href="/ja/clubs" className="block text-center text-[13px] text-blue-400 underline">ソウルクラブの本物の価格を見る →</Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-muted-foreground uppercase text-center">ソウルクラブ予約の流れ</h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "クラブを選ぶ", body: "行きたいクラブを選んでください（または雰囲気だけ伝えてください）— 日付、予算、人数。" },
              { n: "2", title: "私たちが直接予約します", body: "NightFlowが直接クラブに連絡し、予算内で一番良い席を確保 — 本物の価格、ブローカー手数料なし。" },
              { n: "3", title: "VIPのように入場", body: "最高のルームが予約済み、列なし、ブローカーなし。Instagramでクラブと連絡、ドアでパスポートを見せる (19+)。" },
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

        {/* Price tiers — 本物の価格を伝える */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black tracking-tight">本物のVIPな夜を過ごしたい？</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              友達と一緒に₩500,000以上使えば、旅の一番の思い出になります。ソウルの夜遊びに実際いくらかかるのか、もう推測は不要です。
            </p>
          </div>
          <div className="space-y-3">
            {PRICE_TIERS.map((t) => (
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
            予算を伝えれば、それに合った最高のテーブルを探します。人数が多いほど、夜はもっとVIPに。
          </p>
          <Link href="/flags/new?lang=ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">NightFlowで予約する</Link>
        </section>

        {/* Safety tips — collapsible (native details, no JS) */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black tracking-tight text-center">行く前に知っておこう</h2>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            ソウルのナイトライフは最高です。でも観光客が詐欺に遭うこともあります。安全に楽しむ方法をご紹介します。
          </p>
          <div className="space-y-3">
            {TIPS.map((t) => (
              <details key={t.q} className="group rounded-2xl bg-card border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                  <span className="font-bold text-[15px] text-foreground">{t.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="px-5 pb-5 space-y-2">
                  {t.items.map((it, i) => (
                    <p key={i} className="text-[13px] text-muted-foreground leading-relaxed">• {it}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            リスクを避けたいなら、NightFlowが安心の窓口です。本物のクラブ、明朗な価格、客引きなし。
          </p>
        </section>

        <section className="space-y-3 pt-2">
          <Link href="/flags/new?lang=ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base text-center hover:opacity-90 transition-colors">VIPアクセス取得 — 登録不要</Link>
          <p className="text-[12px] text-muted-foreground text-center leading-relaxed">19+ · パスポート持参<br />夜をもっと美しく</p>
        </section>
      </div>
    </div>
    </ForeignShell>
  );
}
