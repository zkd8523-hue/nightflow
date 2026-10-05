"use client";

import Image from "next/image";
import { ChevronRight, Disc3 } from "lucide-react";
import { useClubSheet } from "@/components/weekly/ClubSheetProvider";
import { trackEvent } from "@/lib/analytics/events";

/**
 * 혜택 한 줄 — 클럽 하나에 그 클럽 혜택을 배지로 묶는다.
 *
 * 묶는 이유: 한 클럽이 쿠폰을 다섯 장 걸면 다섯 줄이 되어 본문이 광고판이 된다.
 * 클럽 줄(ClubPeekRow)과 같은 생김새를 쓰되, 아래 줄만 배지로 바꾼다.
 *
 * 쿠폰은 상세 페이지로 보내고(받는 행위가 거기 있다), 게스트 간판은 클럽 시트로
 * 연다(간판은 클럽 상세 안에 표시되는 정보다).
 */
export function WeeklyBenefitRow({
  clubId,
  clubName,
  clubArea,
  thumbnail,
  labels,
  note,
  extraCount,
  kind,
}: {
  clubId: string;
  clubName: string;
  clubArea?: string | null;
  thumbnail?: string | null;
  labels: string[];
  /** MD 가 직접 쓴 조건 문구. 배지만으로는 "여자게스트 무료" 같은 조건이 빠진다 */
  note?: string | null;
  /** 배지에 다 못 담은 나머지 개수 */
  extraCount?: number;
  kind: "coupon" | "guest_sign";
}) {
  const openClub = useClubSheet();

  const inner = (
    <>
      <span className="relative shrink-0 rounded-xl overflow-hidden w-[72px]">
        {/* 게스트 간판은 홈처럼 주황 띠를 두른다 — 조건이 사진 위에 박혀야 눈에 걸린다 */}
        {kind === "guest_sign" && note && (
          <span className="block bg-brand-amber text-black text-[9px] font-black text-center py-[3px] px-1 truncate">
            {note}
          </span>
        )}
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt=""
            width={72}
            height={56}
            className="w-[72px] h-14 object-cover"
            loading="lazy"
          />
        ) : (
          <span className="w-[72px] h-14 bg-white/5 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        {/* 1줄: 혜택이 주인공. 클럽 이름보다 이게 먼저 읽혀야 "받을 게 있다"가 산다 */}
        <span className="block text-[15px] font-black leading-tight truncate">
          <span className="text-brand-amber">{labels[0]}</span>
        </span>
        {/* 2줄: 나머지 혜택을 이름으로 적는다. "외 2개"만 쓰면 뭔지 알 수 없다.
            MD 가 쓴 조건 문구가 있으면 그걸 먼저 보여준다("여자게스트 무료") */}
        {(() => {
          // 띠에 이미 note 를 걸었으면 여기선 생략한다 — 같은 문구가 두 번 보인다
          const noteShownOnBadge = kind === "guest_sign" && Boolean(note);
          const rest = [
            labels.slice(1).join(" · "),
            (extraCount ?? 0) > 0 ? `외 ${extraCount}장` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          const line = noteShownOnBadge ? rest : (note ?? rest);
          if (!line) return null;
          return (
            <span className="block text-[11px] font-bold text-muted-foreground truncate mt-0.5">
              {line}
            </span>
          );
        })()}
        {/* 3줄: 어디서 */}
        <span className="flex items-baseline gap-1.5 mt-1">
          <span className="text-[12px] text-foreground truncate">{clubName}</span>
          {clubArea && (
            <span className="text-[11px] text-muted-foreground shrink-0">{clubArea}</span>
          )}
        </span>
      </span>

      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground self-center" />
    </>
  );

  const cls =
    "w-full rounded-[10px] bg-card px-3 py-2.5 " +
    "flex items-start gap-2.5 text-left active:scale-[0.99] transition-transform";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openClub(clubId, { coupons: kind === "coupon" });
          trackEvent("weekly_benefit_click", { clubId, kind });
        }}
        className={cls}
      >
        {inner}
      </button>
    </>
  );
}
