"use client";

import Image from "next/image";
import { ChevronRight, Disc3 } from "lucide-react";
import { useClubSheet } from "@/components/weekly/ClubSheetProvider";
import { trackEvent } from "@/lib/analytics/events";

/**
 * 호 본문에서 클럽을 눌러 상세를 띄우는 줄.
 *
 * 생김새는 라인업 목록의 클럽 행을 그대로 따른다(원형 썸네일 + 이름·지역 +
 * 아래 보조 줄 + 화살표). 같은 앱 안에서 같은 성격의 줄이 화면마다 다르게
 * 생기면 매번 다시 읽어야 한다.
 *
 * 읽던 자리를 떠나지 않게 시트로 띄운다 — ClubDetailSheet 가 /clubs/{id} 를
 * 그대로 임베드하므로 가격·메뉴·지도·라인업이 항상 최신이다. 본문에 입장료를
 * 글로 박아두면 클럽이 바꿨을 때 뉴스레터만 틀린 말을 한다.
 */
export function ClubPeekRow({
  clubId,
  name,
  area,
  photo,
  sub = "가격·지도·메뉴 보기",
}: {
  clubId: string;
  name: string;
  area?: string;
  photo?: string | null;
  sub?: string;
}) {
  const openClub = useClubSheet();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openClub(clubId);
          trackEvent("weekly_club_peek", { clubId, name });
        }}
        className="w-full rounded-[10px] bg-card border border-border px-3 py-2.5 mb-3.5
                   flex items-center gap-2.5 text-left active:scale-[0.99] transition-transform"
      >
        {photo ? (
          <Image
            src={photo}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 rounded-full object-cover shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <Disc3 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-foreground truncate">{name}</span>
            {area && (
              <span className="text-[11px] text-muted-foreground shrink-0">{area}</span>
            )}
          </span>
          <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
            {sub}
          </span>
        </span>

        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>

    </>
  );
}
