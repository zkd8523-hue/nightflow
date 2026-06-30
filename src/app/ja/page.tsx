import type { Metadata } from "next";
import { createServerClient } from "@supabase/ssr";
import { hideTestData } from "@/lib/utils/testData";
import { EnHomeClient } from "../en/EnHomeClient";

export const revalidate = 30;

export const metadata: Metadata = {
  title: {
    absolute:
      "韓国クラブ予約 — 江南・弘大・梨泰院のVIPルーム (NightFlow ソウル)",
  },
  description:
    "ソウルのベストクラブ予約 — 江南・弘大・梨泰院・狎鴎亭。本物の価格、VIPルーム、ブローカーなし、韓国語不要。韓国のトップクラブが専用オファーを送信。韓国ナイトライフを楽しもう。",
  keywords: [
    // 韓国 country-level
    "韓国クラブ",
    "韓国クラブ予約",
    "韓国ナイトクラブ",
    "韓国ナイトライフ",
    "韓国バー",
    "韓国VIPテーブル",
    "韓国VIPルーム",
    // ソウル city-level
    "ソウルクラブ",
    "ソウルクラブ予約",
    "ソウルナイトクラブ",
    "ソウルナイトライフ",
    "ソウルVIPテーブル",
    "ソウルパーティー",
    "ソウルバー",
    "ソウル夜遊び",
    // 江南
    "江南クラブ",
    "カンナムクラブ",
    "江南クラブ予約",
    "江南VIPテーブル",
    "江南ナイトライフ",
    "カンナム VIP",
    // 弘大
    "弘大クラブ",
    "ホンデクラブ",
    "弘大クラブ予約",
    "ホンデパーティー",
    "弘大バー",
    "ホンデ ナイトライフ",
    // 梨泰院
    "梨泰院クラブ",
    "イテウォンクラブ",
    "梨泰院ナイトライフ",
    "イテウォン バー",
    // 狎鴎亭/清潭
    "狎鴎亭ラウンジ",
    "アックジョンラウンジ",
    "清潭ラウンジ",
    "狎鴎亭VIP",
    // 釜山
    "釜山クラブ",
    "プサンクラブ",
    "釜山ナイトライフ",
    // おすすめ
    "韓国おすすめクラブ",
    "ソウルおすすめクラブ",
    "韓国旅行クラブ",
    "ソウル観光ナイトクラブ",
    "韓国旅行ナイトライフ",
    // K-POP
    "K-POPクラブ",
    "ソウルK-POPクラブ",
    "K-POPナイトクラブ",
    "K-POPバー",
    // 韓国観光
    "韓国観光",
    "ソウル観光",
    "韓国旅行",
    "ソウル旅行",
    // Brand
    "NightFlow",
    "NightFlow 韓国",
    "NightFlow ソウル",
  ],
  alternates: {
    canonical: "https://nightflow.kr/ja",
    languages: {
        "ko-KR": "https://nightflow.kr/",
        "en-US": "https://nightflow.kr/en",
        "zh-CN": "https://nightflow.kr/zh",
        "zh-TW": "https://nightflow.kr/zh",
        "ja-JP": "https://nightflow.kr/ja",
        "x-default": "https://nightflow.kr/",
    },
  },
  openGraph: {
    title: "韓国クラブ予約 — NightFlow ソウル",
    description:
      "ソウルのベストクラブ予約 — 江南・弘大・梨泰院。本物の価格、VIPルーム、韓国語不要。",
    url: "https://nightflow.kr/ja",
    siteName: "NightFlow",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NightFlow — 韓国クラブ予約",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "韓国クラブ予約 — NightFlow ソウル",
    description: "ソウルのベストクラブ予約 — 江南・弘大・梨泰院。ブローカーなし、韓国語不要。",
    images: ["/og-image.png"],
  },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

export default async function JaHomePage() {
  const supabase = createAnonClient();
  const nowIso = new Date().toISOString();

  const { data: puzzlesRaw } = await hideTestData(
    supabase
      .from("puzzles")
      .select(
        "id, area, event_date, budget_per_person, total_budget, target_count, current_count, target_male, target_female, status, gender_pref, notes, leader:users!puzzles_leader_id_fkey!inner(id, display_name, name, country_code, is_test)"
      )
      .in("status", ["open", "selecting"])
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(30),
    "users"
  );

  const puzzles = puzzlesRaw ?? [];
  let offerCountMap: Record<string, number> = {};

  if (puzzles.length > 0) {
    const ids = puzzles.map((p) => p.id);
    const { data: offerRows } = await supabase
      .from("puzzle_offers")
      .select("puzzle_id")
      .in("puzzle_id", ids)
      .eq("status", "pending")
      .limit(1000);
    if (offerRows) {
      offerRows.forEach((r: { puzzle_id: string }) => {
        offerCountMap[r.puzzle_id] = (offerCountMap[r.puzzle_id] || 0) + 1;
      });
    }
  }

  const flags = puzzles.map((p) => ({
    id: p.id,
    area: p.area,
    event_date: p.event_date,
    budget_per_person: p.budget_per_person,
    total_budget: p.total_budget,
    target_count: p.target_count,
    current_count: p.current_count,
    target_male: p.target_male,
    target_female: p.target_female,
    status: p.status,
    gender_pref: p.gender_pref,
    notes: p.notes,
    leader: Array.isArray(p.leader) ? p.leader[0] ?? null : (p.leader as { display_name: string | null; name: string | null; country_code: string | null } | null) ?? null,
    offerCount: offerCountMap[p.id] ?? 0,
  }));

  const flagCount = flags.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nightflow.kr/ja/#organization",
        name: "NightFlow",
        alternateName: ["NightFlow 韓国", "NightFlow ソウル"],
        url: "https://nightflow.kr/ja",
        logo: "https://nightflow.kr/og-image.png",
        description:
          "日本人旅行者のための韓国クラブ予約プラットフォーム。ソウルの江南・弘大・梨泰院のVIPルームを韓国語不要で簡単予約。",
        sameAs: ["https://www.instagram.com/nightflow.kr/"],
        areaServed: { "@type": "Country", name: "South Korea" },
      },
      {
        "@type": "WebSite",
        "@id": "https://nightflow.kr/ja/#website",
        url: "https://nightflow.kr/ja",
        name: "NightFlow — 韓国クラブ予約",
        inLanguage: "ja-JP",
        publisher: { "@id": "https://nightflow.kr/ja/#organization" },
      },
      {
        "@type": "Service",
        "@id": "https://nightflow.kr/ja/#service",
        name: "ソウルクラブ予約サービス",
        provider: { "@id": "https://nightflow.kr/ja/#organization" },
        areaServed: [
          { "@type": "City", name: "ソウル" },
          { "@type": "City", name: "釜山" },
        ],
        description:
          "ソウルのトップクラブVIPルーム予約（江南・弘大・梨泰院・狎鴎亭）。韓国語不要、本物の価格、ブローカーなし。",
        serviceType: "Club Reservation",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>
          韓国クラブ予約 — 江南・弘大・梨泰院のVIPルーム (NightFlow ソウル)
        </h1>
        <p>
          NightFlowは日本人旅行者のための韓国クラブ予約プラットフォームです。韓国語不要で、ソウルの江南・弘大・梨泰院・狎鴎亭のトップクラブVIPルームを簡単に予約できます。本物の価格、ブローカーなし、隠れた手数料なし。韓国のトップクラブから専用オファーが届き、比較して最適なプランを選ぶだけ。K-POPクラブ、バー、ヒップホップナイトクラブ、高級VIPラウンジまで、NightFlowが英語・日本語フレンドリーに対応します。
        </p>

        <h2>弘大クラブ予約 — ヒップホップ &amp; 外国人フレンドリー</h2>
        <p>
          弘大はソウルのヒップホップクラブエリアで、弘益大学の近くにあり日本人旅行者にも人気。代表的なクラブはClub Dokkaebi（高級ヒップホップ）、Sabotage、Attention、Club Purple、NB2（K-POPヒップホップ）、Awesome Red。弘大クラブは旅行者にとって最も入りやすい選択肢 — 多くのクラブはウォークイン可能ですが、NightFlowでVIPルーム予約すれば良い席が確保でき、列をスキップできます。
        </p>

        <h2>江南クラブ予約 — 大型EDM &amp; VIPルーム</h2>
        <p>
          江南はソウルの高級クラブエリアで、大型EDMクラブと豪華ラウンジが集まる場所です。代表的なクラブはClub ACE（新沙、旧Race）、Massive、Club Pop、Mirabaud。江南クラブは通常VIPルーム予約が必要 — メインテーブルは₩750,000+から。ボトルサービス、EDMのゴールデンシート、プライベートVIPルーム — NightFlowで韓国語不要で予約可能。
        </p>

        <h2>梨泰院クラブ予約 — 国際的 &amp; 英語フレンドリー</h2>
        <p>
          梨泰院はソウルの国際的なナイトライフエリアで、外国人旅行者の比率が最も高い場所。英語フレンドリーな梨泰院クラブにはSoap Seoul（2026年再オープン、ハウスとグルーヴ）、Cakeshopなどがあります。梨泰院クラブは旅行者に特に人気 — スタッフのほとんどが英語を話し、音楽はハウス、EDM、ディスコ、R&amp;B、ヒップホップまで幅広い。
        </p>

        <h2>狎鴎亭 &amp; 清潭のVIPルーム</h2>
        <p>
          狎鴎亭と清潭にはソウルで最も高級なVIPルームが集まり、シャンパンサービスとハイエンドパッケージを提供。代表的な場所はCore Lounge（EDM、2026年オープン）、Club Arzu（高級）、DM Seoul（ヒップホップラウンジ）。ルームは₩2,000,000+から。NightFlowなら、日本人旅行者でも韓国の地元の友人なしでVIPルームを予約できます。
        </p>

        <h2>NightFlow 韓国クラブ予約の流れ</h2>
        <p>
          旗を立てて、日付・人数・予算を入力。ソウルのトップクラブ — 江南Club ACE、弘大Club Dokkaebi、梨泰院Soap Seoul、狎鴎亭Core Loungeなど — から直接VIPオファーが届きます。1つの画面で価格・席・ボトルセットを比較、ワンタップで予約完了。韓国語不要、MDコンタクト不要、ブローカー手数料なし。
        </p>

        <h2>現在予約可能なフラッグ</h2>
        <p>
          現在{flagCount}件の韓国クラブ予約フラッグが立っています。ソウル（江南・弘大・梨泰院・狎鴎亭）でナイトライフを計画する旅行者からのもの。旗を立てれば数時間以内にソウルのトップクラブからVIPオファーが届きます。
        </p>

        <h2>NightFlowで韓国クラブを予約するメリット</h2>
        <ul>
          <li>
            韓国語不要 — 江南・弘大・梨泰院クラブが英語・日本語フレンドリーに対応。
          </li>
          <li>
            本物の価格 — プライベートオファーはあなただけが見える、ブローカー手数料なし。
          </li>
          <li>
            VIPルーム — ボトルサービス、ゴールデンロケーション、列スキップ。
          </li>
          <li>
            プラットフォーム料金ゼロ — クラブに直接支払い、NightFlowは手数料を取りません。
          </li>
          <li>
            旗立て無料、オファー受信無料、デポジット不要。
          </li>
        </ul>

        <h2>エリア別 韓国クラブ</h2>
        <ul>
          <li>
            <a href="/ja/clubs/gangnam">
              江南クラブ — EDM、ヒップホップ、狎鴎亭 &amp; 清潭VIPルーム
            </a>
          </li>
          <li>
            <a href="/ja/clubs/hongdae">
              弘大クラブ — ヒップホップ、K-POP、外国人フレンドリー
            </a>
          </li>
          <li>
            <a href="/ja/clubs/itaewon">
              梨泰院クラブ — 国際的、英語フレンドリー
            </a>
          </li>
          <li>
            <a href="/ja/clubs/apgujeong">
              狎鴎亭 &amp; 清潭ラウンジ — 高級VIP、シャンパンサービス
            </a>
          </li>
          <li>
            <a href="/ja/clubs/busan">
              釜山クラブ — 海雲台ビーチ &amp; 西面ダウンタウン
            </a>
          </li>
        </ul>

        <h2>予約タイプ別</h2>
        <ul>
          <li>
            <a href="/ja/vip-tables">
              ソウルVIPルーム予約 — 江南・狎鴎亭ボトルサービス
            </a>
          </li>
          <li>
            <a href="/ja/guests">
              ソウルクラブ ゲストリスト — 韓国クラブ無料入場
            </a>
          </li>
          <li>
            <a href="/ja/kpop-clubs">
              ソウルK-POPクラブ — K-POPファン必訪
            </a>
          </li>
          <li>
            <a href="/ja/faq">
              ソウルクラブ予約 FAQ — 価格、ドレスコード、ブローカー問題
            </a>
          </li>
        </ul>
      </div>
      <EnHomeClient flags={flags} />
    </>
  );
}
