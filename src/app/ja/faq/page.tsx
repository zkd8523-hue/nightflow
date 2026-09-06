import type { Metadata } from "next";
import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";

export const metadata: Metadata = {
  title: {
    absolute: "ソウルクラブ予約 FAQ — 韓国ナイトライフ よくある質問 (日本人旅行者)",
  },
  description:
    "ソウルクラブ予約のよくある質問、日本人旅行者向けに整理。韓国価格、VIPルーム、ドレスコード、ブローカー問題 — 日本語で解説。",
  keywords: [
    "ソウルクラブ FAQ",
    "韓国ナイトライフ 質問",
    "ソウルクラブ予約 FAQ",
    "江南クラブ FAQ",
    "弘大クラブ 質問",
    "韓国クラブガイド",
    "外国人ソウルナイトライフ",
    "韓国クラブブローカー",
    "ソウルルーム価格",
    "韓国VIPルーム",
  ],
  alternates: {
    canonical: "https://nightflow.kr/ja/faq",
    languages: {
        "ko-KR": "https://nightflow.kr/faq",
        "en-US": "https://nightflow.kr/en/faq",
        "zh-CN": "https://nightflow.kr/zh/faq",
        "zh-TW": "https://nightflow.kr/zh/faq",
        "ja-JP": "https://nightflow.kr/ja/faq",
        "x-default": "https://nightflow.kr/faq",
    },
  },
  openGraph: {
    title: "ソウルクラブ予約 FAQ — 韓国ナイトライフ よくある質問",
    description: "韓国クラブの本物の価格、ドレスコード、日本人がVIPルームを予約する方法。",
    url: "https://nightflow.kr/ja/faq",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

const FAQS = [
  { q: "韓国語が話せませんが、ソウルクラブを予約できますか？", a: "可能です。NightFlowは外国人旅行者が完全に日本語・英語でソウルクラブを予約できるサービスです。行きたいクラブを選んでください（または予算と雰囲気だけ伝えてください）。私たちが直接クラブに連絡し、席を確保します — 韓国語不要、ブローカーなし。" },
  { q: "外国人の場合、ソウルクラブの一晩はいくらかかりますか？", a: "通常の入場は一人₩20,000–30,000。江南のメインVIPテーブルは₩750,000+から（4–6人で割ると一人₩150–300K）。狎鴎亭プレミアムラウンジは₩2,000,000+から。NightFlowなら韓国人と同じ価格を支払います — 観光客税なし。" },
  { q: "ソウルのどのエリアが外国人に最適ですか？", a: "梨泰院が最も外国人フレンドリーで、英語スタッフ、国際的な客層。弘大はK-POPとヒップホップファンに最適、ウォークインフレンドリー。江南は高級VIPテーブル体験用。狎鴎亭はハイエンドラウンジ。" },
  { q: "ソウルクラブはどれくらい前に予約すべきですか？", a: "ベスト：旅行の3–7日前。許容：24時間前。最後の手段：当日 — まだリクエスト可能ですが空席の確保が難しくなります。金曜・土曜のピーク夜は特に混み合います。" },
  { q: "予約手数料やデポジットはありますか？", a: "予約手数料なし、デポジットなし。NightFlowへのリクエスト送信は無料。到着した時にクラブに直接支払うだけ — 韓国人価格、ブローカー手数料なし。" },
  { q: "韓国MDのコネがなくてもVIPルームを予約できますか？", a: "可能です。従来のソウルクラブ予約には韓国のMD（プロモーター）コンタクトが必要でした。NightFlowはこれを解決 — 私たちが直接クラブに連絡し、あなたの予算内で一番良い席を確保します。コネ不要、言語の壁なし。" },
  { q: "ソウルクラブのドレスコードは？", a: "江南：スマートカジュアル最低限 — ビーチサンダル、ショートパンツ、破れたジーンズはNG。弘大：自由、ストリートウェアOK。梨泰院：国際的スマートカジュアル。必ずパスポート実物を持参（韓国法でID必須）。" },
  { q: "ソウルクラブは外国人を受け入れますか？", a: "ほとんど受け入れます。弘大と梨泰院のクラブは外国人を歓迎 — 多くの場所が積極的に国際来訪者を受け入れます。一部の江南クラブは外見と韓国語能力による厳しいドアポリシーがあるが、VIPルーム予約客はほぼ拒否されません。" },
  { q: "6人以上のグループでも予約できますか？", a: "可能です。4–6人がVIPルームに最適（一人あたりのコストが最良）。6人以上は隣接する複数テーブルの予約が必要な場合があります。NightFlowでリクエストを送る時にグループ人数を指定でき、私たちが対応します。" },
  { q: "VIPルームなしで列をスキップできますか？", a: "多くのクラブがゲストリスト（게스트）オプションを提供 — 早く到着すれば無料または割引入場。NightFlowの「Guest Sign」機能で毎週のソウルクラブのゲストリスト情報が見られます。毎週月曜18時KST更新。" },
  { q: "ソウルには音楽ジャンル別のクラブがありますか？", a: "あります。ヒップホップ：Club Dokkaebi（弘大）、Club Arzu（清潭）、DM Seoul（狎鴎亭）。EDM：Club ACE（江南）、Core Lounge（狎鴎亭）、Bermuda（弘大）。ハウス/テクノ：Soap Seoul（梨泰院）、Faust（梨泰院）、Vurt（梨泰院）。K-POP：NB2（弘大）。" },
  { q: "見知らぬ人とテーブルをシェアしてコストを下げられますか？", a: "可能です — NightFlowでは「Share」（파티）と呼ばれます。MDがプレミアムテーブルの個別席を販売、テーブル料金の1/Nだけ支払います。VIPアクセスが欲しいがグループコストは避けたい一人旅行者やペアに最適。" },
];

export default function JaFaqPage() {
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
      { "@type": "ListItem", position: 1, name: "NightFlow", item: "https://nightflow.kr/ja" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://nightflow.kr/ja/faq" },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="info" lang="ja" meta={{ page: "faq" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <header className="space-y-4 text-center">
          <Link href="/ja" className="text-[12px] text-muted-foreground hover:text-foreground">← NightFlow</Link>
          <h1 className="text-[32px] font-black tracking-tight leading-[1.15]">ソウルクラブ予約 FAQ</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            ソウルナイトライフに関する本物の回答、日本人旅行者向けに整理。価格、ドレスコード、VIPルーム、ブローカー問題 — 初めてソウルでクラブに行く前に知っておくべきこと全て。
          </p>
        </header>
        <section className="space-y-3">
          {FAQS.map((f, i) => (
            <details key={i} className="group rounded-2xl bg-card border border-border overflow-hidden">
              <summary className="flex items-center justify-between gap-3 p-5 cursor-pointer list-none select-none">
                <span className="font-bold text-[15px] text-foreground leading-snug">{f.q}</span>
                <span className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0">▾</span>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-[13px] text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            </details>
          ))}
        </section>
        <section className="space-y-3 pt-4 text-center">
          <Link data-nf-track="book_cta" href="/flags/new?lang=ja" className="block w-full py-4 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 transition-colors">
            🍾 NightFlowで予約する
          </Link>
          <p className="text-[12px] text-muted-foreground">19+ · パスポート持参 · 予約手数料なし</p>
        </section>
      </div>
    </div>
  );
}
