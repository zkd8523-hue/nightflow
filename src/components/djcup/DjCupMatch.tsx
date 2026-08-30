"use client";

import { useEffect } from "react";
import { DjCupCard } from "./DjCupCard";
import { useDjCupPlayerManager } from "./DjCupPreloadedPlayer";
import type { DjCupCandidate, DjCupMatch as DjCupMatchType } from "@/lib/djCup/types";

/**
 * DJ 이상형 월드컵 1:1 대결 — B안(좌우 분할) 확정.
 *
 * ⚠️ 재생 위젯(<DjCupPlayerSlot/>)은 이 컴포넌트가 렌더하지 않는다 —
 * DjCupClient가 매치 트리 바깥에 단 하나만 고정으로 렌더한다. 예전엔
 * 여기서 사클/유튜브 폴백을 삼항으로 갈라 렌더했는데, 그 조건이 매치마다
 * 바뀌면 React가 그 자리를 리마운트해서 안에 있던 모든 예열 iframe이
 * 통째로 다시 만들어졌다(2매치부터 회색 빈 박스로 뜨던 버그). children으로
 * 슬롯을 받는 것도 매치가 바뀔 때마다 이 컴포넌트 자체가 언마운트되면
 * 같은 문제가 재발하므로 아예 매치 밖에 둔다.
 *
 * 동시 재생 2개는 여전히 불가능하다 — 매니저의 setActiveDjId가 이전 곡을
 * pause()하고 새 곡만 play()한다.
 *
 * ⚠️ 카드 탭은 토글이 아니다 — 항상 "그 DJ를 켠다"만 한다. 예전엔 재생 중인
 * 카드를 다시 누르면 setActiveDjId(null)로 꺼졌는데, 끄는 동작 자체가 이 화면에
 * 필요 없는 데다(둘 중 하나는 늘 재생 중인 게 맞다) 슬롯이 언마운트됐다가
 * 다시 마운트되면서 src 없는 빈 iframe만 남아 회색 박스가 됐다.
 * 멈추고 싶으면 위젯 안의 일시정지 버튼을 쓰면 된다.
 */
export function DjCupMatch({
  match,
  roundLabel,
  progressLabel,
  onSelect,
}: {
  match: DjCupMatchType;
  roundLabel: string;
  progressLabel: string;
  onSelect: (winner: DjCupCandidate, loser: DjCupCandidate) => void;
}) {
  const { activeDjId, setActiveDjId } = useDjCupPlayerManager();

  // 기본값을 A로 시작 — 매치마다 ▶를 누르는 수고를 없앤다.
  // ⚠️ 모바일(iOS·모바일 브라우저)은 user gesture 없는 자동재생을 차단한다.
  // 그 환경에서는 A 위젯이 무음으로 뜬 채 시작되고, 유저가 위젯 안의 재생
  // 버튼을 한 번 눌러야 소리가 난다. 데스크톱 웹에서는 즉시 소리가 난다.
  useEffect(() => {
    setActiveDjId(match.a.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.a.id, match.b.id]);

  return (
    <div className="flex flex-col">
      <p className="text-center text-[13px] font-black text-white tracking-[-0.02em] mb-2.5 tabular-nums">
        <span className="text-white">{roundLabel}</span>
        <span className="text-muted-foreground mx-1.5">·</span>
        <span className="text-muted-foreground">{progressLabel}</span>
      </p>

      <div className="flex gap-2 relative">
        <DjCupCard
          dj={match.a}
          variant="o"
          playing={activeDjId === match.a.id}
          onSelect={() => onSelect(match.a, match.b)}
          onPlay={() => setActiveDjId(match.a.id)}
        />
        <DjCupCard
          dj={match.b}
          variant="g"
          playing={activeDjId === match.b.id}
          onSelect={() => onSelect(match.b, match.a)}
          onPlay={() => setActiveDjId(match.b.id)}
        />

        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 z-[3] w-[34px] h-[34px] rounded-full bg-background border border-border flex items-center justify-center text-[12px] font-black text-white tracking-[-0.03em] shadow-[0_3px_16px_rgba(0,0,0,.75)]"
        >
          VS
        </span>
      </div>
    </div>
  );
}
