"use client";

// 앱 피드백 프롬프트 노출을 위한 "인게이지먼트 점수" — 기기 로컬 저장(서버 왕복 없음).
// 팝업을 진입 즉시 띄우지 않고, 유저가 어느 정도 써본 뒤에만 뜨게 하기 위함.

const SCORE_KEY = "naflFeedbackScore";
const DEDUP_KEY = "naflFeedbackDedup";       // 세션 내 중복 가산 방지 (JSON string[])
const SNOOZE_KEY = "naflFeedbackSnoozeUntil"; // "다음에" 누르면 이 시각까지 재노출 안 함(ms)

/** 임계 점수 — 이 이상이면 프롬프트 후보. 상세 열람 ~3회 수준. */
export const FEEDBACK_THRESHOLD = 3;
/** "다음에" 누르면 다시 안 뜨는 기간 — 30일. 이후 조건 만족 시 1회 재노출. */
export const FEEDBACK_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

function read(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * 인게이지먼트 점수 가산.
 * @param weight 가산치 (상세 열람 +1, 홈 스크롤 +1, 깃발 등록 즉시 임계 등)
 * @param dedupKey 지정 시 세션 내 1회만 가산 (예: 같은 상세 puzzle id 새로고침 인플레 방지)
 */
export function bumpFeedbackEngagement(weight = 1, dedupKey?: string): void {
  try {
    if (dedupKey) {
      const seen: string[] = JSON.parse(sessionStorage.getItem(DEDUP_KEY) || "[]");
      if (seen.includes(dedupKey)) return;
      seen.push(dedupKey);
      sessionStorage.setItem(DEDUP_KEY, JSON.stringify(seen));
    }
    localStorage.setItem(SCORE_KEY, String(read(SCORE_KEY) + weight));
  } catch {
    /* localStorage 접근 불가(시크릿 등) 시 무시 */
  }
}

export function getFeedbackScore(): number {
  return read(SCORE_KEY);
}

/** "다음에" 누름 — 지금부터 30일간 재노출 안 함. */
export function snoozeFeedback(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + FEEDBACK_SNOOZE_MS));
  } catch {
    /* noop */
  }
}

/** 아직 snooze 기간(30일) 안이면 true → 프롬프트 숨김. */
export function isFeedbackSnoozed(): boolean {
  const until = read(SNOOZE_KEY);
  return until > 0 && Date.now() < until;
}
