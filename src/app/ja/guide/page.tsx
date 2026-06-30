import type { Metadata } from "next";
import Link from "next/link";

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

export default function JaGuidePage() {
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
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <div className="sr-only">
        <h1>韓国クラブ予約ガイド — 江南・弘大・梨泰院でVIPに (ソウル)</h1>
        <p>日本人旅行者に本当に役立つソウルクラブ予約を探していますか？NightFlowは外国人旅行者のための韓国クラブ予約プラットフォーム — 江南VIPルーム予約、弘大ナイトクラブ予約、梨泰院国際ナイトライフ。本物の価格、ブローカーなし、韓国語不要。地元民と同じ方法でソウルクラブを予約。</p>
        <h2>NightFlowを通じた韓国クラブ予約の流れ</h2>
        <p>あなたの夜を教えてください — 日付、人数、予算。ソウルクラブ予約オファーが数時間以内に届きます。江南・弘大・梨泰院クラブのオファーを1つの画面で比較。予約を選んで到着後、クラブに直接支払い。予約手数料ゼロ、ブローカー手数料なし、デポジット不要。</p>
        <h2>ウォークインの代わりにここで韓国クラブを予約する理由</h2>
        <p>ソウルでウォークイン予約は観光客価格と最悪の席を意味します。NightFlowソウルクラブ予約はこれを逆転 — トップクラブがあなたの予約のために競争し、あなただけが見えるプライベートVIPオファーを送信。本物の地元民はこの方法で予約。今、あなたもできます。</p>
      </div>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <Link href="/ja" className="text-2xl font-black tracking-tight text-white">NightFlow</Link>
        </div>
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">ソウルの最高のクラブで<br />VIPに</h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">韓国クラブ予約を簡単に。コネ不要、韓国語不要、ブローカーなし。NightFlowで江南・弘大・梨泰院クラブの最高の席を — 公平で透明な価格で。初日から地元民のように予約。</p>
        </header>
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">観光客扱いにうんざり？</h2>
          <div className="space-y-4">
            {[
              { icon: "🤷", title: "どのクラブが良いかわからない", body: "現地の事情を知らない。レビューは韓国語。結局、客引きに連れて行かれた場所に。" },
              { icon: "💸", title: "観光客価格", body: "ウォークインかブローカーか、自分が騙されているか分からない。比較も交渉もできない。" },
              { icon: "🧍", title: "外で行列", body: "コネなし、ルームなし、ゲストリストなし。寒い中待つあなたを地元民が追い越して入場。" },
            ].map((p) => (
              <div key={p.title} className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
                <div className="shrink-0 text-2xl leading-none pt-0.5">{p.icon}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-neutral-200">{p.title}</p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/ja/clubs" className="block text-center text-[13px] text-blue-400 underline">ソウルクラブの本物の価格を見る →</Link>
        </section>
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-neutral-500 uppercase text-center">ソウルクラブ予約の流れ</h2>
          <div className="space-y-4">
            {[
              { n: "1", title: "あなたの夜を教えてください", body: "日付、予算、人数。クラブ名を知る必要なし。" },
              { n: "2", title: "トップクラブがあなたの予約のために競争", body: "ソウルの最高のクラブがプライベートVIPオファーを送信 — 本物のルーム、本物の価格。彼らが競争し、あなたが選ぶ。" },
              { n: "3", title: "VIPのように入場", body: "最高のルームが予約済み、列なし、ブローカーなし。Instagramでクラブと連絡、ドアでパスポートを見せる (19+)。" },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
                <div className="shrink-0 w-9 h-9 rounded-full bg-white text-black font-black flex items-center justify-center">{s.n}</div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 pt-2">
          <Link href="/ja" className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors">VIPアクセス取得 — 無料登録</Link>
          <p className="text-[12px] text-neutral-600 text-center leading-relaxed">19+ · パスポート持参<br />夜をもっと美しく</p>
        </section>
      </div>
    </div>
  );
}
