"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { DjLedShowList } from "@/components/djs/DjLedShowList";

export interface DjProfileTarget {
  id: string;
  display_name: string;
  instagram: string | null;
  /** 있으면 시트 하단에 전체 프로필(/dj/[slug]) 링크가 뜬다. optional — 기존 호출부는 안 넘겨도 됨. */
  slug?: string;
}

interface PlayRow {
  event_date: string;
  start_min: number | null;
  club_id: string;
  club_name: string;
  club_area: string | null;
}

/**
 * DJ 이름을 눌렀을 때 뜨는 작은 프로필 시트.
 *
 * DJ 전용 페이지(/dj/[slug])는 아직 없다 — 그 전까지 "이 DJ 어디서 트는지"를
 * 화면 이동 없이 확인하는 자리. DJ는 여러 클럽을 돌므로 한 클럽에 소속시키지 않고
 * 예정된 라인업을 그대로 나열한다.
 */
export function DjProfileSheet({
  dj,
  onClose,
}: {
  dj: DjProfileTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!dj} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        /* SheetContent 기본이 flex-col gap-4라 자식마다 16px이 벌어진다 —
           내용이 3덩이뿐이라 과하므로 gap-0으로 죽이고 각 블록에서 직접 준다. */
        className="bg-card border-border rounded-t-3xl gap-0 px-4 pt-9 pb-8 max-h-[75vh] overflow-y-auto max-w-lg mx-auto"
      >
        {/* key로 DJ마다 새 인스턴스를 만든다 — 이전 DJ의 목록이 잠깐 비쳤다가
            바뀌는 일이 없고, 로딩 상태를 effect로 되돌릴 필요도 없어진다. */}
        {dj && <DjProfileBody key={dj.id} dj={dj} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function DjProfileBody({
  dj,
  onClose,
}: {
  dj: DjProfileTarget;
  onClose: () => void;
}) {
  const [plays, setPlays] = useState<PlayRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("lineup_sets")
        .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area))")
        .eq("dj_id", dj.id)
        .gte("club_lineups.event_date", getBusinessDateISO())
        .limit(50);

      if (cancelled) return;

      type Raw = {
        start_min: number | null;
        club_lineups:
          | { event_date: string; clubs: ClubRef | ClubRef[] }
          | { event_date: string; clubs: ClubRef | ClubRef[] }[]
          | null;
      };
      type ClubRef = { id: string; name: string; area: string | null };

      const rows: PlayRow[] = [];
      for (const r of (data ?? []) as unknown as Raw[]) {
        // PostgREST 조인은 배열/객체 양쪽으로 온다 (라인업 화면 공통 규약)
        const lineup = Array.isArray(r.club_lineups) ? r.club_lineups[0] : r.club_lineups;
        if (!lineup) continue;
        const club = Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs;
        if (!club) continue;
        rows.push({
          event_date: lineup.event_date,
          start_min: r.start_min,
          club_id: club.id,
          club_name: club.name,
          club_area: club.area,
        });
      }
      // 중첩 select는 order가 보장되지 않으므로 여기서 정렬
      rows.sort(
        (a, b) =>
          a.event_date.localeCompare(b.event_date) ||
          (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
      );
      setPlays(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [dj]);

  return (
    <>
            {/* 제목은 화면에 안 보이고 스크린 리더용 — 패딩 없는 헤더로 자리를 안 먹게 */}
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">{dj.display_name} 프로필</SheetTitle>
            </SheetHeader>

            {/* DJ는 가입 개념이 없는 운영자 등록 데이터라 프로필 사진이 없다 —
                이니셜 원은 정보가 없는 자리만 차지하므로 두지 않는다.
                인스타는 버튼이 아니라 이름 옆 텍스트 링크 — 굳이 버튼 하나를 더
                눌러야 나가는 동작이 아니라는 걸 시각적으로도 가볍게 둔다. */}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                <p className="font-black text-foreground truncate leading-tight text-lg">
                  {dj.display_name}
                </p>
                {dj.instagram && (
                  <a
                    href={`https://instagram.com/${dj.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-muted-foreground hover:text-foreground/80 truncate transition-colors"
                  >
                    @{dj.instagram}
                  </a>
                )}
              </div>
              <DjFavoriteButton djId={dj.id} djName={dj.display_name} size="lg" />
            </div>

            {dj.slug && (
              <Link
                href={`/dj/${dj.slug}`}
                onClick={onClose}
                className="mt-4 w-full h-10 rounded-xl border border-border text-muted-foreground hover:text-foreground font-bold text-[13px] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                전체 프로필 보기
              </Link>
            )}

            <div className="mt-5">
              <p className="text-[11px] font-bold text-muted-foreground mb-2">
                예정된 라인업
              </p>

              {plays === null ? (
                <div className="py-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-border border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <DjLedShowList rows={plays} emptyLabel="예정된 라인업이 없어요" onItemClick={onClose} />
              )}
            </div>
    </>
  );
}
