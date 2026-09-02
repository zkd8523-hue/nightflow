import { youtubeVideoId } from "@/lib/lineups/youtubeUrl";
import type { DjCupBracketState, DjCupCandidate, DjCupMatch, RoundSize } from "./types";

/** 재생 가능한 후보만 남긴다 — 유튜브 채널 URL(임베드 차단)은 사클도 없으면 제외.
 *  재생이 안 되는 카드가 대결에 나오면 고를 근거가 사라진다. */
export function isPlayableCandidate(dj: DjCupCandidate): boolean {
  if (dj.soundcloud_url) return true;
  return youtubeVideoId(dj.youtube_url) !== null;
}

/** crypto.getRandomValues 기반 Fisher-Yates. Math.random()은 브라우저마다 편향이
 *  알려져 있어, 149→128을 뽑을 때 하위 후보가 구조적으로 덜 나오면 랭킹 통계가
 *  오염된다(승률/우승비율이 실제 인기가 아니라 셔플 편향을 반영하게 된다). */
function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  const rand = new Uint32Array(arr.length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 2 ** 32);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 후보 풀에서 라운드 크기만큼 무작위 추출.
 *  시드는 쓰지 않는다 — 공유가 결과가 아니라 시작 링크라 대진 재현 요구가 없다. */
export function pickCandidates(pool: DjCupCandidate[], size: number): DjCupCandidate[] {
  return shuffle(pool).slice(0, size);
}

/** pool.length >= size 인 라운드만 활성화한다. 하드코딩 금지 —
 *  DJ가 늘거나 줄면 이 함수 하나로 자동 반영된다. */
export function availableRoundSizes(poolSize: number, allSizes: readonly RoundSize[]): RoundSize[] {
  return allSizes.filter((size) => poolSize >= size);
}

export function createBracket(candidates: DjCupCandidate[], roundSize: RoundSize): DjCupBracketState {
  return {
    roundSize,
    current: candidates,
    next: [],
    matchIdx: 0,
    winners: [],
    losers: [],
  };
}

export function currentMatch(state: DjCupBracketState): DjCupMatch | null {
  const a = state.current[state.matchIdx * 2];
  const b = state.current[state.matchIdx * 2 + 1];
  if (!a || !b) return null;
  return { a, b };
}

/** 다음 최대 2매치(최대 4명)의 재생 URL 소스를 반환 — 예열 대상 산정용.
 *  라운드 전체를 예열하면 keepalive fetch가 동시 연결 한도에 걸려 첫 매치가
 *  오히려 느려진다(DjDiscoveryCard와 동일 판단). */
export function upcomingCandidates(state: DjCupBracketState, count = 2): DjCupCandidate[] {
  const out: DjCupCandidate[] = [];
  let idx = state.matchIdx;
  const pool = state.current;
  while (out.length < count * 2) {
    const a = pool[idx * 2];
    const b = pool[idx * 2 + 1];
    if (!a || !b) {
      // 이번 라운드가 끝나는 지점 — 다음 라운드(next)로는 아직 못 넘어간다
      // (승자가 아직 안 정해졌으므로). 여기서 멈춘다.
      break;
    }
    out.push(a, b);
    idx++;
  }
  return out;
}

/** 선택 결과를 반영한 다음 상태. 라운드가 끝나면 current/next를 교체한다. */
export function advanceBracket(
  state: DjCupBracketState,
  winner: DjCupCandidate,
  loser: DjCupCandidate
): DjCupBracketState {
  const winners = [...state.winners, winner.id];
  const losers = [...state.losers, loser.id];
  const next = [...state.next, winner];
  const matchIdx = state.matchIdx + 1;

  if (next.length === state.current.length / 2) {
    if (next.length === 1) {
      // 우승자 확정 — current를 1명짜리로 남겨 isChampion 판정에 쓴다
      return { ...state, current: next, next: [], matchIdx: 0, winners, losers };
    }
    return { ...state, current: next, next: [], matchIdx: 0, winners, losers };
  }

  return { ...state, next, matchIdx, winners, losers };
}

export function isChampionDecided(state: DjCupBracketState): boolean {
  return state.current.length === 1 && state.next.length === 0 && state.matchIdx === 0;
}
