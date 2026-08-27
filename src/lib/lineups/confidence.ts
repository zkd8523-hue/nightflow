/**
 * 라인업 초안의 자동 게시 가능 여부를 판단하는 신뢰도 점수.
 *
 * 순수 함수 — 자동(collect-ig-lineups) / 수동(parse-poster) 양쪽이 동일하게 호출하고,
 * 유닛 테스트가 가능해야 한다. DB나 외부 상태에 의존하지 않는다.
 *
 * 임계값(AUTO_PUBLISH_MIN_SCORE=85)은 검증된 값이 아니라 가설이다. 처음 2~3주는
 * IG_AUTO_PUBLISH_ENABLED를 꺼둔 채로 이 점수와 실제 정확도의 상관을 관찰한 뒤 조정한다.
 */

export const AUTO_PUBLISH_MIN_SCORE = 85;

export interface ConfidenceSetInput {
  raw_name: string;
  /** 정규화된 시간(분). null이면 판독 실패로 감점. */
  start_min: number | null;
  end_min: number | null;
  /** dj_aliases 매칭 결과. null이면 미매칭(신규 DJ이거나 OCR 오독). */
  matchedDjId: string | null;
}

export interface ConfidenceInput {
  sets: ConfidenceSetInput[];
  eventDateResolved: boolean;
  /** 날짜를 어디서 확정했는지. media_timestamp 추정은 예고 포스터일 경우 틀릴 수 있어 감점. */
  eventDateSource: 'poster' | 'caption' | 'media_timestamp' | null;
  doorOpenMin: number | null;
  /** normalizeParsedLineup에서 형식 오류로 통째로 버려진 행 수. */
  droppedRowCount: number;
}

export interface ConfidenceResult {
  score: number;
  detail: Record<string, number>;
  /** 하나라도 있으면 점수와 무관하게 자동 게시 불가. */
  blockers: string[];
}

const GAP_TOLERANCE_MIN = 15;

export function scoreLineup(input: ConfidenceInput): ConfidenceResult {
  const detail: Record<string, number> = {};
  const blockers: string[] = [];
  let score = 100;

  const deduct = (key: string, amount: number) => {
    if (amount <= 0) return;
    detail[key] = (detail[key] ?? 0) + amount;
    score -= amount;
  };

  // --- blockers (점수 계산과 별개로 자동 게시를 막는다) ---
  if (!input.eventDateResolved) {
    blockers.push('no_date');
  }
  if (input.sets.length < 2) {
    blockers.push('too_few_sets');
  }

  // --- 감점 항목 ---
  const unmatchedCount = input.sets.filter((s) => s.matchedDjId === null).length;
  deduct('unmatched_dj', unmatchedCount * 25);

  const unreadTimeCount = input.sets.filter((s) => s.start_min === null || s.end_min === null).length;
  deduct('unreadable_time', unreadTimeCount * 20);

  deduct('dropped_rows', input.droppedRowCount * 15);

  // 시간이 다 있는 행만 정렬/연속성/역행 검사 대상
  const timed = input.sets.filter(
    (s): s is ConfidenceSetInput & { start_min: number; end_min: number } =>
      s.start_min !== null && s.end_min !== null
  );

  // 시간 역행: 원래 순서(포스터 재생 순서) 그대로 정렬했을 때 순서가 바뀌면 감점
  const sortedByStart = [...timed].sort((a, b) => a.start_min - b.start_min);
  const isReversed = timed.some((s, i) => s !== sortedByStart[i]);
  if (isReversed) {
    deduct('time_reversed', 20);
  }

  // 시간 슬롯 불연속: 이전 end != 다음 start (15분 이내 갭은 허용)
  let discontinuities = 0;
  for (let i = 1; i < sortedByStart.length; i++) {
    const gap = sortedByStart[i].start_min - sortedByStart[i - 1].end_min;
    if (Math.abs(gap) > GAP_TOLERANCE_MIN) discontinuities += 1;
  }
  deduct('time_discontinuity', discontinuities * 10);

  if (input.eventDateSource === 'media_timestamp') {
    deduct('date_from_timestamp', 15);
  }

  if (input.sets.length > 20) {
    deduct('too_many_sets', 20);
  }

  if (input.doorOpenMin === null) {
    deduct('no_door_open', 5);
  }

  const clamped = Math.max(0, Math.min(100, score));

  return { score: clamped, detail, blockers };
}

/**
 * 자동 게시 가능 여부. score뿐 아니라 "미매칭 DJ 0명"을 별도 AND 조건으로 둔다.
 *
 * 이유: score만 보면 5명 중 1명 미매칭(-25점)이 다른 항목이 완벽할 때 85를 넘을 수 있다.
 * 그 상태로 자동 게시하면 dj_id NULL 행이 생기거나 새 DJ 엔티티가 무단 생성된다 —
 * 이게 "6개월 뒤 한 DJ가 12개 엔티티로 쪼개지는" 발생 경로다. 별칭 학습은 반드시
 * 사람이 승인해야 하므로, 미매칭이 하나라도 있으면 점수와 무관하게 큐로 보낸다.
 */
export function canAutoPublish(result: ConfidenceResult, sets: ConfidenceSetInput[]): boolean {
  if (result.blockers.length > 0) return false;
  if (result.score < AUTO_PUBLISH_MIN_SCORE) return false;
  const hasUnmatchedDj = sets.some((s) => s.matchedDjId === null);
  if (hasUnmatchedDj) return false;
  return true;
}
