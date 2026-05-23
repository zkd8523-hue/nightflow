/**
 * 영업중 여부 판단 (베스트-에포트).
 * operating_hours는 admin이 자유 텍스트로 입력 ("금/토 22:00-05:00", "연중무휴" 등).
 * 모호하면 "unknown" 폴백 — false-positive(닫혔는데 열림)는 유저 헛걸음 = 신뢰 추락.
 */

export type OpeningStatus = "open" | "closed" | "unknown";

// 한국 요일 매핑 (월=1, 일=0)
const KO_DAY_TO_IDX: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

/**
 * "금/토", "금~일", "수,목,금,토,일" 같은 표현에서 요일 인덱스 집합 추출.
 * 매칭 실패 시 null.
 */
function extractDays(text: string): Set<number> | null {
  const days = new Set<number>();

  // 범위 표기: "수~일", "금-일"
  const rangeMatch = text.match(/([월화수목금토일])\s*[~\-–—]\s*([월화수목금토일])/);
  if (rangeMatch) {
    const start = KO_DAY_TO_IDX[rangeMatch[1]];
    const end = KO_DAY_TO_IDX[rangeMatch[2]];
    if (start !== undefined && end !== undefined) {
      // 요일은 순환이므로 start > end면 wrap (예: 토~월 = 토,일,월)
      let i = start;
      // 최대 7회 반복 안전장치
      for (let n = 0; n < 7; n++) {
        days.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      return days;
    }
  }

  // 나열: "금/토", "금,토,일", "금토일"
  // text에 등장하는 한국 요일 문자를 모두 수집
  const matches = text.match(/[월화수목금토일]/g);
  if (matches && matches.length > 0) {
    for (const m of matches) {
      const idx = KO_DAY_TO_IDX[m];
      if (idx !== undefined) days.add(idx);
    }
    return days;
  }

  return null;
}

/**
 * "22:00-05:00" 같은 시간 범위 추출.
 * end가 start보다 작으면 다음날까지 영업 (예: 22:00-05:00).
 */
function extractTimeRange(text: string): { startMin: number; endMin: number } | null {
  const m = text.match(/(\d{1,2})\s*:\s*(\d{2})\s*[~\-–—]\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (!m) return null;
  const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  let endMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  if (endMin <= startMin) endMin += 24 * 60; // 다음날까지
  return { startMin, endMin };
}

export function getOpeningStatus(
  operatingHours: string | null | undefined,
  now: Date = new Date()
): OpeningStatus {
  if (!operatingHours) return "unknown";
  const text = operatingHours.trim();
  if (!text) return "unknown";

  // 1. 항상 영업
  if (/연중무휴|24시간|24h|매일/i.test(text)) {
    return "open";
  }

  // 2. 명시적 휴무 (단독 텍스트만)
  if (/^(휴무|휴업|영업\s*종료|closed)$/i.test(text)) {
    return "closed";
  }

  // 3. 요일 매칭
  const days = extractDays(text);
  const timeRange = extractTimeRange(text);

  // 둘 다 못 뽑으면 unknown
  if (!days && !timeRange) return "unknown";

  const currentDay = now.getDay();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  // 요일이 명시됐고, 현재 요일이 매칭 범위 밖이면
  // — 새벽 마감(다음날 끝나는) 케이스 처리: 어제 영업 중이 오늘 새벽까지 이어질 수 있음
  if (days) {
    const yesterday = (currentDay + 6) % 7;
    const isInListedDay = days.has(currentDay);
    const isYesterdayCarryOver = days.has(yesterday) && timeRange && timeRange.endMin > 24 * 60 && currentMin < (timeRange.endMin - 24 * 60);

    if (!isInListedDay && !isYesterdayCarryOver) {
      return "closed";
    }

    // 요일 일치하지만 시간 미지정 → 일단 영업으로 간주
    if (!timeRange) return "open";

    // 어제 carry-over 케이스
    if (isYesterdayCarryOver) return "open";

    // 오늘 영업 + 시간 매칭
    if (currentMin >= timeRange.startMin && currentMin < timeRange.endMin) {
      return "open";
    }
    // 새벽 시간(0-5시): 어제 listed day가 아니면 closed
    return "closed";
  }

  // 시간만 있고 요일 없음 → 매일 그 시간으로 간주
  if (timeRange) {
    if (currentMin >= timeRange.startMin && currentMin < timeRange.endMin) {
      return "open";
    }
    // 다음날까지 영업 (새벽) 케이스
    const wrappedNow = currentMin + 24 * 60;
    if (wrappedNow >= timeRange.startMin && wrappedNow < timeRange.endMin) {
      return "open";
    }
    return "closed";
  }

  return "unknown";
}
