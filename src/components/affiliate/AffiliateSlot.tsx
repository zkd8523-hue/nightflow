"use client";

// 페이지가 부르는 단일 진입점. 문맥(언어·지역·공연)으로 쿠팡/아고다를 고르고 모양을 정한다.
// 규칙은 lib/affiliate/config.ts decideAffiliate 한 곳에만 있다.

import { decideAffiliate, isStayEvent, toAffArea, type AffLang } from "@/lib/affiliate/config";
import { AREA_LABEL } from "@/lib/affiliate/agoda";
import { CoupangSlot } from "./CoupangSlot";
import { AgodaStrip } from "./AgodaStrip";
import { KoStaySlot } from "./KoStaySlot";

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
  /** 클럽 상세면 이름·좌표 — 한국어 숙소 광고의 도보 시간 기준 */
  club?: { name: string; lat?: number | null; lng?: number | null } | null;
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

  // 한국어는 전부 아고다 숙소(2026-10-30 — 쿠팡은 한 달 클릭 23·수익 222원). 문맥으로 3가지 중 고른다:
  // 페스티벌·며칠짜리·지방 공연 = festival, 그 외 공연 = event, 클럽 = night.
  if (lang === "ko") {
    const ev = props.event ?? null;
    const variant = ev ? (isStayEvent(ev, props.area) ? "festival" : "event") : "night";
    return (
      <KoStaySlot
        variant={variant}
        placement={props.placement}
        area={props.area}
        club={props.club}
        date={ev?.date ?? null}
        className={props.className}
      />
    );
  }
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
