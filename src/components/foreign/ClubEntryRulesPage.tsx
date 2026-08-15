import Link from "next/link";
import { ForeignPageTracker } from "@/components/analytics/ForeignPageTracker";
import { type Lang, makeT } from "@/lib/i18n";

// "한국 클럽 나이 제한 / 여권 필요한가 / 외국인 입장되나" 검색 대응.
//
// ⚠️ 이 페이지는 DB 데이터가 아니라 규정·현장 관행에 기반한다.
// 한국 음주 가능 연령은 "연 나이"(현재 연도 − 출생 연도 ≥ 19) 기준이라 매년 기준 출생연도가
// 바뀐다 — 그래서 연도를 하드코딩하지 않고 렌더 시점에 계산한다.
// 실물 신분증(외국인은 여권/ARC) 확인은 업장 의무라 사진·사본은 통하지 않는다.

export function ClubEntryRulesPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);

  // 연 나이 기준: 올해 − 출생연도 ≥ 19 → 기준 출생연도 = 올해 − 19
  const year = new Date().getFullYear();
  const birthYear = year - 19;

  const faqs = [
    {
      q: t(
        "한국 클럽은 몇 살부터 들어갈 수 있나요?",
        "What's the age limit for clubs in Korea?",
        "韓国のクラブは何歳から入れますか？",
        "韩国夜店几岁可以进?",
        "韓國夜店幾歲可以進?"
      ),
      a: t(
        `만 나이가 아니라 '연 나이' 기준입니다. ${year}년에는 ${birthYear}년생까지 입장 가능합니다(생일과 무관). 클럽에 따라 23세 이상 등 자체 기준을 두는 곳도 있습니다.`,
        `Korea uses "year age", not your exact birthday. In ${year}, anyone born in ${birthYear} or earlier can enter — your birthday doesn't matter. Some clubs set their own higher minimum (23+, for example).`,
        `満年齢ではなく「年年齢」基準です。${year}年は${birthYear}年生まれまで入場可能（誕生日は無関係）。クラブによっては23歳以上など独自基準を設ける場合もあります。`,
        `韩国按"年龄年"算,不看具体生日。${year}年,${birthYear}年及以前出生的都能进。部分夜店有自己更高的门槛(如23岁以上)。`,
        `韓國按「年齡年」算,不看具體生日。${year}年,${birthYear}年及以前出生的都能進。部分夜店有自己更高的門檻(如23歲以上)。`
      ),
    },
    {
      q: t(
        "여권을 꼭 가져가야 하나요?",
        "Do I need my passport?",
        "パスポートは必須ですか？",
        "一定要带护照吗?",
        "一定要帶護照嗎?"
      ),
      a: t(
        "네. 외국인은 여권 또는 외국인등록증(ARC) 실물이 필요합니다. 사진이나 사본은 받아주지 않습니다 — 신분 확인은 업장의 법적 의무라 예외가 거의 없습니다.",
        "Yes. Foreigners need a physical passport or ARC. Photos and photocopies are not accepted — ID checks are a legal obligation for the venue, so there is almost no flexibility.",
        "はい。外国人はパスポートまたは外国人登録証（ARC）の実物が必要です。写真やコピーは不可 — 身分確認は店舗の法的義務なので例外はほぼありません。",
        "需要。外国人必须携带护照或外国人登录证(ARC)原件。照片和复印件不行 — 查证件是场所的法定义务,几乎没有例外。",
        "需要。外國人必須攜帶護照或外國人登錄證(ARC)正本。照片和影本不行 — 查證件是場所的法定義務,幾乎沒有例外。"
      ),
    },
    {
      q: t(
        "외국인도 입장할 수 있나요?",
        "Do Seoul clubs accept foreigners?",
        "外国人も入場できますか？",
        "外国人可以进吗?",
        "外國人可以進嗎?"
      ),
      a: t(
        "대부분 가능하고, 특히 이태원·홍대는 외국인 손님이 많습니다. 다만 일부 업장은 자체 입장 기준(단체 남성만 오는 경우 등)으로 거절하기도 합니다. 미리 예약해두면 이 문제가 대부분 사라집니다.",
        "Most do, and Itaewon and Hongdae in particular are used to international crowds. That said, some venues apply their own door policy and can turn groups away (all-male groups, for instance). Booking ahead removes most of that risk.",
        "ほとんど可能で、特に梨泰院・弘大は外国人客が多いです。ただし一部の店は独自の入場基準（男性だけのグループなど）で断ることもあります。事前に予約しておけばこの問題はほぼなくなります。",
        "大多数可以,尤其梨泰院和弘大很习惯接待外国客人。不过部分场所有自己的门口标准,可能拒绝某些人(比如全是男性的团)。提前预订基本能避免这个问题。",
        "大多數可以,尤其梨泰院和弘大很習慣接待外國客人。不過部分場所有自己的門口標準,可能拒絕某些人(比如全是男性的團)。提前預訂基本能避免這個問題。"
      ),
    },
    {
      q: t(
        "술은 몇 살부터 마실 수 있나요?",
        "What's the legal drinking age?",
        "お酒は何歳から飲めますか？",
        "多少岁可以喝酒?",
        "多少歲可以喝酒?"
      ),
      a: t(
        `클럽 입장 기준과 같습니다 — ${year}년 기준 ${birthYear}년생까지입니다. 입장할 때 확인하므로 별도 절차는 없습니다.`,
        `Same as the club entry rule — in ${year}, born ${birthYear} or earlier. It's checked at the door, so there's no separate step inside.`,
        `クラブの入場基準と同じです — ${year}年基準で${birthYear}年生まれまで。入場時に確認するので店内での別手続きはありません。`,
        `和入场标准一样 — ${year}年是${birthYear}年及以前出生。进门时就查,店内没有额外流程。`,
        `和入場標準一樣 — ${year}年是${birthYear}年及以前出生。進門時就查,店內沒有額外流程。`
      ),
    },
    {
      q: t(
        "혼자 가도 되나요?",
        "Can I go alone?",
        "ひとりで行っても大丈夫ですか？",
        "可以一个人去吗?",
        "可以一個人去嗎?"
      ),
      a: t(
        "됩니다. 홍대에는 혼자 온 손님을 환영한다고 명시한 곳도 있습니다. 다만 남성 혼자는 일부 업장에서 입장이 까다로울 수 있어, 그런 경우 테이블 예약이 확실합니다.",
        "Yes. Some Hongdae venues explicitly welcome solo guests. Solo men can have a harder time at certain doors, though — if that's you, a booked table settles it.",
        "大丈夫です。弘大にはひとり客を歓迎すると明記している店もあります。ただし男性ひとりは一部の店で入りにくいことがあるので、その場合はテーブル予約が確実です。",
        "可以。弘大有些店明确欢迎单人客。不过单身男性在某些门口可能不太容易,这种情况订个卡座最稳。",
        "可以。弘大有些店明確歡迎單人客。不過單身男性在某些門口可能不太容易,這種情況訂個包廂最穩。"
      ),
    },
    {
      q: t(
        "현금이 필요한가요?",
        "Do I need cash?",
        "現金は必要ですか？",
        "需要带现金吗?",
        "需要帶現金嗎?"
      ),
      a: t(
        "대부분 카드가 되지만, 입장료는 현금을 선호하는 곳이 있습니다. 2~3만원 정도는 현금으로 챙겨가면 안전합니다.",
        "Cards work in most places, but some prefer cash for the door fee. Carrying ₩20,000–30,000 in cash is a safe move.",
        "ほとんどカードが使えますが、入場料は現金を好む店もあります。₩20,000〜30,000ほど現金を持っていくと安心です。",
        "大多数能刷卡,但入场费有些店偏好现金。带上₩20,000–30,000现金比较保险。",
        "大多數能刷卡,但入場費有些店偏好現金。帶上₩20,000–30,000現金比較保險。"
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

  const checklist = [
    t("여권 또는 ARC 실물", "Physical passport or ARC", "パスポートまたはARCの実物", "护照或ARC原件", "護照或ARC正本"),
    t(`${birthYear}년생 이전 출생`, `Born ${birthYear} or earlier`, `${birthYear}年生まれ以前`, `${birthYear}年及以前出生`, `${birthYear}年及以前出生`),
    t("현금 2~3만원", "₩20,000–30,000 in cash", "現金₩20,000〜30,000", "₩20,000–30,000现金", "₩20,000–30,000現金"),
    t("슬리퍼·쪼리 금지", "No slippers or flip-flops", "スリッパ・ビーチサンダル不可", "不能穿拖鞋、人字拖", "不能穿拖鞋、夾腳拖"),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 pb-safe">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* SEO 유입 계측 — 서버 컴포넌트라 훅을 못 써서 별도 트래커를 얹음 */}
      <ForeignPageTracker kind="guide" lang={lang} meta={{ guide: "entry_rules" }} />

      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
        <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-wrap">
          <Link data-nf-track="breadcrumb_home" href={`/${lang}`} className="hover:text-foreground">NightFlow</Link>
          <span>/</span>
          <span className="text-foreground font-bold">
            {t("입장 규정", "Entry rules", "入場ルール", "入场规定", "入場規定")}
          </span>
        </nav>

        <header className="space-y-3">
          <h1 className="text-[30px] font-black tracking-tight leading-tight break-keep">
            {t(
              "나이·여권·입장 규정",
              "Age, passport and entry rules",
              "年齢・パスポート・入場ルール",
              "年龄、护照和入场规定",
              "年齡、護照和入場規定"
            )}
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed break-keep">
            {t(
              "문 앞에서 막히지 않으려면 알아야 할 것들. 나이 기준부터 신분증, 외국인 입장까지.",
              "What you need so you don't get stopped at the door — age rules, ID, and whether foreigners get in.",
              "入口で止められないために知っておくこと。年齢基準から身分証、外国人の入場まで。",
              "为了不被拦在门口该知道的事 — 年龄标准、证件,以及外国人能不能进。",
              "為了不被攔在門口該知道的事 — 年齡標準、證件,以及外國人能不能進。"
            )}
          </p>
        </header>

        {/* 체크리스트 — 스니펫으로 잡히기 좋고, 실제로 가장 쓸모 있는 형태 */}
        <section className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-[15px] font-black text-brand-amber">
            {t("가기 전 체크리스트", "Before you go", "行く前のチェックリスト", "出发前清单", "出發前清單")}
          </h2>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[15px] leading-relaxed break-keep">
                <span className="text-money shrink-0">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>

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

        <section className="rounded-2xl bg-card border border-border p-5 space-y-2">
          <h2 className="text-[17px] font-black">
            {t("문 앞에서 막히는 게 걱정된다면", "Worried about the door?", "入口が心配なら", "担心进不去?", "擔心進不去?")}
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
            {t(
              "테이블을 미리 잡아두면 입장 여부를 걱정할 일이 없습니다. 저희가 클럽에 직접 확인해드립니다.",
              "A table booked in advance takes the door question off the table entirely. We confirm it with the club for you.",
              "テーブルを事前に押さえておけば入場を心配する必要はありません。私たちがクラブに直接確認します。",
              "提前订好卡座就不用担心能不能进。我们会直接向夜店确认。",
              "提前訂好包廂就不用擔心能不能進。我們會直接向夜店確認。"
            )}
          </p>
        </section>

        <nav className="flex flex-wrap gap-2">
          <Link data-nf-track="guide_dress_code" href={`/${lang}/dress-code`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("드레스코드", "Dress code", "ドレスコード", "着装要求", "服裝規定")}
          </Link>
          <Link data-nf-track="guide_prices" href={`/${lang}/club-prices`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("입장료", "Entry fees", "入場料", "入场费", "入場費")}
          </Link>
          <Link data-nf-track="guide_hours" href={`/${lang}/club-hours`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("영업시간", "Opening hours", "営業時間", "营业时间", "營業時間")}
          </Link>
          <Link href={`/${lang}/faq`} className="px-3 py-1.5 rounded-full bg-muted border border-border text-[12px] font-bold hover:text-brand-amber">
            {t("전체 FAQ", "Full FAQ", "FAQ全体", "完整FAQ", "完整FAQ")}
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
