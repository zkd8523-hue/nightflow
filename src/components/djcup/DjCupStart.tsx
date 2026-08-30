"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { ROUND_SIZES, type RoundSize } from "@/lib/djCup/types";
import { availableRoundSizes } from "@/lib/djCup/candidates";
import { shareDjCup } from "@/lib/utils/share";

/**
 * DJ 이상형 월드컵 시작 화면.
 *
 * 레퍼런스처럼 4강~128강 사다리 전체를 낸다. 256강은 아예 그리지 않는다 —
 * 후보 153명으로는 낼 수 없는 라운드고, 흐린 채로 두면 "없는 기능을 광고"하는
 * 셈이 된다(발견 카드가 0명일 때 null을 내는 규약과 동일). pool.length 기반
 * 판정이라 후보가 늘면 자동으로 더 큰 라운드가 나타난다 — 하드코딩 없음.
 */
export function DjCupStart({
  poolSize,
  onStart,
}: {
  poolSize: number;
  onStart: (roundSize: RoundSize) => void;
}) {
  const available = availableRoundSizes(poolSize, ROUND_SIZES);
  const [selected, setSelected] = useState<RoundSize>(
    // 16강을 기본값으로 — 완주율과 대진 다양성의 중간 지점
    available.includes(16) ? 16 : (available[available.length - 1] ?? available[0])
  );

  if (available.length === 0) return null;

  return (
    <div className="flex flex-col">
      {/* 히어로 이미지 — 시작 화면이 텍스트와 버튼만이라 허전했다.
          OG/홈 배너와 같은 DJ 대결 일러스트를 써서 공유 링크로 들어온
          사람이 카드에서 본 그림을 그대로 만나게 한다. 모바일 5:3 /
          웹 3:1 두 장을 비율에 맞춰 교체(홈 배너와 동일 규약). */}
      <div
        className="w-full rounded-2xl overflow-hidden bg-[#121214] bg-cover bg-center aspect-[5/3] mt-2 sm:hidden"
        style={{ backgroundImage: "url('/og-djcup-mobile.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="w-full rounded-2xl overflow-hidden bg-[#121214] bg-cover bg-center aspect-[3/1] mt-2 hidden sm:block"
        style={{ backgroundImage: "url('/og-djcup-web.jpg')" }}
        aria-hidden="true"
      />
      <div className="text-center pt-4 pb-1">
        <h1
          className="text-[26px] font-black text-white tracking-[-0.035em] leading-tight"
          style={{ textWrap: "balance" }}
        >
          나랑 취향 찰떡인 DJ는 누구?
        </h1>
        <p className="text-[14px] font-bold text-muted-foreground mt-2 leading-relaxed">
          DJ 이상형 월드컵
          <br />
          <span className="text-[#39ff6a] font-bold" style={{ textShadow: "0 0 8px rgba(57,255,106,.45)" }}>
            재생 가능한 DJ {poolSize}명
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center my-2.5">
        {available.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setSelected(size)}
            className={`h-9 px-3.5 rounded-full border text-[11.5px] font-bold transition-colors ${
              selected === size
                ? "bg-white border-white text-black"
                : "border-border text-muted-foreground"
            }`}
          >
            {size}강
          </button>
        ))}
      </div>

      {/* 시작하는 라운드 참가자 전원의 미리듣기를 한 번에 미리 로드해서
          매치마다 로딩 없이 바로 재생되게 한다 — 그만큼 데이터를 미리
          당겨온다는 뜻이라 와이파이 환경을 권장한다. */}
      <p className="text-center text-[10px] text-muted-foreground mb-2.5">
        📶 원활한 재생을 위해 와이파이 환경을 권장해요 · 데이터가 발생할 수 있어요
      </p>

      <div className="grid grid-cols-[2fr_1fr_1fr] gap-1.5">
        <button
          type="button"
          onClick={() => onStart(selected)}
          className="h-[38px] rounded-xl bg-white text-black font-black text-[12.5px] tracking-[-0.02em] inline-flex items-center justify-center gap-1"
        >
          <span aria-hidden="true">▶</span> 시작하기
        </button>
        <Link
          href="/dj-cup/ranking"
          className="h-[38px] rounded-xl border border-border text-white font-black text-[11px] tracking-[-0.02em] inline-flex flex-col items-center justify-center gap-0.5"
        >
          <span aria-hidden="true">🏆</span> 랭킹보기
        </Link>
        <button
          type="button"
          onClick={() => shareDjCup()}
          className="h-[38px] rounded-xl border border-border text-white font-black text-[11px] tracking-[-0.02em] inline-flex flex-col items-center justify-center gap-0.5"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> 공유
        </button>
      </div>
    </div>
  );
}
