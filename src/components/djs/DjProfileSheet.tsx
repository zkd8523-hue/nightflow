"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Heart } from "lucide-react";
import { GENRE_LABEL, type DjGenre } from "@/lib/djCup/fetchTasteReport";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { DjLedShowList } from "@/components/djs/DjLedShowList";
import { DjPreviewButton } from "@/components/djs/DjPreviewButton";

export interface DjProfileTarget {
  id: string;
  display_name: string;
  instagram: string | null;
  /** 있으면 이름 옆에 미리듣기(▶) 버튼이 뜬다. optional — 기존 호출부는 안 넘겨도 됨. */
  soundcloud_url?: string | null;
  /** 사클이 없을 때의 대체 재생원 */
  youtube_url?: string | null;
  /** 있으면 시트 하단에 전체 프로필(/dj/[slug]) 링크가 뜬다. optional — 기존 호출부는 안 넘겨도 됨. */
  slug?: string;
}

interface PlayRow {
  event_date: string;
  start_min: number | null;
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
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
  hidePreview = false,
}: {
  dj: DjProfileTarget | null;
  onClose: () => void;
  /** 이미 재생 중인 화면에서 열렸을 때 — "음악 미리듣기"를 또 보여주면
   *  방금 누른 것과 같은 동작이 하나 더 있는 셈이 된다. */
  hidePreview?: boolean;
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
        {dj && <DjProfileBody key={dj.id} dj={dj} onClose={onClose} hidePreview={hidePreview} />}
      </SheetContent>
    </Sheet>
  );
}

function DjProfileBody({
  dj,
  onClose,
  hidePreview = false,
}: {
  dj: DjProfileTarget;
  onClose: () => void;
  hidePreview?: boolean;
}) {
  const [plays, setPlays] = useState<PlayRow[] | null>(null);
  const [past, setPast] = useState<PlayRow[]>([]);
  // 프로필 페이지에만 있던 값들 — 시트에서도 같은 걸 보여준다(페이지 이동 없이)
  const [profile, setProfile] = useState<{
    photo_url: string | null;
    bio: string | null;
    verified: boolean;
    favoriteCount: number;
    genre: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const today = getBusinessDateISO();
      const [{ data }, { data: pastData }, { data: djRow }, { count: favCount }] = await Promise.all([
        supabase
          .from("lineup_sets")
          .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url))")
          .eq("dj_id", dj.id)
          .gte("club_lineups.event_date", today)
          .limit(50),
        supabase
          .from("lineup_sets")
          .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url))")
          .eq("dj_id", dj.id)
          .lt("club_lineups.event_date", today)
          .limit(30),
        supabase
          .from("djs")
          .select("photo_url, bio, claimed_by_user_id, genre")
          .eq("id", dj.id)
          .maybeSingle(),
        supabase
          .from("user_favorite_djs")
          .select("id", { count: "exact", head: true })
          .eq("dj_id", dj.id),
      ]);

      if (cancelled) return;

      setProfile({
        photo_url: djRow?.photo_url ?? null,
        bio: djRow?.bio ?? null,
        verified: !!djRow?.claimed_by_user_id,
        favoriteCount: favCount ?? 0,
        genre: djRow?.genre ?? null,
      });

      type Raw = {
        start_min: number | null;
        club_lineups:
          | { event_date: string; clubs: ClubRef | ClubRef[] }
          | { event_date: string; clubs: ClubRef | ClubRef[] }[]
          | null;
      };
      type ClubRef = { id: string; name: string; area: string | null; thumbnail_url: string | null };

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
          club_thumbnail: club.thumbnail_url ?? null,
        });
      }
      // 중첩 select는 order가 보장되지 않으므로 여기서 정렬
      rows.sort(
        (a, b) =>
          a.event_date.localeCompare(b.event_date) ||
          (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
      );
      setPlays(rows);

      // 지난 플레이도 같은 규약으로 정규화한다(최신순)
      const pastRows: PlayRow[] = [];
      for (const r of (pastData ?? []) as unknown as Raw[]) {
        const lineup = Array.isArray(r.club_lineups) ? r.club_lineups[0] : r.club_lineups;
        if (!lineup) continue;
        const club = Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs;
        if (!club) continue;
        pastRows.push({
          event_date: lineup.event_date,
          start_min: r.start_min,
          club_id: club.id,
          club_name: club.name,
          club_area: club.area,
          club_thumbnail: club.thumbnail_url ?? null,
        });
      }
      pastRows.sort(
        (a, b) =>
          b.event_date.localeCompare(a.event_date) ||
          (b.start_min ?? 0) - (a.start_min ?? 0)
      );
      setPast(pastRows.slice(0, 20));
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

            {/* 프로필 페이지(/dj/[slug])와 같은 명함 — 페이지로 나가지 않고
                여기서 다 보게 한다(라인업을 훑던 흐름이 안 끊긴다). */}
            <div className="flex items-start gap-3">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border">
                {profile?.photo_url ? (
                  <Image
                    src={profile.photo_url}
                    alt={dj.display_name}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/60 text-2xl font-black">
                    {dj.display_name.charAt(0)}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* 이름이 곧 전체 프로필로 가는 문이다 — 버튼을 따로 두면
                      한 줄을 통째로 먹는데, 그 자리는 라인업이 쓰는 게 낫다. */}
                  {dj.slug ? (
                    <Link
                      href={`/dj/${dj.slug}`}
                      onClick={onClose}
                      className="font-black text-foreground truncate leading-tight text-lg hover:text-amber-400 transition-colors"
                    >
                      {dj.display_name}
                    </Link>
                  ) : (
                    <p className="font-black text-foreground truncate leading-tight text-lg">
                      {dj.display_name}
                    </p>
                  )}
                  {profile?.verified && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black leading-none">
                      <BadgeCheck className="w-3 h-3" strokeWidth={2.5} />
                      인증됨
                    </span>
                  )}
                </div>
                {dj.instagram && (
                  <a
                    href={`https://instagram.com/${dj.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-muted-foreground hover:text-foreground/80 truncate transition-colors block mt-0.5"
                  >
                    @{dj.instagram}
                  </a>
                )}
                {/* 장르 해시태그 (Migration 616). 핸들 아래가 비어 있어 이름 블록이
                    허전했다 — 클럽 태그로 추정한 값도 섞여 있으므로 단정적인
                    문장 대신 태그 형태로 가볍게 둔다. */}
                {profile?.genre && GENRE_LABEL[profile.genre as DjGenre] && (
                  <p className="text-[12px] font-bold text-muted-foreground mt-1">
                    #{GENRE_LABEL[profile.genre as DjGenre]}
                  </p>
                )}
                {/* 0이면 부풀린 숫자로 오해받지 않도록 숨긴다(프로필 페이지와 같은 규칙) */}
                {!!profile?.favoriteCount && profile.favoriteCount > 0 && (
                  <p className="flex items-center gap-1 text-[12px] text-muted-foreground mt-1">
                    <Heart className="w-3 h-3 fill-current" />
                    {profile.favoriteCount}
                  </p>
                )}
              </div>

              <DjFavoriteButton djId={dj.id} djName={dj.display_name} size="lg" />
            </div>

            {profile?.bio && (
              <p className="mt-3 text-[13px] font-semibold leading-[1.45] whitespace-pre-wrap break-words text-foreground">
                {profile.bio}
              </p>
            )}

            {/* 버튼을 한 번 더 누르게 하지 않는다 — 이 시트를 연 사람은 이미
                "이 DJ가 어떤 음악인지"를 보러 온 것이라 플레이어를 바로 편다. */}
            {!hidePreview && (
              <DjPreviewButton
                soundcloudUrl={dj.soundcloud_url}
                youtubeUrl={dj.youtube_url}
                djName={dj.display_name}
                variant="inline"
                autoOpen
              />
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

            {/* 예정이 없는 DJ는 시트가 텅 비어 "정보가 없는 사람"처럼 보인다 —
                지난 플레이가 그 자리를 채워 어디서 뛰던 사람인지 알려준다. */}
            {past.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-bold text-muted-foreground mb-2">
                  지난 플레이
                </p>
                <DjLedShowList rows={past} emptyLabel="" onItemClick={onClose} />
              </div>
            )}
    </>
  );
}
