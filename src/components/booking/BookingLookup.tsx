"use client";

// 비로그인 예약조회 화면. 접수번호 + 이메일 → lookup_foreign_request RPC(Migration 691).
//
// 접수확인 메일의 "예약조회" 버튼이 두 값을 채워 보내므로 손님은 보통 아무것도
// 입력하지 않는다(프리필이면 자동으로 한 번 조회한다). 직접 들어온 손님만 입력한다.
//
// 디자인은 폼 Step 4(접수 확인 화면)를 그대로 따른다 — 같은 정보를 같은 모양으로
// 보여줘야 손님이 "내가 아까 본 그 화면"으로 인식한다.

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, Search, ShieldCheck, Instagram, ChevronRight, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { CONTACT_INSTAGRAM } from "@/lib/foreign/contact";

const DATE_LOCALE: Record<Lang, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN", "zh-tw": "zh-TW" };
function formatEventDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(DATE_LOCALE[lang] ?? "en-US", { year: "numeric", month: "short", day: "numeric" });
}

type LookupRow = {
  ref_code: string;
  status: string;
  lang: string | null;
  event_date: string;
  group_size: number;
  club_name: string | null;
  area: string | null;
  selected_menu_total: number | null;
  created_at: string;
  contact_type: string;
  contact_value: string;
  pass_token: string | null;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email", line: "LINE", instagram: "Instagram", whatsapp: "WhatsApp",
  wechat: "WeChat", kakao: "KakaoTalk", telegram: "Telegram",
};

export function BookingLookup({
  lang,
  initialRef,
  initialEmail,
}: {
  lang: Lang;
  initialRef: string;
  initialEmail: string;
}) {
  const t = makeT(lang);
  const [refCode, setRefCode] = useState(initialRef);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  // null = 아직 조회 안 함, "none" = 조회했지만 없음
  const [result, setResult] = useState<LookupRow | "none" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (r: string, e: string) => {
    if (!r.trim() || !e.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("lookup_foreign_request", {
        p_ref: r.trim(),
        p_email: e.trim(),
      });
      if (rpcError) {
        // 레이트리밋만 따로 안내한다 — 나머지는 "못 찾았다"로 합쳐서
        // 어느 쪽이 틀렸는지(이메일 존재 여부) 알려주지 않는다.
        if (rpcError.message?.includes("lookup_rate_limited")) {
          setError(t(
            "조회가 너무 많아요. 1분 뒤에 다시 시도해주세요.",
            "Too many lookups. Please try again in a minute.",
            "照会が多すぎます。1分後にもう一度お試しください。",
            "查询次数过多，请1分钟后重试。",
            "查詢次數過多，請1分鐘後重試。"
          ));
          return;
        }
        throw rpcError;
      }
      const row = Array.isArray(data) ? (data[0] as LookupRow | undefined) : (data as LookupRow | null);
      setResult(row ?? "none");
    } catch {
      setError(t(
        "조회 중 문제가 생겼어요. 잠시 뒤 다시 시도해주세요.",
        "Something went wrong. Please try again shortly.",
        "エラーが発生しました。しばらくしてからお試しください。",
        "出错了，请稍后再试。",
        "出錯了，請稍後再試。"
      ));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 메일 버튼으로 온 손님(?ref=&email=)은 입력 없이 바로 결과를 본다. 한 번만.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (initialRef.trim() && initialEmail.trim()) {
      autoRan.current = true;
      void search(initialRef, initialEmail);
      // 주소창에서 이메일을 지운다 — 남겨두면 GA4 page_location에 손님 이메일이
      // 그대로 쌓인다(GA 약관상 PII 수집 금지). 입력값은 이미 state에 있다.
      try {
        const qs = new URLSearchParams();
        if (lang !== "ko") qs.set("lang", lang);
        const q = qs.toString();
        window.history.replaceState(null, "", `/booking/lookup${q ? `?${q}` : ""}`);
      } catch {
        // replaceState가 막힌 환경(일부 인앱 브라우저)에서는 그냥 둔다.
      }
    }
  }, [initialRef, initialEmail, search, lang]);

  const row = typeof result === "object" && result !== null ? result : null;
  const channel = row ? (CHANNEL_LABEL[row.contact_type] ?? row.contact_type) : "";

  // status: new → contacted → done / cancelled (Migration 454)
  const step = row
    ? row.status === "cancelled" ? -1
      : row.status === "done" ? 2
      : row.status === "contacted" ? 1
      : 0
    : 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1.5">
          <h1 className="text-[24px] font-black text-foreground tracking-tight break-keep">
            {t("예약 조회", "Check my booking", "予約照会", "查询我的预订", "查詢我的預訂")}
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
            {t(
              "접수 번호와 접수할 때 쓴 이메일을 넣으면 진행 상태를 볼 수 있어요. 로그인은 필요 없어요.",
              "Enter your request number and the email you used. No account needed.",
              "受付番号と登録時のメールアドレスを入力してください。アカウントは不要です。",
              "输入请求编号和你填写的邮箱即可查看。无需账号。",
              "輸入請求編號和你填寫的信箱即可查看。無需帳號。"
            )}
          </p>
        </header>

        {/* 입력 */}
        <form
          onSubmit={(ev) => { ev.preventDefault(); void search(refCode, email); }}
          className="space-y-2.5"
        >
          <div className="space-y-1.5">
            <label htmlFor="nf-ref" className="block text-[12px] font-bold text-muted-foreground">
              {t("접수 번호", "Request number", "受付番号", "请求编号", "請求編號")}
            </label>
            <input
              id="nf-ref"
              value={refCode}
              onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              placeholder="NF-A1B2C3"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] font-bold tracking-wider focus:border-amber-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nf-email" className="block text-[12px] font-bold text-muted-foreground">
              {t("이메일", "Email", "メール", "邮箱", "信箱")}
            </label>
            <input
              id="nf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              spellCheck={false}
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !refCode.trim() || !email.trim()}
            className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] flex items-center justify-center gap-2 hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            <Search className="w-[18px] h-[18px]" strokeWidth={2.5} />
            {loading
              ? t("조회 중…", "Checking…", "照会中…", "查询中…", "查詢中…")
              : t("조회하기", "Check", "照会する", "查询", "查詢")}
          </button>
        </form>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-card border border-border px-3.5 py-3">
            <AlertTriangle className="w-4 h-4 text-brand-amber shrink-0 mt-0.5" />
            <p className="text-[13px] text-foreground leading-relaxed break-keep">{error}</p>
          </div>
        )}

        {/* 못 찾음 — 어느 쪽이 틀렸는지는 말하지 않는다. */}
        {result === "none" && !error && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-card border border-border p-4 space-y-1.5">
              <p className="text-[15px] font-black text-foreground break-keep">
                {t("찾을 수 없어요", "We couldn't find that", "見つかりませんでした", "没有找到", "找不到")}
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
                {t(
                  "접수 번호와 이메일이 둘 다 맞아야 열려요. 접수확인 메일에 적힌 NF- 번호를 다시 확인해주세요.",
                  "Both the request number and the email have to match. Check the NF- number in your confirmation email.",
                  "受付番号とメールアドレスの両方が一致する必要があります。確認メールの NF- 番号をご確認ください。",
                  "请求编号和邮箱必须都匹配。请核对确认邮件里的 NF- 编号。",
                  "請求編號和信箱必須都相符。請核對確認信件裡的 NF- 編號。"
                )}
              </p>
            </div>
            <a
              href={`https://ig.me/m/${CONTACT_INSTAGRAM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-12 rounded-full bg-card border border-border text-foreground font-extrabold text-[14px] flex items-center justify-center gap-2 hover:bg-muted transition-colors"
            >
              <Instagram className="w-4 h-4" />
              {t("인스타그램으로 문의", "Ask us on Instagram", "Instagram で問い合わせ", "在 Instagram 咨询", "在 Instagram 詢問")}
            </a>
          </div>
        )}

        {/* 결과 */}
        {row && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center gap-2.5">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center border ${
                step === -1 ? "bg-muted border-border" : "bg-green-500/10 border-green-500/40"
              }`}>
                {step === -1
                  ? <AlertTriangle className="w-7 h-7 text-muted-foreground" strokeWidth={2.5} />
                  : <Check className="w-7 h-7 text-money" strokeWidth={2.5} />}
              </div>
              <h2 className="text-[20px] font-black text-foreground tracking-tight break-keep">
                {step === -1
                  ? t("취소된 요청이에요", "This request was cancelled", "このリクエストはキャンセル済みです", "该请求已取消", "此請求已取消")
                  : step === 2
                  ? t("확정됐어요", "Confirmed", "確定しました", "已确认", "已確認")
                  : step === 1
                  ? t("담당자가 클럽과 조율 중이에요", "We're working with the club", "担当者がクラブと調整中です", "我们正在和夜店沟通", "我們正在和夜店溝通")
                  : t("클럽이 테이블 확인 중이에요", "The club is checking your table", "クラブがテーブルを確認中です", "夜店正在确认桌位", "夜店正在確認包廂")}
              </h2>
              <p className="text-[12px] font-bold text-muted-foreground tabular-nums">
                {t("접수 번호", "Request", "受付番号", "请求编号", "請求編號")} #{row.ref_code}
              </p>
            </div>

            {/* 타임라인 — 폼 Step 4와 같은 3단계 */}
            {step !== -1 && (
              <div className="rounded-2xl bg-card border border-border p-4">
                {[
                  {
                    title: t("접수 완료", "Request received", "受付完了", "已收到请求", "已收到請求"),
                    sub: formatEventDate(row.created_at.slice(0, 10), lang),
                  },
                  {
                    title: t("클럽이 테이블 확인 중", "Club confirming your table", "クラブがテーブルを確認中", "夜店正在确认桌位", "夜店正在確認包廂"),
                    sub: t("보통 하루 안 · 메뉴판 기준으로 가격 검수", "Usually within a day · Price checked against the menu", "通常1日以内 · メニューで価格を照合", "通常一天内 · 按酒单核对价格", "通常一天內 · 依酒單核對價格"),
                  },
                  {
                    title: t(`${channel}로 예약 패스 발송`, `Booking pass on ${channel}`, `${channel} で予約パス`, `通过 ${channel} 发送入场凭证`, `透過 ${channel} 傳送入場憑證`),
                    sub: t("입구에서 여권과 함께 보여주세요", "Show it at the door with your passport", "入口でパスポートと一緒に提示", "入口出示凭证和护照", "入口出示憑證和護照"),
                  },
                ].map((s, i, arr) => {
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${
                          done ? "bg-money" : active ? "bg-amber-400 animate-pulse" : "border-2 border-border"
                        }`}>
                          {done && <Check className="w-3 h-3 text-background" strokeWidth={3} />}
                        </span>
                        {i < arr.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] ${done ? "bg-money" : "bg-border"}`} />}
                      </div>
                      <div className={`space-y-0.5 ${i < arr.length - 1 ? "pb-3.5" : ""}`}>
                        <p className={`text-[14px] font-extrabold ${active ? "text-brand-amber" : done ? "text-foreground" : "text-muted-foreground"}`}>{s.title}</p>
                        <p className="text-[12px] text-muted-foreground break-all">{s.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 요약 */}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-2.5">
              {row.club_name && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("클럽", "Club", "クラブ", "夜店", "夜店")}</span>
                  <span className="font-bold text-foreground text-right">
                    {row.club_name}
                    {row.area ? ` · ${areaLabel(row.area, lang)}` : ""}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("날짜", "Date", "日付", "日期", "日期")}</span>
                <span className="font-bold text-foreground">{formatEventDate(row.event_date, lang)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("인원", "Group", "人数", "人数", "人數")}</span>
                <span className="font-bold text-foreground">
                  {t(`${row.group_size}명`, `${row.group_size} ${row.group_size > 1 ? "people" : "person"}`, `${row.group_size}名`, `${row.group_size}人`, `${row.group_size}人`)}
                </span>
              </div>
              {row.selected_menu_total != null && row.selected_menu_total > 0 && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("총액", "Total", "合計", "总额", "總額")}</span>
                  <span className="font-black text-money tabular-nums">
                    ₩{row.selected_menu_total.toLocaleString("en-US")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("회신", "Reply to", "返信先", "回复到", "回覆到")}</span>
                <span className="font-bold text-foreground break-all text-right">{channel} {row.contact_value}</span>
              </div>
            </div>

            {/* 확정서가 발행됐으면 그 링크가 이 페이지의 결론이다. */}
            {row.pass_token && (
              <Link
                href={`/booking/${row.pass_token}`}
                className="w-full h-14 rounded-full bg-money text-background font-black text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
              >
                <ShieldCheck className="w-[18px] h-[18px]" strokeWidth={2.5} />
                {t("예약 패스 보기", "View my booking pass", "予約パスを見る", "查看入场凭证", "查看入場憑證")}
              </Link>
            )}

            {step !== -1 && !row.pass_token && (
              <p className="text-center text-[12px] text-muted-foreground leading-relaxed break-keep">
                {t(
                  `확정되면 ${channel}로 예약 패스를 보내드려요. 이 페이지는 언제든 다시 열어볼 수 있어요.`,
                  `We'll send your booking pass on ${channel} once it's confirmed. You can reopen this page anytime.`,
                  `確定したら ${channel} で予約パスをお送りします。このページはいつでも再度開けます。`,
                  `确认后我们会通过 ${channel} 发送入场凭证。本页随时可以再打开。`,
                  `確認後我們會透過 ${channel} 傳送入場憑證。本頁隨時可以再打開。`
                )}
              </p>
            )}

            <Link
              href={`/${lang === "ko" ? "en" : lang}/clubs`}
              className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-3 text-[13px] font-bold hover:bg-muted transition-colors"
            >
              <span className="flex-1">
                {t("다른 밤도 계획 중? 클럽 둘러보기", "Planning another night? Browse clubs", "別の夜も？クラブを見る", "还想安排别的夜晚？浏览夜店", "還想安排別的夜晚？瀏覽夜店")}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
