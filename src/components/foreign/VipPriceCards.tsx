"use client";

import { makeT, type Lang } from "@/lib/i18n";
import { krwTo, resolveCurrency } from "@/lib/utils/currency";
import { useKrwRates } from "@/lib/utils/useKrwRates";

// "VIP table · 지역별 시작가" 카드 2장 — /en 홈 히어로(EnHomeClient HeroSection)의 가격 앵커를
// 그대로 옮겼다(2026-09-29). 광고 랜딩(AdLanding)은 서버 컴포넌트라 환율 훅(useKrwRates)을
// 직접 못 써서 이 조각만 클라이언트로 뺐다. 값·문구를 바꿀 땐 홈 쪽 PRICE_ANCHORS·anchorLabel도 같이.
// 금액은 tablePricing.FOREIGN_TABLE_FLOOR(강남 100만·홍대/이태원 50만)와 같다.

const PRICE_ANCHORS = [
  { key: "hongdae", won: 500000 },
  { key: "gangnam", won: 1000000 },
] as const;

export function VipPriceCards({ lang, className = "" }: { lang: Lang; className?: string }) {
  const t = makeT(lang);
  const fx = useKrwRates();
  const currency = resolveCurrency(null, lang);
  const wonShort = (won: number) => (won >= 1000000 ? `₩${won / 1000000}M` : `₩${won / 1000}k`);
  const localOf = (won: number) => (currency ? krwTo(won, currency, fx.rates) : null);
  const anchorLabel: Record<(typeof PRICE_ANCHORS)[number]["key"], { title: string; sub: string }> = {
    hongdae: { title: t("홍대 · 이태원", "Hongdae · Itaewon", "弘大・梨泰院", "弘大·梨泰院", "弘大·梨泰院"), sub: t("₩500k · 보틀 포함", "₩500k · bottle included", "₩500k · ボトル込み", "₩500k · 含酒", "₩500k · 含酒") },
    gangnam: { title: t("강남", "Gangnam", "江南", "江南", "江南"), sub: t("₩1M · 보틀 포함", "₩1M · bottle included", "₩1M · ボトル込み", "₩1M · 含酒", "₩1M · 含酒") },
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-[11px] font-bold text-brand-amber px-1">
        {t("VIP 테이블", "VIP table", "VIPテーブル", "VIP卡座", "VIP包廂")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PRICE_ANCHORS.map((a) => {
          const local = localOf(a.won);
          return (
            <div key={a.key} className="rounded-2xl bg-card border border-border p-3 space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground">{anchorLabel[a.key].title}</p>
              <p className="text-[16px] font-black leading-tight tabular-nums">
                {(() => { const m = local ?? wonShort(a.won); return t(`${m}~`, `from ${m}`, `${m}〜`, `${m} 起`, `${m} 起`); })()}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">{anchorLabel[a.key].sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
