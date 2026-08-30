"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { DjLedShowList, type DjShowRow } from "@/components/djs/DjLedShowList";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import { fetchUpcomingDjShows } from "@/lib/djCup/fetchDjShows";
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
  const submittedRef = useRef(false);

  useEffect(() => {
    fetchUpcomingDjShows(champion.id).then(setShows);
  }, [champion.id]);

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
      </div>

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
