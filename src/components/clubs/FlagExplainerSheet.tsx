"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown } from "lucide-react";
import { areaLabel, makeT, type Lang } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics/events";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 클럽 지역 (강남/홍대/이태원 등). 없으면 "주변"으로 표기 */
  area?: string | null;
  /** 진입 클럽명 — "여기 포함" 안심 문구용 */
  clubName: string;
  /** 깃발 작성 링크 (비로그인 시 로그인 리다이렉트 포함) */
  ctaHref: string;
  /** 외국인 트랙 언어. 기본 ko */
  lang?: Lang;
}

/**
 * 클럽 상세에서 "예약하기"를 누른 최초 유저에게 깃발(지역 역경매) 메커니즘을
 * 익숙한 언어로 설명하는 가이드 시트.
 * 1. 날짜·인원·예산 올리기
 * 2. 지역 클럽 MD들이 앞다퉈 제안 (진입 클럽 포함)
 * 3. 골라서 직접 연락
 * → CTA에서 처음으로 '깃발' 용어 등장
 */
export function FlagExplainerSheet({ open, onOpenChange, area, clubName, ctaHref, lang = "ko" }: Props) {
  const t = makeT(lang);

  // 시트 열림 이벤트 (전환퍼널: CTA 클릭 → 시트 오픈)
  useEffect(() => {
    if (open) {
      trackEvent("flag_explainer_open", {
        club_name: clubName,
        area: area ?? null,
        lang,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const trimmedArea = area?.trim() || "";
  const areaLocalized = trimmedArea ? areaLabel(trimmedArea, lang) : "";
  const areaText = areaLocalized || t("주변", "Nearby", "近く", "附近");
  const areaTitle = areaLocalized
    ? t(`${areaLocalized} 클럽`, `${areaLocalized} clubs`, `${areaLocalized}のクラブ`, `${areaLocalized}的夜店`)
    : t("클럽", "clubs", "クラブ", "夜店");

  const headline = t(
    `🎉 ${areaTitle}, 요즘은 이렇게 예약해요`,
    `🎉 Book ${areaTitle} the smart way`,
    `🎉 いまどきの${areaTitle}予約はこう`,
    `🎉 现在这样预订${areaTitle}`,
  );
  const subheadline = t(
    "예약금 없이 여러 곳 제안 받고 골라요",
    "No deposit — compare offers from multiple clubs",
    "予約金なしで複数のクラブからオファーを比較",
    "无预付款，多家夜店同时报价，任你挑选",
  );
  const step1Title = t(
    "원하는 날짜·인원·예산 정하기",
    "Pick your date, group size, budget",
    "希望の日付・人数・予算を入力",
    "选择日期、人数与预算",
  );
  const step1Example = t(
    `"${areaText}, 토요일 4명, 15만원🚩"`,
    `"${areaText}, Saturday, 4 people, ₩150,000🚩"`,
    `"${areaText}, 土曜 4人, ₩150,000🚩"`,
    `"${areaText}, 周六 4人, ₩150,000🚩"`,
  );
  const step2Title = t(
    `${areaText} 클럽들이 앞다퉈 제안`,
    `${areaText} clubs race to offer you deals`,
    `${areaText}のクラブが競って提案`,
    `${areaText}的夜店争相报价`,
  );
  const step2IncludeLabel = t(
    `${clubName} 포함`,
    `Including ${clubName}`,
    `${clubName}を含む`,
    `包括 ${clubName}`,
  );
  const step2Rest = t(
    "여러 클럽이 예산에 맞는 패키지 제안 → 비교해서 골라요",
    "multiple clubs send packages matched to your budget — compare and pick",
    "複数クラブが予算に合ったパッケージを提案 → 比較して選択",
    "多家夜店按预算送来套餐 → 对比后选择",
  );
  const step3Title = t(
    "마음에 드는 제안 골라 채팅 상담 후 결정!",
    "Pick your favorite offer, chat with the club, and confirm!",
    "気に入った提案を選び、チャットで相談して決定！",
    "选中喜欢的报价，直接聊天确认!",
  );
  const ctaLabel = t("제안 받아보기", "Get offers", "オファーを受け取る", "获取报价");
  const sheetTitle = t(
    `${areaTitle} 예약 방법 안내`,
    `How to book ${areaTitle}`,
    `${areaTitle}の予約方法`,
    `如何预订${areaTitle}`,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl !max-h-[90vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-[22px] font-black text-white tracking-tight leading-tight">
              {headline}
            </h2>
            <p className="text-[13px] text-neutral-400 leading-snug">
              {subheadline}
            </p>
          </div>

          {/* Step 1: 조건 올리기 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">1</div>
              <p className="text-[14px] text-white font-bold">{step1Title}</p>
            </div>
            <div className="bg-black/40 rounded-xl px-3 py-2.5">
              <span className="text-neutral-300 text-[13px] font-medium">
                {step1Example}
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 2: MD들이 제안 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">2</div>
              <p className="text-[14px] text-white font-bold">{step2Title}</p>
            </div>
            <p className="text-[13px] text-neutral-300 leading-snug pl-8">
              <span className="text-amber-400 font-bold">{step2IncludeLabel}</span> {step2Rest}
            </p>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 3: 골라서 연락 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0">3</div>
              <p className="text-[14px] text-white font-bold">{step3Title}</p>
            </div>
          </div>

          {/* CTA — 여기서 '깃발' 용어 첫 등장 */}
          <Link
            href={ctaHref}
            onClick={() => {
              trackEvent("flag_explainer_cta_click", {
                club_name: clubName,
                area: area ?? null,
                lang,
              });
              onOpenChange(false);
            }}
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            {ctaLabel}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
