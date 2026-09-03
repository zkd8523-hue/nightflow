"use client";

import Link from "next/link";
import Image from "next/image";
import { Disc3, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LineupSetTable } from "@/components/lineups/LineupSetTable";
import { formatLineupDate } from "@/lib/lineups/formatDate";
import type { LineupClubRow } from "@/components/lineups/NationwideLineupList";

/**
 * 라인업 목록(/lineup)에서 클럽 카드를 눌렀을 때 뜨는 타임테이블 시트.
 *
 * 왜 페이지 이동이 아니라 시트인가:
 *   목록을 훑는 흐름에서 매번 페이지로 튕겨나갔다 뒤로 돌아오면 스크롤 위치와
 *   맥락이 끊긴다. 클럽 상세의 UpcomingLineupSheet가 "클럽 화면에서 봐야 하므로
 *   별도 URL로 안 보낸다"고 판단한 것과 같은 자리다.
 *
 * 왜 페이지를 없애지 않는가:
 *   /clubs/{id}/lineup/{date}는 SEO 본진이다 — "클럽명 N월 N일 라인업" 검색은
 *   그 URL이 아니면 못 잡고(클럽 상세는 '오늘'만 보여준다), generateMetadata가
 *   클럽별 title·keywords·canonical을 뽑는다. 공유 링크의 착지점이기도 하다.
 *   그래서 이 시트는 그 페이지를 대체하지 않고, 하단에 "전체 페이지로 보기"를
 *   둬서 언제든 그쪽으로 건너갈 수 있게 한다.
 *
 * 데이터는 목록이 이미 들고 있는 row를 그대로 쓴다 — 추가 조회가 없다.
 */
export function ClubLineupSheet({
  row,
  onClose,
}: {
  row: LineupClubRow | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-card border-border rounded-t-3xl pb-6 px-4 max-h-[85vh] overflow-y-auto max-w-lg mx-auto"
      >
        {row && (
          <>
            <SheetHeader className="text-left !p-0">
              {/* 클럽명 + 날짜가 제목이다 — 목록에서 여러 클럽을 연달아 열어보므로
                  "지금 뭘 보고 있는지"가 맨 위에 있어야 한다. */}
              <SheetTitle className="text-foreground text-lg font-black flex items-center gap-2.5">
                <span className="relative w-9 h-9 shrink-0">
                  {row.club_thumbnail ? (
                    <Image
                      src={row.club_thumbnail}
                      alt=""
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                      <Disc3 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate leading-tight">{row.club_name}</span>
                  <span className="block text-[11.5px] font-bold text-muted-foreground mt-0.5">
                    {formatLineupDate(row.event_date)}
                    {row.club_area ? ` · ${row.club_area}` : ""}
                  </span>
                </span>
              </SheetTitle>
            </SheetHeader>

            {row.event_title && (
              <p className="text-[13px] font-bold text-amber-400 mt-3 break-words">
                〈{row.event_title}〉
              </p>
            )}

            <div className="mt-3">
              <LineupSetTable sets={row.sets} eventDate={row.event_date} />
            </div>

            {/* 공유·SEO 착지점으로 나가는 문. 시트가 페이지를 가리지 않도록
                항상 둔다 — 여기서만 볼 수 있는 정보(티켓 링크, 원본 게시물 등)가
                그 페이지에 더 있다. */}
            <Link
              href={`/clubs/${row.club_id}/lineup/${row.event_date}`}
              onClick={onClose}
              className="mt-3 flex items-center justify-between gap-2 bg-[#1C1C1E] rounded-2xl px-4 py-3.5 text-[13px] font-bold text-foreground hover:bg-[#232326] transition-colors"
            >
              전체 페이지로 보기
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
