"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Instagram, Youtube } from "lucide-react";
import { SoundcloudIcon } from "@/components/icons/SoundcloudIcon";
import { DjLedShowList, type DjShowRow } from "@/components/djs/DjLedShowList";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { fetchUpcomingDjShows } from "@/lib/djCup/fetchDjShows";
import { fetchTasteReport, fetchClubsWithUpcoming, type TasteReport } from "@/lib/djCup/fetchTasteReport";
import { DjCupTasteReport } from "./DjCupTasteReport";
import { shareDjCup } from "@/lib/utils/share";
import { getOrCreateDjCupSession } from "@/lib/djCup/session";
import { createClient } from "@/lib/supabase/client";
import { usableDjArtwork, type DjCupCandidate, type DjCupSubmitResult, type RoundSize } from "@/lib/djCup/types";

/**
 * 우승 화면 — 일정 보유 DJ가 153명 중 34명뿐이라(23%) 빈 상태가 사실상 기본
 * 화면이다. 두 경우 모두 같은 CTA("전국 라인업 둘러보기")로 끝나 착지점을
 * 하나로 모은다 — "다시 하기"는 게임 안에 가두지만 이 화면의 목적은 DB로
 * 내보내는 것이다.
 */
export function DjCupResult({
  champion,
  roundSize,
  winners,
  losers,
}: {
  champion: DjCupCandidate;
  roundSize: RoundSize;
  winners: string[];
  losers: string[];
}) {
  const [shows, setShows] = useState<DjShowRow[] | null>(null);
  const [submitResult, setSubmitResult] = useState<DjCupSubmitResult | null>(null);
  const [taste, setTaste] = useState<TasteReport | null>(null);
  const [upcomingClubIds, setUpcomingClubIds] = useState<Set<string>>(new Set());
  const submittedRef = useRef(false);

  // 인스타는 @핸들 형태로 저장돼 있을 수 있다(DJ 프로필과 동일 처리).
  const igHandle = champion.instagram?.replace(/^@/, "") || null;
  // 유튜브는 채널 URL도 그대로 링크로 쓴다 — 임베드는 막혀도 방문은 된다
  // (후보 필터에서 쓰는 youtubeVideoId 판정과는 목적이 다르다).
  const youtubeUrl = champion.youtube_url || null;
  const linkCount = [igHandle, champion.soundcloud_url, youtubeUrl].filter(Boolean).length;

  useEffect(() => {
    fetchUpcomingDjShows(champion.id).then(setShows);
  }, [champion.id]);

  // 취향 리포트 — 유저가 "선택하기"를 누른 DJ들(winners)이 곧 취향이다.
  // 패배자는 넣지 않는다.
  useEffect(() => {
    let alive = true;
    fetchTasteReport(winners).then(async (r) => {
      if (!alive) return;
      setTaste(r);
      if (r.clubs.length) {
        const ids = await fetchClubsWithUpcoming(r.clubs.map((c) => c.id));
        if (alive) setUpcomingClubIds(ids);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 결과 화면 마운트 시 1회만 제출 — StrictMode 이중 실행으로 같은 판이
  // 두 번 집계되는 걸 막는다.
  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const supabase = createClient();
    supabase
      .rpc("submit_dj_cup_result", {
        p_session_id: getOrCreateDjCupSession(),
        p_round_size: roundSize,
        p_champion_id: champion.id,
        p_winners: winners,
        p_losers: losers,
      })
      .then(({ data, error }) => {
        if (error || !data) return;
        setSubmitResult(data as unknown as DjCupSubmitResult);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col">
      <div className="text-center">
        <p className="text-[9.5px] font-black text-amber-400 tracking-[.16em]">🏆 WINNER</p>

        <div
          className="relative w-24 aspect-square mx-auto mt-2.5 rounded-2xl overflow-hidden flex items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 78% 15%, rgba(255,85,0,.5), transparent 62%)," +
              "radial-gradient(95% 85% at 12% 92%, rgba(57,255,106,.28), transparent 58%)," +
              "linear-gradient(160deg,#231a16,#121214)",
          }}
        >
          <span
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1.3px)",
              backgroundSize: "5px 5px",
            }}
            aria-hidden="true"
          />
          {usableDjArtwork(champion.soundcloud_artwork_url) ? (
            <Image
              src={usableDjArtwork(champion.soundcloud_artwork_url) as string}
              alt=""
              fill
              sizes="96px"
              className="object-cover relative z-[1]"
            />
          ) : (
            <span className="relative z-[1] text-white font-black text-[40px] tracking-[-0.04em]">
              {champion.display_name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </div>

        <p className="text-[19px] font-black text-white tracking-[-0.035em] mt-2.5">
          <Link href={`/dj/${champion.slug}`} className="hover:text-amber-400 transition-colors">
            {champion.display_name}
          </Link>
        </p>
        <div className="flex items-center justify-center gap-2 mt-1">
          {submitResult && (
            <p className="text-[10.5px] text-muted-foreground">
              전체 <span className="text-amber-400 font-bold">{submitResult.champion_rank}위</span>
            </p>
          )}
          <DjFavoriteButton djId={champion.id} djName={champion.display_name} />
        </div>

        {/* 우승자 채널 링크 — 여기까지 온 사람은 이 DJ가 마음에 든 사람이다.
            더 듣거나 팔로우할 곳을 바로 준다. 스타일은 DJ 프로필의 링크
            블록과 같은 것을 쓴다(새 시각 언어를 만들지 않는다). */}
        {(igHandle || champion.soundcloud_url || youtubeUrl) && (
          <div
            className="mt-3.5 -mx-3 -mb-3 border-t border-border grid divide-x divide-border"
            style={{ gridTemplateColumns: `repeat(${linkCount}, minmax(0, 1fr))` }}
          >
            {igHandle && (
              <a
                href={`https://instagram.com/${igHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-2 py-2.5 active:bg-muted transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-pink-500/15 flex items-center justify-center">
                  <Instagram className="w-4 h-4 text-pink-400" />
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">인스타그램</span>
              </a>
            )}
            {champion.soundcloud_url && (
              <a
                href={champion.soundcloud_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-2 py-2.5 active:bg-muted transition-colors"
              >
                {/* 사클 브랜드 오렌지(#FF5500) 고정 — DJ 프로필과 동일 */}
                <span className="w-7 h-7 rounded-full bg-[#FF5500]/15 flex items-center justify-center">
                  <SoundcloudIcon size={16} className="text-[#FF5500]" />
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">사운드클라우드</span>
              </a>
            )}
            {youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-2 py-2.5 active:bg-muted transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Youtube className="w-4 h-4 text-red-400" />
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">유튜브</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* 취향 리포트 + 추천 클럽. 4강(선택 3번)은 표본이 적어 분포가 흔들리므로
          컴포넌트 안에서 analyzed >= 4 일 때만 장르를 보여준다 — 클럽 추천은
          표본과 무관하게(고른 DJ가 실제로 서는 무대라) 항상 보여준다. */}
      {taste && <DjCupTasteReport report={taste} upcomingClubIds={upcomingClubIds} />}

      {/* 예정된 라인업이 없으면 구분선까지 통째로 숨긴다 — 우승 직후 화면에서
          "없어요" 빈 박스는 아무 정보도 주지 않으면서 공유 버튼만 밀어낸다.
          (shows === null은 아직 로딩 중) */}
      {shows !== null && shows.length > 0 && (
        <div className="border-t border-border mt-3 pt-2.5">
          {/* rows가 비어 있지 않을 때만 렌더하므로 emptyLabel은 실제로 안 쓰인다 */}
          <DjLedShowList rows={shows} emptyLabel="" />
        </div>
      )}

      <button
        type="button"
        onClick={() => shareDjCup({ championName: champion.display_name, roundSize })}
        className="h-[38px] mt-3 rounded-xl bg-[#FEE500] text-black font-black text-[12.5px] tracking-[-0.02em]"
      >
        DJ 이상형 월드컵 공유하기
      </button>
      <Link
        href="/lineups"
        className="h-[38px] mt-1.5 rounded-xl border border-border text-white font-black text-[12.5px] tracking-[-0.02em] flex items-center justify-center"
      >
        전국 라인업 둘러보기
      </Link>
    </div>
  );
}
