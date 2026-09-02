"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics/events";
import { DjCupStart } from "./DjCupStart";
import { DjCupMatch } from "./DjCupMatch";
import { DjCupResult } from "./DjCupResult";
import { DjCupPreloadProvider, DjCupPlayerSlot } from "./DjCupPreloadedPlayer";
import {
  advanceBracket,
  createBracket,
  currentMatch,
  isChampionDecided,
} from "@/lib/djCup/candidates";
import type { DjCupBracketState, DjCupCandidate, RoundSize } from "@/lib/djCup/types";

/** 현재 남은 인원(bracket.current.length) 기준 라운드 이름.
 *  마지막 두 라운드만 한글 관례 명칭을 쓴다 — 8강 이상은 참가자 수가
 *  곧 정체성이라("8강에 들었다") 굳이 안 바꾼다. */
function roundLabel(remaining: number): string {
  if (remaining === 2) return "결승전";
  if (remaining === 4) return "준결승전";
  return `${remaining}강`;
}

/**
 * DJ 이상형 월드컵 상태머신 — 단일 페이지(start | match | result).
 *
 * 매치마다 라우트를 바꾸지 않는 이유: RSC 왕복이 라운드 크기만큼 생기고,
 * 사클 iframe이 매번 언마운트되어 예열이 무의미해진다. 공유 링크도 항상
 * /dj-cup(시작 화면) 하나로 고정되어야 하므로 진행 상태를 URL에 담지 않는다.
 */
export function DjCupClient({ pool }: { pool: DjCupCandidate[] }) {
  const [bracket, setBracket] = useState<DjCupBracketState | null>(null);

  const match = bracket ? currentMatch(bracket) : null;
  const champion = bracket && isChampionDecided(bracket) ? bracket.current[0] : null;

  // candidates 는 시작 화면이 미리 뽑아 넘긴 대진이다 — 그래야 그 화면에
  // 머무는 동안 첫 매치 참가자의 사클 iframe 을 미리 데울 수 있다
  // (DjCupStart 의 picked/warmSoundcloud 주석 참고). 여기서 다시 뽑으면
  // 데운 후보와 실제로 나오는 후보가 어긋나 예열이 통째로 헛돈다.
  const handleStart = (roundSize: RoundSize, candidates: DjCupCandidate[]) => {
    setBracket(createBracket(candidates, roundSize));
    // 시작 집계 — 공유율·완주율의 분모가 된다(이게 없으면 dj_cup_shared 수를
    // 해석할 수 없다).
    trackEvent("dj_cup_started", { round_size: roundSize });
    // 첫 곡은 위젯 본체 스크립트를 브라우저가 처음 받는 순간이라
    // "따뜻해도 930ms" 구조 그대로 지연이 드러난다 — 그 이탈을 미리 막는다.
    // 뒤로 갈수록 스크립트가 캐시되고 백그라운드 예열 큐가 따라잡아 빨라진다.
    toast("초반엔 로딩이 느릴 수 있어요! 점점 빨라집니다", { duration: 4000 });
  };

  const handleSelect = (winner: DjCupCandidate, loser: DjCupCandidate) => {
    if (!bracket) return;
    setBracket(advanceBracket(bracket, winner, loser));
  };

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-6">
      {!bracket && <DjCupStart pool={pool} onStart={handleStart} />}

      {bracket && (
        <DjCupPreloadProvider candidates={bracket.current}>
          {champion && (
            <DjCupResult
              champion={champion}
              roundSize={bracket.roundSize}
              winners={bracket.winners}
              losers={bracket.losers}
            />
          )}

          {!champion && match && (
            <>
              <DjCupMatch
                match={match}
                roundLabel={roundLabel(bracket.current.length)}
                progressLabel={`${bracket.matchIdx + 1} / ${bracket.current.length / 2}`}
                onSelect={handleSelect}
              />
              {/* 매치 밖에 고정 — 매치가 몇 번을 바뀌어도 이 컴포넌트 자신은
                  리마운트되지 않아야 예열된 iframe들이 유지된다. */}
              <div className="mt-2.5 bg-card border border-border rounded-2xl px-3 py-2.5">
                <DjCupPlayerSlot />
              </div>
            </>
          )}
        </DjCupPreloadProvider>
      )}
    </div>
  );
}
