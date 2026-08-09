import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type Lang, makeT } from "@/lib/i18n";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";

// "서울 클럽 드레스코드 / 뭐 입고 가야 하나" 검색 대응.
//
// ⚠️ 다른 페이지와 달리 DB 근거가 약하다 — dresscode 컬럼이 채워진 곳이 몇 곳뿐이다.
// 그래서 "클럽 N곳 데이터" 식으로 과장하지 않고, 명시된 곳만 실제 문구 그대로 인용하고
// 나머지는 지역별 통념으로 설명한다. 명시된 곳들의 공통점이 전부 '신발' 규정이라는 점은
// 그 자체로 유용한 사실이라 전면에 세운다.

type Row = { name_en: string | null; name: string; area: string; dresscode: string | null };

export async function DressCodePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("name_en, name, area, dresscode")
    .eq("status", "approved")
    .is("deleted_at", null)
    .eq("is_test", false)
    .eq("hidden_from_guide", false);

  const stated = ((data ?? []) as Row[]).filter((c) => c.dresscode?.trim());

  const areaLabel: Record<string, string> = {
    이태원: t("이태원", "Itaewon", "梨泰院", "梨泰院", "梨泰院"),
    홍대: t("홍대", "Hongdae", "弘大", "弘大", "弘大"),
    강남: t("강남", "Gangnam", "江南", "江南", "江南"),
    부산: t("부산", "Busan", "釜山", "釜山", "釜山"),
  };

  const districts = [
    {
      area: "강남",
      tone: t(
        "가장 깐깐합니다. 반바지·슬리퍼·트레이닝복은 남성 기준 거절 사유가 될 수 있습니다. 셔츠나 깔끔한 니트에 구두·클린한 스니커즈면 무난합니다.",
        "The strictest. Shorts, slippers and sweatpants can get men turned away. A shirt or clean knit with dress shoes or clean sneakers is safe.",
        "最も厳しいです。ショートパンツ・スリッパ・スウェットは男性の場合断られることがあります。シャツやきれいなニットに革靴・清潔なスニーカーなら無難です。",
        "最严格。短裤、拖鞋、运动裤可能让男性被拒。衬衫或干净针织衫配皮鞋或干净球鞋比较稳。",
        "最嚴格。短褲、拖鞋、運動褲可能讓男性被拒。襯衫或乾淨針織衫配皮鞋或乾淨球鞋比較穩。"
      ),
    },
    {
      area: "홍대",
      tone: t(
        "가장 자유롭습니다. 청바지에 스니커즈면 충분하고, 학생·젊은 층이 많아 스트릿 웨어가 오히려 자연스럽습니다.",
        "The most relaxed. Jeans and sneakers are plenty — the crowd skews young and streetwear fits right in.",
        "最も自由です。ジーンズにスニーカーで十分で、学生や若い層が多くストリートウェアがむしろ自然です。",
        "最自由。牛仔裤配球鞋就够了,客群偏年轻,街头风反而很自然。",
        "最自由。牛仔褲配球鞋就夠了,客群偏年輕,街頭風反而很自然。"
      ),
    },
    {
      area: "이태원",
      tone: t(
        "중간이고 국제적입니다. 외국인 손님이 많아 스타일 폭이 넓지만, 신발만은 슬리퍼를 피하세요.",
        "In between, and international. The crowd is mixed so style range is wide — just keep slippers off your feet.",
        "中間で国際的です。外国人客が多くスタイルの幅は広いですが、靴だけはスリッパを避けてください。",
        "居中且国际化。外国客人多,风格范围宽,但鞋子别穿拖鞋。",
        "居中且國際化。外國客人多,風格範圍寬,但鞋子別穿拖鞋。"
      ),
    },
    {
      area: "부산",
      tone: t(
        "해변 도시라 전반적으로 캐주얼하지만, 클럽 안에서는 여전히 슬리퍼가 걸립니다.",
        "Beach city, so casual overall — but slippers still catch you at club doors.",
        "ビーチ都市なので全体的にカジュアルですが、クラブでは依然としてスリッパが引っかかります。",
        "海滨城市整体休闲,但夜店门口拖鞋依然会被挡。",
        "海濱城市整體休閒,但夜店門口拖鞋依然會被擋。"
      ),
    },
  ];

  const faqs = [
    {
      q: t("서울 클럽 드레스코드가 어떻게 되나요?", "What's the dress code for Seoul clubs?", "ソウルのクラブのドレスコードは？", "首尔夜店的着装要求是什么?", "首爾夜店的服裝規定是什麼?"),
      a: t(
        "지역마다 다릅니다. 강남이 가장 깐깐하고 홍대가 가장 자유롭습니다. 다만 어디를 가든 슬리퍼·쪼리는 피하는 게 맞습니다.",
        "It depends on the district. Gangnam is strictest, Hongdae the most relaxed. Wherever you go though, skip the slippers and flip-flops.",
        "エリアによって違います。江南が最も厳しく、弘大が最も自由です。ただしどこへ行くにもスリッパ・ビーチサンダルは避けてください。",
        "因区域而异。江南最严,弘大最松。但不管去哪,别穿拖鞋和人字拖。",
        "因區域而異。江南最嚴,弘大最鬆。但不管去哪,別穿拖鞋和夾腳拖。"
      ),
    },
    {
      q: t("반바지 입고 가도 되나요?", "Can I wear shorts?", "ショートパンツでも大丈夫ですか？", "可以穿短裤吗?", "可以穿短褲嗎?"),
      a: t(
        "홍대·이태원은 여름에 흔합니다. 강남은 남성 반바지를 거절하는 곳이 있으니, 강남 계획이면 긴바지가 안전합니다.",
        "Common in Hongdae and Itaewon in summer. Some Gangnam venues turn men away in shorts, so long trousers are the safe call there.",
        "弘大・梨泰院では夏によく見ます。江南は男性のショートパンツを断る店があるので、江南の予定なら長ズボンが安全です。",
        "弘大和梨泰院夏天很常见。江南有些店拒绝穿短裤的男性,去江南的话长裤更稳。",
        "弘大和梨泰院夏天很常見。江南有些店拒絕穿短褲的男性,去江南的話長褲更穩。"
      ),
    },
    {
      q: t("여성도 드레스코드가 있나요?", "Is there a dress code for women?", "女性にもドレスコードはありますか？", "女性也有着装要求吗?", "女性也有服裝規定嗎?"),
      a: t(
        "훨씬 느슨합니다. 강남은 차려입는 분위기가 있지만 요즘은 깔끔한 스트릿 웨어도 문제없습니다. 신발 규정은 남녀 공통입니다.",
        "Much looser. Gangnam leans dressed-up, but polished streetwear is fine these days. The footwear rule applies to everyone.",
        "はるかに緩いです。江南はドレスアップの雰囲気がありますが、最近はきれいめストリートでも問題ありません。靴の規定は男女共通です。",
        "宽松得多。江南偏爱盛装,但现在干净的街头风也没问题。鞋子的规定男女都一样。",
        "寬鬆得多。江南偏愛盛裝,但現在乾淨的街頭風也沒問題。鞋子的規定男女都一樣。"
      ),
    },
    {
      q: t("문 앞에서 거절당하면 어떻게 하나요?", "What if I get turned away?", "入口で断られたらどうすればいいですか？", "如果被拒怎么办?", "如果被拒怎麼辦?"),
      a: t(
        "그 자리에서 설득하기는 어렵습니다. 테이블을 미리 예약해두면 애초에 이 상황이 생기지 않습니다 — 예약자는 문 앞 판단 대상이 아닙니다.",
        "Arguing at the door rarely works. Booking a table in advance avoids the situation entirely — reserved guests aren't subject to door screening.",
        "その場で説得するのは難しいです。テーブルを事前に予約しておけばこの状況自体が起きません — 予約客は入口の判断対象ではありません。",
        "在门口争论几乎没用。提前订好卡座就不会遇到这种情况 — 有预订的客人不在门口筛选之列。",
        "在門口爭論幾乎沒用。提前訂好包廂就不會遇到這種情況 — 有預訂的客人不在門口篩選之列。"
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
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link href={`/${lang}`} className="hover:text-foreground">NightFlow</Link>
          <span>/</span>
          <span className="text-foreground font-bold">
            {t("드레스코드", "Dress code", "ドレスコード", "着装要求", "服裝規定")}
          </span>
        </nav>

        <header className="space-y-3">
          <h1 className="text-[30px] font-black tracking-tight leading-tight break-keep">
            {t(
              "서울 클럽, 뭐 입고 가야 하나요?",
              "What to wear to a Seoul club",
              "ソウルのクラブ、何を着ていく？",
              "首尔夜店该穿什么?",
              "首爾夜店該穿什麼?"
            )}
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed break-keep">
            {t(
              "지역마다 기준이 다릅니다. 강남은 깐깐하고 홍대는 자유롭습니다 — 다만 딱 하나는 어디서나 같습니다.",
              "The bar is different by district — Gangnam is strict, Hongdae is not. But one rule holds everywhere.",
              "エリアごとに基準が違います。江南は厳しく、弘大は自由 — ただしひとつだけはどこでも同じです。",
              "各区域标准不同。江南严格,弘大自由 — 但有一条哪里都一样。",
              "各區域標準不同。江南嚴格,弘大自由 — 但有一條哪裡都一樣。"
            )}
          </p>
        </header>

        <section className="rounded-2xl bg-card border border-border p-5 space-y-2">
          <h2 className="text-[15px] font-black text-brand-amber">
            {t("한 줄 요약", "The short answer", "ひとことで言うと", "简单来说", "簡單來說")}
          </h2>
          <p className="text-[15px] leading-relaxed break-keep">
            {t(
              "신발만 신경 쓰면 대부분 해결됩니다. 드레스코드를 명시한 클럽들의 규정이 전부 슬리퍼·쪼리 금지였습니다 — 상의보다 발이 먼저 걸립니다.",
              "Get your shoes right and you're mostly fine. Every club here that spells out a dress code writes the same thing: no slippers, no flip-flops. Your feet get judged before your shirt does.",
              "靴さえ気をつければほとんど解決します。ドレスコードを明記しているクラブの規定はすべてスリッパ・ビーチサンダル禁止でした — トップスより足元が先に見られます。",
              "把鞋穿对基本就没事。所有明确写出着装要求的夜店,写的都是同一件事:不能穿拖鞋、人字拖。鞋子比上衣先被看。",
              "把鞋穿對基本就沒事。所有明確寫出服裝規定的夜店,寫的都是同一件事:不能穿拖鞋、夾腳拖。鞋子比上衣先被看。"
            )}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[20px] font-black tracking-tight">
            {t("지역별 기준", "By district", "エリア別の基準", "各区域标准", "各區域標準")}
          </h2>
          {districts.map((d) => {
            const slug = canonicalAreaSlug(d.area);
            return (
              <div key={d.area} className="rounded-2xl bg-card border border-border p-4 space-y-2">
                <h3 className="text-[17px] font-black">{areaLabel[d.area] ?? d.area}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{d.tone}</p>
                {slug && (
                  <Link href={`/${lang}/clubs/${slug}`} className="inline-block text-[12px] text-brand-amber underline underline-offset-2">
                    {areaLabel[d.area]} {t("클럽 보기", "clubs", "のクラブ", "夜店", "夜店")} →
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        {/* 실제로 규정을 명시한 클럽만 원문 그대로 — 개수가 적으므로 부풀리지 않는다 */}
        {stated.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[20px] font-black tracking-tight">
              {t("드레스코드를 명시한 클럽", "Clubs that state a dress code", "ドレスコードを明記しているクラブ", "明确写出着装要求的夜店", "明確寫出服裝規定的夜店")}
            </h2>
            <ul className="space-y-2">
              {stated.map((c) => {
                const nameEn = c.name_en?.trim();
                const areaSlug = canonicalAreaSlug(c.area);
                const slug = nameEn ? clubSlug(nameEn) : null;
                return (
                  <li key={c.name} className="flex items-start justify-between gap-3 text-[13px] rounded-xl bg-card border border-border p-3">
                    {slug && areaSlug ? (
                      <Link href={`/${lang}/clubs/${areaSlug}/${slug}`} className="font-bold hover:text-brand-amber transition-colors shrink-0">
                        {nameEn}
                      </Link>
                    ) : (
                      <span className="font-bold shrink-0">{nameEn || c.name}</span>
                    )}
                    <span className="text-right text-muted-foreground">
                      {translateClubMeta(c.dresscode ?? "", lang)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">
              {t(
                "나머지 클럽은 드레스코드를 따로 공지하지 않습니다 — 문 앞 재량으로 판단합니다.",
                "The rest don't publish a dress code — it's left to door discretion.",
                "その他のクラブはドレスコードを公示していません — 入口の裁量で判断されます。",
                "其他夜店没有公布着装要求 — 由门口自行判断。",
                "其他夜店沒有公布服裝規定 — 由門口自行判斷。"
              )}
            </p>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-[20px] font-black tracking-tight">
            {t("자주 묻는 질문", "Common questions", "よくある質問", "常见问题", "常見問題")}
          </h2>
          {faqs.map((f) => (
            <div key={f.q} className="space-y-1">
              <h3 className="text-[15px] font-bold break-keep">{f.q}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{f.a}</p>
            </div>
          ))}
        </section>

        <nav className="flex flex-wrap gap-2">
          <Link href={`/${lang}/club-entry-rules`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("입장 규정", "Entry rules", "入場ルール", "入场规定", "入場規定")}
          </Link>
          <Link href={`/${lang}/club-prices`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("입장료", "Entry fees", "入場料", "入场费", "入場費")}
          </Link>
          <Link href={`/${lang}/club-hours`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("영업시간", "Opening hours", "営業時間", "营业时间", "營業時間")}
          </Link>
          <Link href={`/${lang}/clubs`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("클럽 전체", "All clubs", "クラブ一覧", "全部夜店", "全部夜店")}
          </Link>
        </nav>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <Link href={`/flags/new?lang=${lang}`} className="flex items-center justify-center w-full max-w-lg mx-auto py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors">
          🍾 {t("나플로 예약하기", "Book with NightFlow", "NightFlowで予約", "用 NightFlow 预订", "用 NightFlow 預訂")}
        </Link>
      </div>
    </div>
  );
}
