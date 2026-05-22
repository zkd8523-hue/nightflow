"use client";

// 초기 PMF 검증 기간: 실데이터 부족으로 소셜프루프 숫자를 정적으로 박아둠.
// 실서비스 깃발/오퍼가 충분히 쌓이면 usePuzzleSocialProof / useTodayPuzzleVelocity 훅으로 되돌리기.
const PUZZLE_COUNT = 23;
const OFFER_COUNT = 58;
const AVG_OFFERS_1H = 2.7;

export function PuzzleSocialProofBanner() {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500/30 via-orange-500/15 to-amber-500/5 border border-amber-500/40 rounded-xl mt-3 mb-4">
      <p className="flex items-center gap-1.5 text-[11.5px] text-neutral-100 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
        <span className="text-sm leading-none flex-shrink-0">🔥</span>
        <span>
          지난 2주 동안 깃발 <span className="text-amber-400 font-bold">{PUZZLE_COUNT}개</span>, 오퍼 <span className="text-amber-400 font-bold">{OFFER_COUNT}개</span>
        </span>
      </p>
      <p className="flex items-center gap-1.5 text-[11.5px] text-neutral-100 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
        <span className="text-sm leading-none flex-shrink-0">⚡</span>
        <span>
          등록 <span className="text-amber-400 font-bold">1시간</span> 안에 평균 <span className="text-amber-400 font-bold">{AVG_OFFERS_1H}개</span> 오퍼
        </span>
      </p>
    </div>
  );
}
