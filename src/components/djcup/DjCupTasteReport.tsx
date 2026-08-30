"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { useFavoritesContext } from "@/components/providers";
import type { RecommendedClub, TasteReport } from "@/lib/djCup/fetchTasteReport";

/**
 * 우승 화면의 취향 리포트 — 목업 B안.
 *
 * 유형 이름("하우스 탐닉형" 같은 것)은 붙이지 않는다. 근거가 "고른 DJ들의
 * 장르 분포"뿐이라, 거기에 성격 라벨을 얹으면 데이터가 말하지 않은 것을
 * 지어내게 된다. 계산으로 나온 사실만 보여준다.
 *
 * ⚠️ 색은 한 곳(강조 박스)에만 쓴다. 칩·타일까지 색을 넣었더니 한 화면에
 * 강조가 셋이 되어(주황+노랑+초록) 난잡했다 — 목업 검토에서 무채색으로 되돌렸다.
 */
export function DjCupTasteReport({
  report,
  upcomingClubIds,
}: {
  report: TasteReport;
  /** 오늘 이후 라인업이 있는 클럽 — "이번 주 라인업 있음" 배지용 */
  upcomingClubIds: Set<string>;
}) {
  const top = report.genres[0];

  return (
    <>
      {/* 가장 강한 사실 하나만 크게. 배경이 색을 담당하므로 글씨는 흰색이다
          — 주황 배경 위 주황 글씨는 대비가 낮아 탁해 보였다. */}
      {top && report.analyzed >= 4 && (
        <div
          className="mt-3 rounded-2xl px-3 py-2.5 border"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,85,0,.16), rgba(255,214,10,.07))",
            borderColor: "rgba(255,85,0,.3)",
          }}
        >
          <p className="text-[14px] font-black tracking-[-0.03em] text-white leading-[1.35]">
            당신이 고른 {report.analyzed}명 중 <span className="text-white">{top.count}명이 {top.label}</span>
          </p>
        </div>
      )}

      {/* 통계 타일(편중도 / 들어본 장르 수)은 뺐다 — "장르 수 5"는 많이 들었다는
          뜻인지 취향이 없다는 뜻인지 읽는 사람이 알 수 없었고, 편중도는 아래
          장르 칩의 1위 값과 같은 숫자라 같은 정보가 두 번 나왔다. */}

      {/* 장르 칩. 1위는 색이 아니라 흰 글씨+굵기로 구분한다(위 주석 참조). */}
      {report.genres.length > 0 && report.analyzed >= 4 && (
        <div className="mt-2.5 mb-4 flex flex-wrap gap-1.5">
          {report.genres.map((g, i) => (
            <span
              key={g.genre}
              className={`text-[10.5px] px-2.5 py-1 rounded-full border ${
                i === 0
                  ? "font-extrabold text-white bg-[#26262b] border-[#4a4a52]"
                  : "font-bold text-[#c2c2c9] bg-card border-border"
              }`}
            >
              {g.label} {g.pct}%
            </span>
          ))}
        </div>
      )}

      {report.clubs.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-3">
          <p className="text-[11px] font-extrabold text-muted-foreground mb-2 flex items-center justify-between">
            당신에게 추천하는 클럽
            <span className="text-[10px] font-semibold text-[#5f5f66]">찜하면 라인업 알림</span>
          </p>
          {report.clubs.map((club, i) => (
            <ClubRow
              key={club.id}
              club={club}
              hasUpcoming={upcomingClubIds.has(club.id)}
              first={i === 0}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ClubRow({
  club,
  hasUpcoming,
  first,
}: {
  club: RecommendedClub;
  hasUpcoming: boolean;
  first: boolean;
}) {
  const { isFavorited, toggleFavorite } = useFavoritesContext();
  const favorited = isFavorited(club.id);

  return (
    <div className={`flex items-center gap-2.5 py-1.5 ${first ? "" : "border-t border-[#232326]"}`}>
      <Link href={`/clubs/${club.id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
        {club.thumbnail_url ? (
          <Image
            src={club.thumbnail_url}
            alt=""
            width={33}
            height={33}
            className="w-[33px] h-[33px] rounded-[9px] object-cover shrink-0"
          />
        ) : (
          <span className="w-[33px] h-[33px] rounded-[9px] shrink-0 bg-muted flex items-center justify-center text-[12px] font-black text-muted-foreground">
            {club.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold tracking-[-0.02em] text-white truncate">
            {club.name}
            {club.area && <span className="text-green-500 font-bold ml-1 text-[11px]">{club.area}</span>}
          </span>
          <span className="block text-[10px] text-muted-foreground mt-px">
            {hasUpcoming
              ? "이번 주 라인업 있음"
              : `고른 DJ ${club.djCount}명이 여기서 플레이`}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => toggleFavorite(club.id)}
        aria-label={`${club.name} ${favorited ? "찜 해제" : "찜하기"}`}
        aria-pressed={favorited}
        className={`w-[29px] h-[29px] rounded-full border shrink-0 flex items-center justify-center transition-colors ${
          favorited
            ? "text-red-500 border-[#3a2226] bg-[#1e1416]"
            : "text-muted-foreground border-border bg-[#0f0f11]"
        }`}
      >
        <Heart className={`w-3.5 h-3.5 ${favorited ? "fill-red-500" : ""}`} />
      </button>
    </div>
  );
}
