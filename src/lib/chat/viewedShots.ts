/**
 * 본 SHOT 추적 (인스타 스토리 패턴)
 * - localStorage에 SHOT id 배열 저장
 * - SHOT은 9시간 휘발이라 누적 부담 적음
 * - 7일 지난 entry는 자동 정리 (최대 길이 500)
 */

const KEY = "wagle.viewedShots";
const MAX_LEN = 500;
const STALE_DAYS = 7;

type Entry = { id: string; at: number };

function read(): Entry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function write(entries: Entry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota 초과 등 무시 */
  }
}

export function getViewedShotIds(): Set<string> {
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const entries = read().filter((e) => e.at >= cutoff);
  return new Set(entries.map((e) => e.id));
}

export function markShotViewed(id: string) {
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const entries = read().filter((e) => e.at >= cutoff && e.id !== id);
  entries.push({ id, at: Date.now() });
  // 최대 길이 초과 시 오래된 것부터 자름
  const trimmed =
    entries.length > MAX_LEN ? entries.slice(-MAX_LEN) : entries;
  write(trimmed);
}
