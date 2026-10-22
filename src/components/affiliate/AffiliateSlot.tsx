"use client";

// 페이지가 부르는 단일 진입점. 문맥(언어·지역·공연)으로 쿠팡/아고다를 고르고 모양을 정한다.
// 규칙은 lib/affiliate/config.ts decideAffiliate 한 곳에만 있다.

import { decideAffiliate, toAffArea, type AffLang } from "@/lib/affiliate/config";
import { AREA_LABEL } from "@/lib/affiliate/agoda";
import { CoupangSlot } from "./CoupangSlot";
import { AgodaStrip } from "./AgodaStrip";

export interface AffiliateSlotProps {
  placement: string;
  lang?: AffLang;
  area?: string | null;
  event?: { date: string; dateEnd?: string | null; title?: string | null; venueType?: string | null } | null;
  /** 쿠팡일 때 모양 */
  coupangVariant: "rail" | "grid" | "band";
  coupangTitle: string;
  coupangSubtitle?: string;
  /** 아고다일 때 문구(없으면 기본) */
  agodaTitle?: string;
  agodaSubtitle?: string;
  /** 숙소 체크인(공연·예약 날짜) */
  checkIn?: string | null;
  nights?: number;
  adults?: number;
  className?: string;
}

const DEFAULT_AGODA_TITLE: Record<AffLang, (area: string) => string> = {
  ko: (a) => `${a}에서 놀고 바로 체크인`,
  en: (a) => `Stay near ${a}`,
  ja: (a) => `${a}周辺に泊まる`,
  zh: (a) => `住在${a}附近`,
  "zh-tw": (a) => `住在${a}附近`,
};

export function AffiliateSlot(props: AffiliateSlotProps) {
  const lang = props.lang ?? "ko";
  const kind = decideAffiliate({ lang, area: props.area, event: props.event ?? null });

  if (kind === "agoda") {
    const areaName = AREA_LABEL[toAffArea(props.area)][lang];
    return (
      <AgodaStrip
        lang={lang}
        placement={props.placement}
        area={props.area}
        title={props.agodaTitle ?? DEFAULT_AGODA_TITLE[lang](areaName)}
        subtitle={props.agodaSubtitle}
        stay={{ checkIn: props.checkIn ?? props.event?.date ?? null, nights: props.nights, adults: props.adults }}
        className={props.className}
      />
    );
  }
  return (
    <CoupangSlot
      variant={props.coupangVariant}
      placement={props.placement}
      area={props.area}
      title={props.coupangTitle}
      subtitle={props.coupangSubtitle}
      className={props.className}
    />
  );
}
