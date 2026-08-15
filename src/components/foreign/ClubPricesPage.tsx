import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { createClient } from "@/lib/supabase/server";
import { type Lang, makeT } from "@/lib/i18n";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";

// "서울 클럽 입장료 얼마?" 검색 대응 페이지.
//
// 차별점: 실제 DB 값을 쓴다. 경쟁 블로그들은 "강남 입장료 ₩30,000" 같은 뭉뚱그린 숫자를
// 쓰는데, 우리가 가진 50곳 실측값은 강남 대부분 ₩10,000이고 이태원은 상당수 무료다.
// 구체적인 클럽명+금액을 보여주고 각 클럽 상세로 링크해 내부링크(거미줄)까지 만든다.
//
// ⚠️ 테이블/보틀 가격은 DB에 구조화돼 있지 않다. 추정치를 지어내지 않고 "요청 시 견적"으로만 안내.

const AREA_ORDER = ["이태원", "홍대", "강남", "부산"] as const;

type Row = {
  name_en: string | null;
  name: string;
  area: string;
  entry_fee_detail: string | null;
  google_review_count: number | null;
};

/** 자유 텍스트 입장료에서 "무료" 여부와 대표 금액(원)을 뽑는다. 못 읽으면 null. */
function parseFee(raw: string | null): { free: boolean; won: number | null } {
  if (!raw) return { free: false, won: null };
  const s = raw.trim();
  const isFree = /무료입장|무료\s*입장|^무료/.test(s);
  // "10,000원", "15,000" 등 첫 번째 금액
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원?/);
  const won = m ? Number(m[1].replace(/,/g, "")) : null;
  return { free: isFree, won: isFree ? 0 : won };
}

export async function ClubPricesPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("name_en, name, area, entry_fee_detail, google_review_count")
    .eq("status", "approved")
    .is("deleted_at", null)
    .eq("is_test", false)
    .eq("hidden_from_guide", false);

  const rows = (data ?? []) as Row[];

  const byArea = AREA_ORDER.map((area) => {
    const inArea = rows.filter((c) => c.area === area && c.entry_fee_detail?.trim());
    const parsed = inArea.map((c) => ({ club: c, ...parseFee(c.entry_fee_detail) }));
    const freeCount = parsed.filter((p) => p.free).length;
    const paid = parsed.filter((p) => !p.free && p.won).map((p) => p.won as number);
    return {
      area,
      total: rows.filter((c) => c.area === area).length,
      withData: inArea.length,
      freeCount,
      min: paid.length ? Math.min(...paid) : null,
      max: paid.length ? Math.max(...paid) : null,
      // 리뷰 많은 순으로 대표 클럽 노출 (내부링크)
      examples: parsed
        .sort((a, b) => (b.club.google_review_count ?? 0) - (a.club.google_review_count ?? 0))
        .slice(0, 6),
    };
  }).filter((a) => a.withData > 0);

  const areaLabelMap: Record<string, string> = {
    이태원: t("이태원", "Itaewon", "梨泰院", "梨泰院", "梨泰院"),
    홍대: t("홍대", "Hongdae", "弘大", "弘大", "弘大"),
    강남: t("강남", "Gangnam", "江南", "江南", "江南"),
    부산: t("부산", "Busan", "釜山", "釜山", "釜山"),
  };

  const totalWithData = byArea.reduce((s, a) => s + a.withData, 0);
  const totalFree = byArea.reduce((s, a) => s + a.freeCount, 0);

  const faqs = [
    {
      q: t(
        "서울 클럽 입장료는 보통 얼마인가요?",
        "How much is the entry fee at a Seoul club?",
        "ソウルのクラブの入場料はいくらですか？",
        "首尔夜店的入场费一般多少?",
        "首爾夜店的入場費一般多少?"
      ),
      a: t(
        `대부분 10,000~20,000원입니다. 저희가 확인한 ${totalWithData}곳 중 ${totalFree}곳은 아예 무료입장입니다.`,
        `Most charge ₩10,000–20,000. Of the ${totalWithData} clubs we verified, ${totalFree} have free entry.`,
        `ほとんどが₩10,000〜20,000です。確認した${totalWithData}店のうち${totalFree}店は入場無料です。`,
        `大多数是₩10,000–20,000。我们核实的${totalWithData}家中,有${totalFree}家免费入场。`,
        `大多數是₩10,000–20,000。我們核實的${totalWithData}家中,有${totalFree}家免費入場。`
      ),
    },
    {
      q: t(
        "입장료에 술이 포함되나요?",
        "Does the entry fee include a drink?",
        "入場料にドリンクは含まれますか？",
        "入场费包含饮料吗?",
        "入場費包含飲料嗎?"
      ),
      a: t(
        "많은 클럽이 '1 Free Drink'를 포함합니다. 부산 일부는 입장료 대신 음료 1잔 주문이 조건입니다.",
        "Many include one free drink. Some Busan venues skip the cover entirely and just require a one-drink minimum.",
        "多くの店が「1 Free Drink」付きです。釜山の一部は入場料の代わりに1ドリンクの注文が条件です。",
        "很多店含「1 Free Drink」。釜山部分场所不收入场费,只要求点一杯饮料。",
        "很多店含「1 Free Drink」。釜山部分場所不收入場費,只要求點一杯飲料。"
      ),
    },
    {
      q: t(
        "테이블은 얼마인가요?",
        "How much does a table cost?",
        "テーブルはいくらですか？",
        "卡座多少钱?",
        "包廂多少錢?"
      ),
      a: t(
        "요일·인원·클럽에 따라 편차가 커서 고정가가 없습니다. 날짜와 인원을 알려주시면 클럽에 물어 실제 가격을 알려드립니다 — 저희가 받는 수수료는 없습니다.",
        "There is no fixed price — it swings by night, group size and venue. Tell us your date and headcount and we'll ask the club and tell you the real price. We take no fee.",
        "曜日・人数・店によって幅が大きく、固定価格はありません。日程と人数を教えていただければ、クラブに確認して実際の価格をお伝えします。手数料はいただきません。",
        "价格因日子、人数和店家差异很大,没有固定价。告诉我们日期和人数,我们会问店家并告诉你真实价格 — 我们不收取费用。",
        "價格因日子、人數和店家差異很大,沒有固定價。告訴我們日期和人數,我們會問店家並告訴你真實價格 — 我們不收取費用。"
      ),
    },
    {
      q: t(
        "외국인이라고 더 비싸게 받나요?",
        "Do foreigners get charged more?",
        "外国人は高く請求されますか？",
        "外国人会被多收钱吗?",
        "外國人會被多收錢嗎?"
      ),
      a: t(
        "정상 업장에서는 아닙니다. 다만 길거리 호객이 붙는 곳은 가격표가 없는 경우가 있으니, 항상 인쇄된 메뉴판을 확인하세요.",
        "Not at legitimate venues. But street touts sometimes lead people to places with no printed menu — always ask to see one.",
        "まともな店では違います。ただ路上の客引きが案内する店は価格表がないことがあるので、必ず印刷されたメニューを確認してください。",
        "正规场所不会。但街头拉客带去的地方有时没有价目表,一定要求看印刷菜单。",
        "正規場所不會。但街頭拉客帶去的地方有時沒有價目表,一定要求看印刷菜單。"
      ),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    // 하단 sticky 예약바에 가리지 않도록 여백 확보 (pb-safe: 아이폰 홈 인디케이터)
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="guide" lang={lang} meta={{ guide: "prices" }} />

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link data-nf-track="breadcrumb_home" href={`/${lang}`} className="hover:text-foreground">NightFlow</Link>
          <span>/</span>
          <span className="text-foreground font-bold">
            {t("클럽 가격", "Club prices", "クラブ料金", "夜店价格", "夜店價格")}
          </span>
        </nav>

        <header className="space-y-3">
          <h1 className="text-[30px] font-black tracking-tight leading-tight break-keep">
            {t(
              "서울 클럽, 실제로 얼마 드나요?",
              "How much does a Seoul club actually cost?",
              "ソウルのクラブ、実際いくらかかる？",
              "首尔夜店实际要花多少钱?",
              "首爾夜店實際要花多少錢?"
            )}
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed break-keep">
            {t(
              `추정치가 아니라 실제 값입니다. 저희가 직접 확인한 클럽 ${totalWithData}곳의 입장료를 지역별로 정리했습니다.`,
              `Not estimates — actual numbers. Entry fees we verified at ${totalWithData} clubs, broken down by district.`,
              `推定ではなく実際の数字です。直接確認した${totalWithData}店の入場料をエリア別にまとめました。`,
              `不是估算,是实际数字。我们直接核实的${totalWithData}家夜店入场费,按区域整理。`,
              `不是估算,是實際數字。我們直接核實的${totalWithData}家夜店入場費,按區域整理。`
            )}
          </p>
        </header>

        {/* 핵심 요약 — 스니펫에 잡히기 좋은 위치 */}
        <section className="rounded-2xl bg-card border border-border p-5 space-y-2">
          <h2 className="text-[15px] font-black text-brand-amber">
            {t("한 줄 요약", "The short answer", "ひとことで言うと", "简单来说", "簡單來說")}
          </h2>
          <p className="text-[15px] leading-relaxed break-keep">
            {t(
              `대부분 10,000~20,000원이고, ${totalFree}곳은 무료입장입니다. "서울 클럽은 비싸다"는 말은 테이블을 잡을 때 얘기지, 그냥 들어가는 값이 아닙니다.`,
              `Most are ₩10,000–20,000, and ${totalFree} are free to enter. "Seoul clubs are expensive" is about tables — not about getting in the door.`,
              `ほとんどが₩10,000〜20,000で、${totalFree}店は入場無料です。「ソウルのクラブは高い」はテーブルの話であって、入場料の話ではありません。`,
              `大多数是₩10,000–20,000,其中${totalFree}家免费入场。"首尔夜店贵"说的是卡座,不是进门的钱。`,
              `大多數是₩10,000–20,000,其中${totalFree}家免費入場。「首爾夜店貴」說的是包廂,不是進門的錢。`
            )}
          </p>
        </section>

        {/* 지역별 실측 */}
        <section className="space-y-4">
          <h2 className="text-[20px] font-black tracking-tight">
            {t("지역별 입장료", "Entry fees by district", "エリア別の入場料", "各区域入场费", "各區域入場費")}
          </h2>

          {byArea.map((a) => {
            const areaSlug = canonicalAreaSlug(a.area);
            return (
              <div key={a.area} className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[17px] font-black">{areaLabelMap[a.area] ?? a.area}</h3>
                  <span className="text-[12px] text-muted-foreground">
                    {a.min != null && a.max != null
                      ? `₩${a.min.toLocaleString()}${a.max !== a.min ? `–${a.max.toLocaleString()}` : ""}`
                      : t("무료 위주", "mostly free", "無料が中心", "以免费为主", "以免費為主")}
                    {a.freeCount > 0 && ` · ${a.freeCount} ${t("곳 무료", "free", "店無料", "家免费", "家免費")}`}
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {a.examples.map(({ club, free }) => {
                    const nameEn = club.name_en?.trim();
                    const slug = nameEn ? clubSlug(nameEn) : null;
                    const fee = translateClubMeta(club.entry_fee_detail ?? "", lang);
                    return (
                      <li key={club.name} className="flex items-start justify-between gap-3 text-[13px]">
                        {slug && areaSlug ? (
                          <Link
                            data-nf-track="club_detail" href={`/${lang}/clubs/${areaSlug}/${slug}`}
                            className="font-bold text-foreground hover:text-brand-amber transition-colors shrink-0"
                          >
                            {nameEn}
                          </Link>
                        ) : (
                          <span className="font-bold shrink-0">{nameEn || club.name}</span>
                        )}
                        <span className={`text-right ${free ? "text-money font-bold" : "text-muted-foreground"}`}>
                          {fee}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {areaSlug && (
                  <Link
                    data-nf-track="area_list" href={`/${lang}/clubs/${areaSlug}`}
                    className="inline-block text-[12px] text-brand-amber underline underline-offset-2"
                  >
                    {t("전체 보기", "See all", "すべて見る", "查看全部", "查看全部")} →
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        {/* FAQ — 본문에도 노출 (JSON-LD만 있으면 구글이 신뢰하지 않음) */}
        <section className="space-y-4">
          <h2 className="text-[20px] font-black tracking-tight">
            {t("자주 묻는 질문", "Common questions", "よくある質問", "常见问题", "常見問題")}
          </h2>
          {faqs.map((f) => (
            <div key={f.q} className="space-y-1">
              <h3 className="text-[15px] font-bold">{f.q}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{f.a}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-[17px] font-black">
            {t("예약할까요?", "Ready to book?", "予約しますか？", "要预订吗?", "要預訂嗎?")}
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
            {t(
              "날짜·인원·예산만 알려주시면 저희가 클럽에 직접 연락해 실제 가격을 받아 알려드립니다. 중개 수수료도 예약금도 없고, 가격을 보고 결정하시면 됩니다.",
              "Tell us your date, group size and budget — we contact the club directly and come back with the real price. No broker fee, no deposit, and you decide after you see it.",
              "日程・人数・予算を教えていただければ、私たちがクラブに直接連絡して実際の価格をお伝えします。仲介手数料もデポジットもなく、価格を見てから決められます。",
              "告诉我们日期、人数和预算,我们直接联系夜店拿到真实价格。无中介费、无押金,看到价格后再决定。",
              "告訴我們日期、人數和預算,我們直接聯絡夜店拿到真實價格。無中介費、無訂金,看到價格後再決定。"
            )}
          </p>
          {/* 버튼은 하단 sticky 바로 뺐다 — 이 섹션은 설명만 담당 */}
        </section>

        <nav className="flex flex-wrap gap-2 pb-4">
          <Link href={`/${lang}/faq`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("전체 FAQ", "Full FAQ", "FAQ全体", "完整FAQ", "完整FAQ")}
          </Link>
          <Link href={`/${lang}/vip-tables`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("VIP 테이블", "VIP tables", "VIPテーブル", "VIP卡座", "VIP包廂")}
          </Link>
          <Link href={`/${lang}/guests`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("무료 입장", "Free entry", "無料入場", "免费入场", "免費入場")}
          </Link>
          <Link href={`/${lang}/clubs`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("클럽 전체", "All clubs", "クラブ一覧", "全部夜店", "全部夜店")}
          </Link>
        </nav>
      </div>

      {/* 예약 CTA — 클럽 상세 페이지와 동일한 하단 sticky 패턴 */}
      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <Link
          data-nf-track="book_cta" href={`/flags/new?lang=${lang}`}
          className="flex items-center justify-center w-full max-w-lg mx-auto py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors"
        >
          🍾 {t("나플로 예약하기", "Book with NightFlow", "NightFlowで予約", "用 NightFlow 预订", "用 NightFlow 預訂")}
        </Link>
      </div>
    </div>
  );
}
