"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useState } from "react";
import { usableDjArtwork, type DjCupCandidate } from "@/lib/djCup/types";

/**
 * DJ 이상형 월드컵 대결 카드 (좌/우 한 장).
 *
 * 배경은 DjDiscoveryCard의 Slide와 동일한 라디얼 그라데이션 + 도트매트릭스를
 * 그대로 쓴다 — 새 시각 언어를 만들지 않고 기존 발견 카드에서 이어지게 하기
 * 위함(목업 검증 완료). 좌/우 두 장이 시각적으로 구분되도록 그라데이션 축을
 * 반전한다("o" = 오렌지 강조, "g" = 그린 강조).
 *
 * 아트워크 보유 DJ가 현재 0명(백필 전)이라 이니셜 표시가 사실상 기본 상태다.
 * Migration 612 주석대로 "값이 없으면 이니셜 원으로 떨어진다"를 그대로 따른다.
 *
 * 재생 위젯은 이 카드 안이 아니라 DjCupMatch가 카드 두 장 아래에 별도로
 * 그린다 — 카드는 항상 아트워크를 보여주고, 재생 상태는 테두리 글로우로만
 * 표시한다.
 *
 * ⚠️ 카드 전체를 탭하면 "재생"이다, "선택"이 아니다. 처음엔 카드 탭=선택,
 * 재생은 모서리의 작은 ▶로 분리했더니 "들어보려고 눌렀는데 본능적으로
 * 선택되어버린다"는 실사용 피드백이 나왔다(카드 중앙·이름을 누르는 게
 * 자연스러운 첫 동작인데 그게 곧 커밋이 되어버림). 그래서 저위험 동작(재생)을
 * 큰 탭 영역에 주고, 고위험 동작(선택 = 되돌릴 수 없는 커밋)은 아래 별도
 * 버튼으로 명시했다.
 */
export function DjCupCard({
  dj,
  variant,
  playing,
  onSelect,
  onPlay,
  priority = false,
}: {
  dj: DjCupCandidate;
  /** 좌/우 그라데이션 반전용 — 의미상 순서일 뿐 값 자체엔 뜻이 없다 */
  variant: "o" | "g";
  /** 지금 재생 중인 카드인지 — 테두리 글로우로 표시(레퍼런스 목업에서 검증) */
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  /** 첫 매치 2장에만 true — 128명 전부에 주면 LCP가 망가진다 */
  priority?: boolean;
}) {
  const initial = dj.display_name.trim().charAt(0).toUpperCase() || "?";
  const [artworkFailed, setArtworkFailed] = useState(false);
  // 사클 아트워크 URL이 만료·삭제되면 next/image가 브라우저 기본 깨진
  // 이미지 아이콘(파란 테두리)을 그대로 그린다 — onError로 잡아 이니셜
  // 원으로 떨어뜨린다(Migration 612 주석의 "값이 없으면 이니셜 원" 규약을
  // "값은 있는데 죽었다"는 경우까지 넓힌 것).
  //
  // ⚠️ onError만으로는 부족하다: next.config.ts remotePatterns에 없는
  // 호스트면 next/image가 *렌더 시점에* 예외를 던져 onError에 도달조차
  // 못 하고, 에러 바운더리가 페이지 전체를 덮는다(실측: 사클 기본 이미지
  // soundcloud.com/images/fb_placeholder.png가 저장된 DJ가 매치에 나오면
  // 화면이 통째로 회색 박스가 됐다). 그래서 렌더 전에 호스트를 직접 검증해
  // 등록된 i1.sndcdn.com이 아니면 아예 <Image>를 그리지 않는다.
  const artworkUrl = artworkFailed ? null : usableDjArtwork(dj.soundcloud_artwork_url);

  return (
    <div
      className={`relative flex-1 min-w-0 rounded-2xl overflow-hidden border transition-shadow ${
        playing
          ? "border-[#FF5500] shadow-[0_0_0_1px_#FF5500,0_0_26px_rgba(255,85,0,.28)]"
          : "border-border"
      }`}
    >
      {/* 카드 몸통(아트워크+이름) 전체가 재생 버튼이다 — 선택 아님 */}
      <button
        type="button"
        onClick={onPlay}
        aria-label={`${dj.display_name} 미리듣기`}
        aria-pressed={playing}
        className="block w-full text-left cursor-pointer"
      >
        <div
          className="relative aspect-square"
          style={{
            background:
              variant === "o"
                ? "radial-gradient(120% 90% at 78% 15%, rgba(255,85,0,.5), transparent 62%)," +
                  "radial-gradient(95% 85% at 12% 92%, rgba(57,255,106,.28), transparent 58%)," +
                  "linear-gradient(160deg,#231a16,#121214)"
                : "radial-gradient(120% 90% at 22% 15%, rgba(57,255,106,.42), transparent 62%)," +
                  "radial-gradient(95% 85% at 88% 92%, rgba(255,85,0,.3), transparent 58%)," +
                  "linear-gradient(160deg,#16231c,#121214)",
            }}
        >
          <span
            className="absolute inset-0 opacity-50 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1.3px)",
              backgroundSize: "5px 5px",
            }}
            aria-hidden="true"
          />
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt=""
              fill
              sizes="(max-width:512px) 50vw, 256px"
              className="object-cover relative z-[1]"
              priority={priority}
              onError={() => setArtworkFailed(true)}
            />
          ) : (
            <span className="relative z-[1] flex items-center justify-center w-full h-full text-white/90 font-black text-[44px] tracking-[-0.04em] drop-shadow-[0_2px_18px_rgba(0,0,0,.65)]">
              {initial}
            </span>
          )}

          <span
            aria-hidden="true"
            className={`absolute right-2 -bottom-[19px] z-[2] w-[38px] h-[38px] rounded-full inline-flex items-center justify-center transition-all ${
              playing
                ? "bg-[#FF5500] text-white shadow-[0_0_22px_rgba(255,85,0,.7)]"
                : "bg-black/55 text-white border border-white/20 backdrop-blur-[3px]"
            }`}
          >
            <Play className="w-[15px] h-[15px] fill-current translate-x-[1px]" aria-hidden="true" />
          </span>
        </div>

        <div className="px-2.5 pt-3 pb-2">
          <p className="text-[15px] font-black text-white tracking-[-0.035em] leading-[1.05] truncate">
            {dj.display_name}
          </p>
        </div>
      </button>

      {/* 되돌릴 수 없는 동작(선택=다음 매치로 진행)만 별도 버튼으로 분리 */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${dj.display_name} 선택하기`}
        className="w-full h-8 mb-1 mx-auto block max-w-[calc(100%-20px)] rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white text-[11px] font-bold tracking-[-0.01em] transition-all"
      >
        선택하기
      </button>
    </div>
  );
}
