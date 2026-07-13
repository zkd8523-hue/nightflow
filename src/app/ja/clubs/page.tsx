import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ClubsClient } from "../../en/clubs/ClubsClient";

export const metadata: Metadata = {
  title: {
    absolute:
      "韓国クラブガイド 2026 — 江南・弘大・梨泰院ナイトクラブ (ソウル)",
  },
  description:
    "韓国ソウルのベストクラブを本物の価格、Google評価、VIPルーム予約で。江南EDMクラブ、弘大ヒップホップクラブ、梨泰院国際クラブ、狎鴎亭VIPラウンジ。韓国語不要。",
  keywords: [
    "韓国クラブ",
    "韓国クラブガイド",
    "韓国クラブおすすめ",
    "ソウルクラブ",
    "ソウルクラブガイド",
    "ソウルクラブおすすめ",
    "ソウルVIPルーム",
    "江南クラブ",
    "江南VIPルーム",
    "弘大クラブ",
    "弘大バー",
    "梨泰院クラブ",
    "梨泰院ナイトライフ",
    "狎鴎亭ラウンジ",
    "清潭ラウンジ",
    "釜山クラブ",
    "韓国ベストクラブ",
    "ソウルベストクラブ",
    "韓国旅行クラブ",
  ],
  alternates: {
    canonical: "https://nightflow.kr/ja/clubs",
    languages: {
        "ko-KR": "https://nightflow.kr/clubs",
        "en-US": "https://nightflow.kr/en/clubs",
        "zh-CN": "https://nightflow.kr/zh/clubs",
        "zh-TW": "https://nightflow.kr/zh-tw/clubs",
        "ja-JP": "https://nightflow.kr/ja/clubs",
        "x-default": "https://nightflow.kr/clubs",
    },
  },
  openGraph: {
    title: "韓国クラブガイド 2026 — 江南・弘大・梨泰院",
    description: "韓国ソウルのベストクラブを本物の価格とVIPルーム予約で。ブローカーなし。",
    url: "https://nightflow.kr/ja/clubs",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function JaClubsPage() {
  const supabase = await createClient();

  const { data: clubs } = await supabase
    .from("clubs")
    .select(
      "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, partners:club_partners(md_id)"
    )
    .is("deleted_at", null)
    .not("name", "ilike", "%운영자%")
    .eq("is_test", false)
    .order("google_review_count", { ascending: false, nullsFirst: false });

  const clubList = (clubs ?? []).map((c) => ({ ...c, has_md: (c.partners?.length ?? 0) > 0 }));
  const clubCount = clubList.length;

  return (
    <>
      <div className="sr-only">
        <h1>韓国クラブ予約ガイド — 江南・弘大・梨泰院・狎鴎亭</h1>
        <p>
          韓国ソウルの{clubCount}軒のベストクラブを、本物の価格、Google評価、ドリンクメニュー、VIPルーム予約で閲覧。韓国語不要で韓国クラブを予約。ブローカーなし、隠れた手数料なし、予約手数料なし — クラブに直接支払い。
        </p>
        <h2>エリア別 韓国トップクラブ</h2>
        <ul>
          {clubList.slice(0, 30).map((c) => {
            const areaJa =
              ({ 강남: "江南", 홍대: "弘大", 이태원: "梨泰院", 건대: "建大", 부산: "釜山" } as Record<string, string>)[c.area] ??
              c.area;
            return (
              <li key={c.id}>
                {c.name} — {areaJa}クラブ
                {c.google_rating ? ` (${c.google_rating}★)` : ""}
              </li>
            );
          })}
        </ul>
        <h2>NightFlowで韓国クラブを予約する方法</h2>
        <p>
          行きたいクラブ（江南・弘大・梨泰院・狎鴎亭・清潭）を選んでください、または雰囲気だけ伝えてください — 日付・人数・予算と一緒に。NightFlowが直接クラブに連絡し、予算内で一番良い席を確保します。ワンタップでソウルクラブVIPルームを予約 — 韓国語不要。
        </p>
        <h2>エリア別に韓国クラブを見る</h2>
        <ul>
          <li><a href="/ja/clubs/gangnam">江南クラブ予約 — VIPルーム、EDMクラブ、狎鴎亭 &amp; 清潭ラウンジ</a></li>
          <li><a href="/ja/clubs/hongdae">弘大クラブ予約 — ヒップホップ、K-POP、外国人フレンドリー</a></li>
          <li><a href="/ja/clubs/itaewon">梨泰院クラブ予約 — 国際的、英語フレンドリー</a></li>
          <li><a href="/ja/clubs/apgujeong">狎鴎亭ラウンジ予約 — 高級VIP、シャンパンサービス</a></li>
          <li><a href="/ja/clubs/busan">釜山クラブ予約 — 海雲台 &amp; 西面のナイトライフ</a></li>
        </ul>
        <h2>FAQ — ソウルクラブ予約のよくある質問</h2>
        <p>
          価格、ドレスコード、ブローカー問題、そして日本人旅行者がVIPルームを予約する方法については、<a href="/ja/faq">ソウルクラブ予約FAQ</a>をご覧ください。
        </p>
      </div>
      <ClubsClient clubs={clubList} lang="ja" />
    </>
  );
}
