import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { createClient } from "@/lib/supabase/server";
import { type Lang, makeT } from "@/lib/i18n";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";

// "서울 클럽 영업시간" 검색 대응.
// DB에 96/97곳의 실제 영업시간이 있어 근거가 가장 강한 축이다.
// 집계 수치(22:00 오픈 40곳, 05:00 마감 29곳 등)는 렌더 시점에 실제로 계산한다 —
// 하드코딩하면 데이터가 바뀔 때 거짓말이 된다.

const AREA_ORDER = ["이태원", "홍대", "강남", "부산"] as const;

type Row = { name_en: string | null; name: string; area: string; operating_hours: string | null; google_review_count: number | null };

/** "22:00-05:00" 같은 구간을 모두 뽑아 오픈/마감 시각 빈도를 센다. */
function tally(rows: Row[]) {
  const opens: Record<string, number> = {};
  const closes: Record<string, number> = {};
  for (const c of rows) {
    for (const m of (c.operating_hours ?? "").matchAll(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/g)) {
      const o = `${m[1].padStart(2, "0")}:${m[2]}`;
      const cl = `${m[3].padStart(2, "0")}:${m[4]}`;
      opens[o] = (opens[o] ?? 0) + 1;
      closes[cl] = (closes[cl] ?? 0) + 1;
    }
  }
  const top = (o: Record<string, number>) =>
    Object.entries(o).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return { opens, closes, topOpen: top(opens), topClose: top(closes) };
}

export async function ClubHoursPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const supabase = await createClient();
  const { data } = await supabase
    .from("clubs")
    .select("name_en, name, area, operating_hours, google_review_count")
    .eq("status", "approved")
    .is("deleted_at", null)
    .eq("is_test", false)
    .eq("hidden_from_guide", false);

  const rows = ((data ?? []) as Row[]).filter((c) => c.operating_hours?.trim());
  const { topOpen, topClose } = tally(rows);
  const lateCount = rows.filter((c) =>
    /0[6-9]:\d{2}/.test(c.operating_hours ?? "")
  ).length;

  const areaLabel: Record<string, string> = {
    이태원: t("이태원", "Itaewon", "梨泰院", "梨泰院", "梨泰院"),
    홍대: t("홍대", "Hongdae", "弘大", "弘大", "弘大"),
    강남: t("강남", "Gangnam", "江南", "江南", "江南"),
    부산: t("부산", "Busan", "釜山", "釜山", "釜山"),
  };

  const byArea = AREA_ORDER.map((area) => ({
    area,
    clubs: rows
      .filter((c) => c.area === area)
      .sort((a, b) => (b.google_review_count ?? 0) - (a.google_review_count ?? 0))
      .slice(0, 8),
  })).filter((a) => a.clubs.length > 0);

  const faqs = [
    {
      q: t("서울 클럽은 몇 시에 여나요?", "What time do Seoul clubs open?", "ソウルのクラブは何時に開きますか？", "首尔夜店几点开门?", "首爾夜店幾點開門?"),
      a: t(
        `대부분 ${topOpen[0]}에 엽니다(${topOpen[1]}곳). 다만 자정 전에는 한산해서, 실제로 붐비기 시작하는 건 새벽 1시 무렵입니다.`,
        `Most open at ${topOpen[0]} (${topOpen[1]} venues). But it stays quiet until midnight — the room really fills around 1am.`,
        `ほとんどが${topOpen[0]}オープン（${topOpen[1]}店）。ただし24時前は空いていて、本格的に混むのは深夜1時ごろです。`,
        `大多数${topOpen[0]}开门(${topOpen[1]}家)。但午夜前人很少,真正热闹是凌晨1点左右。`,
        `大多數${topOpen[0]}開門(${topOpen[1]}家)。但午夜前人很少,真正熱鬧是凌晨1點左右。`
      ),
    },
    {
      q: t("몇 시에 닫나요?", "What time do they close?", "何時に閉まりますか？", "几点关门?", "幾點關門?"),
      a: t(
        `가장 흔한 마감은 ${topClose[0]}입니다(${topClose[1]}곳). ${lateCount}곳은 아침 6시 이후까지 엽니다.`,
        `The most common closing time is ${topClose[0]} (${topClose[1]} venues). ${lateCount} run past 6am.`,
        `最も多い閉店時間は${topClose[0]}（${topClose[1]}店）。${lateCount}店は朝6時以降まで営業します。`,
        `最常见的打烊时间是${topClose[0]}(${topClose[1]}家)。有${lateCount}家营业到早上6点以后。`,
        `最常見的打烊時間是${topClose[0]}(${topClose[1]}家)。有${lateCount}家營業到早上6點以後。`
      ),
    },
    {
      q: t("평일에도 여나요?", "Are they open on weekdays?", "平日も営業していますか？", "平日也开吗?", "平日也開嗎?"),
      a: t(
        "여는 곳은 많지만 금·토와 분위기가 완전히 다릅니다. 평일은 일찍 닫거나 아예 쉬는 곳도 있으니 아래에서 확인하세요.",
        "Many are, but the room is nothing like Friday or Saturday. Some close early or shut entirely on weekdays — check below.",
        "営業している店は多いですが、金・土とは雰囲気がまったく違います。平日は早く閉めたり休む店もあるので下で確認してください。",
        "不少店开,但气氛和周五周六完全不同。平日有些提早打烊或干脆休息,请在下面确认。",
        "不少店開,但氣氛和週五週六完全不同。平日有些提早打烊或乾脆休息,請在下面確認。"
      ),
    },
    {
      q: t("몇 시에 가는 게 좋나요?", "When should I actually show up?", "何時に行くのがいいですか？", "几点去比较好?", "幾點去比較好?"),
      a: t(
        "테이블이 있으면 자정 전후가 편합니다. 입장만 할 계획이면 새벽 1~2시가 가장 붐비고, 그 시간엔 줄이 길어질 수 있습니다.",
        "With a table, arriving around midnight is comfortable. If you're just going in, 1–2am is the peak — and the queue can get long then.",
        "テーブルがあるなら24時前後が快適です。入場だけなら深夜1〜2時がピークで、その時間は列が長くなることがあります。",
        "有卡座的话午夜前后比较从容。只是入场的话凌晨1–2点最热闹,那时排队可能很长。",
        "有包廂的話午夜前後比較從容。只是入場的話凌晨1–2點最熱鬧,那時排隊可能很長。"
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
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="guide" lang={lang} meta={{ guide: "hours" }} />

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link data-nf-track="breadcrumb_home" href={`/${lang}`} className="hover:text-foreground">NightFlow</Link>
          <span>/</span>
          <span className="text-foreground font-bold">
            {t("영업시간", "Opening hours", "営業時間", "营业时间", "營業時間")}
          </span>
        </nav>

        <header className="space-y-3">
          <h1 className="text-[30px] font-black tracking-tight leading-tight break-keep">
            {t(
              "서울 클럽 영업시간",
              "Seoul club opening hours",
              "ソウルのクラブ営業時間",
              "首尔夜店营业时间",
              "首爾夜店營業時間"
            )}
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed break-keep">
            {t(
              `클럽 ${rows.length}곳의 실제 영업시간입니다. 언제 열고 언제 닫는지, 그리고 몇 시에 가야 하는지까지.`,
              `Actual hours from ${rows.length} clubs — when they open, when they close, and when you should actually turn up.`,
              `${rows.length}店の実際の営業時間。何時に開いて何時に閉まるか、そして何時に行くべきかまで。`,
              `${rows.length}家夜店的实际营业时间。几点开、几点关,以及你该几点到。`,
              `${rows.length}家夜店的實際營業時間。幾點開、幾點關,以及你該幾點到。`
            )}
          </p>
        </header>

        <section className="rounded-2xl bg-card border border-border p-5 space-y-2">
          <h2 className="text-[15px] font-black text-brand-amber">
            {t("한 줄 요약", "The short answer", "ひとことで言うと", "简单来说", "簡單來說")}
          </h2>
          <p className="text-[15px] leading-relaxed break-keep">
            {t(
              `대부분 ${topOpen[0]}에 열고 ${topClose[0]}에 닫습니다. 하지만 자정 전에 가면 텅 비어 있습니다 — 진짜는 새벽 1시부터입니다.`,
              `Most open at ${topOpen[0]} and close at ${topClose[0]}. But show up before midnight and it's empty — the night really starts at 1am.`,
              `ほとんどが${topOpen[0]}に開いて${topClose[0]}に閉まります。でも24時前に行くとガラガラです — 本番は深夜1時からです。`,
              `大多数${topOpen[0]}开门、${topClose[0]}打烊。但午夜前去会空荡荡 — 真正的夜晚从凌晨1点开始。`,
              `大多數${topOpen[0]}開門、${topClose[0]}打烊。但午夜前去會空蕩蕩 — 真正的夜晚從凌晨1點開始。`
            )}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-black tracking-tight">
            {t("지역별 영업시간", "Hours by district", "エリア別の営業時間", "各区域营业时间", "各區域營業時間")}
          </h2>
          {byArea.map((a) => {
            const areaSlug = canonicalAreaSlug(a.area);
            return (
              <div key={a.area} className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <h3 className="text-[17px] font-black">{areaLabel[a.area] ?? a.area}</h3>
                <ul className="space-y-2">
                  {a.clubs.map((c) => {
                    const nameEn = c.name_en?.trim();
                    const slug = nameEn ? clubSlug(nameEn) : null;
                    return (
                      <li key={c.name} className="flex items-start justify-between gap-3 text-[13px]">
                        {slug && areaSlug ? (
                          <Link data-nf-track="club_detail" href={`/${lang}/clubs/${areaSlug}/${slug}`} className="font-bold hover:text-brand-amber transition-colors shrink-0">
                            {nameEn}
                          </Link>
                        ) : (
                          <span className="font-bold shrink-0">{nameEn || c.name}</span>
                        )}
                        <span className="text-right text-muted-foreground">
                          {translateClubMeta(c.operating_hours ?? "", lang)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {areaSlug && (
                  <Link data-nf-track="area_list" href={`/${lang}/clubs/${areaSlug}`} className="inline-block text-[12px] text-brand-amber underline underline-offset-2">
                    {t("전체 보기", "See all", "すべて見る", "查看全部", "查看全部")} →
                  </Link>
                )}
              </div>
            );
          })}
        </section>

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

        <nav className="flex flex-wrap gap-2">
          <Link data-nf-track="guide_prices" href={`/${lang}/club-prices`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("입장료", "Entry fees", "入場料", "入场费", "入場費")}
          </Link>
          <Link data-nf-track="guide_entry_rules" href={`/${lang}/club-entry-rules`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("입장 규정", "Entry rules", "入場ルール", "入场规定", "入場規定")}
          </Link>
          <Link data-nf-track="guide_dress_code" href={`/${lang}/dress-code`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("드레스코드", "Dress code", "ドレスコード", "着装要求", "服裝規定")}
          </Link>
          <Link href={`/${lang}/clubs`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("클럽 전체", "All clubs", "クラブ一覧", "全部夜店", "全部夜店")}
          </Link>
        </nav>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 pb-4 pb-safe bg-card/95 backdrop-blur-sm border-t border-border">
        <Link data-nf-track="book_cta" href={`/flags/new?lang=${lang}`} className="flex items-center justify-center w-full max-w-lg mx-auto py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors">
          🍾 {t("나플로 예약하기", "Book with NightFlow", "NightFlowで予約", "用 NightFlow 预订", "用 NightFlow 預訂")}
        </Link>
      </div>
    </div>
  );
}
