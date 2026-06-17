/**
 * 클럽 워드클라우드 — 정규화 / 검증 / 집계 유틸
 *
 * - 5자 리뷰, 인당 1~2개.
 * - 집계는 클라이언트에서 처리 (정규화 키로 빈도 합산, 표시 라벨은 최빈 원본 표기).
 * - 입력 검증과 표시 집계가 같은 normalizeWord를 공유해 단어 통일 보장.
 */

export const MAX_WORD_LEN = 5;
export const MAX_WORDS = 2;

export type WordCloudEntry = {
  label: string; // 표시용 (최빈 원본 표기)
  normalized: string; // 집계 키
  count: number;
};

// ── 비속어 필터 ───────────────────────────────────────────
// 5자 리뷰 맥락의 흔한 욕설/혐오 표현. 완벽 차단은 불가하나 명백한 것 거름.
// 매칭은 "필터용 정규화"(공백·특수문자 제거 + 흔한 치환) 후 부분 포함 검사.
const PROFANITY_LIST = [
  // 욕설
  "시발", "씨발", "시바", "씨바", "시팔", "씨팔", "ㅅㅂ", "ㅆㅂ",
  "병신", "ㅂㅅ", "븅신", "지랄", "ㅈㄹ", "좆", "좃", "존나", "ㅈㄴ",
  "개새", "새끼", "쌔끼", "썅", "씹", "닥쳐", "꺼져", "엿먹",
  "fuck", "shit", "bitch", "asshole", "dick",
  // 성적/혐오
  "보지", "자지", "섹스", "야동", "창녀", "걸레", "느금", "엄창",
  // 차별/혐오 표현
  "한남", "한녀", "김치녀", "된장녀", "맘충", "급식충", "틀딱",
];

// 공백·특수문자 제거 (ㅅ.ㅂ, 시 발 같은 우회 차단)
function profanityNormalize(raw: string): string {
  return raw.toLowerCase().replace(/[\s.,!?~*\-_()/]/g, "");
}

/** 비속어 포함 여부 (글자 사이 끼워넣기 우회까지 일부 대응) */
export function containsProfanity(raw: string): boolean {
  const base = profanityNormalize(raw);
  if (!base) return false;
  // 1) 기본 매칭  2) 숫자/특수문자를 글자 사이에 끼운 우회(씨1발) 대응 — 숫자 제거판도 검사
  const stripped = base.replace(/[0-9]/g, "");
  return PROFANITY_LIST.some((bad) => {
    const b = profanityNormalize(bad);
    return base.includes(b) || stripped.includes(b);
  });
}

/** 집계 통일용 정규화 키: 소문자 + 연속공백 1칸 + 양끝 trim */
export function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 공백 제외 글자수 (공백은 카운트 안 함) */
export function nonSpaceLen(s: string): number {
  return s.replace(/\s/g, "").length;
}

/**
 * 공백 제외 글자수가 limit를 넘지 않게 잘라냄.
 * - 공백은 글자수에 미포함하되 **딱 1번만** 허용 (맨 앞 공백·연속/추가 공백 무시).
 * 한글 IME 조합 중 maxLength가 안 먹는 문제 직접 제어용.
 */
export function clampByNonSpace(s: string, limit: number): string {
  let count = 0;
  let usedSpace = false;
  let out = "";
  for (const ch of s) {
    if (/\s/.test(ch)) {
      // 첫 글자 앞 공백 금지, 공백은 1회만 허용
      if (count === 0 || usedSpace) continue;
      usedSpace = true;
      out += " ";
    } else {
      if (count >= limit) break;
      count++;
      out += ch;
    }
  }
  return out;
}

/**
 * 입력 단어 배열 검증/정제.
 * - 각 항목 trim, 빈칸 제거
 * - 5자 초과 잘라냄
 * - normalizeWord 기준 중복 제거(첫 원본 유지)
 * - 최대 2개로 슬라이스
 */
export function validateWords(inputs: string[]): {
  ok: string[];
  error?: string;
} {
  const seen = new Set<string>();
  const ok: string[] = [];
  for (const raw of inputs) {
    const trimmed = clampByNonSpace(raw, MAX_WORD_LEN).trim();
    if (!trimmed) continue;
    const norm = normalizeWord(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    ok.push(trimmed);
    if (ok.length >= MAX_WORDS) break;
  }
  if (ok.length === 0) {
    return { ok, error: "단어를 1개 이상 입력해주세요" };
  }
  return { ok };
}

/**
 * 여러 row(각자 words[])를 받아 빈도 집계.
 * 같은 normalized 그룹의 최빈 원본 표기를 label로, count 내림차순.
 */
export function aggregateWords(rows: { words: string[] }[]): WordCloudEntry[] {
  const map = new Map<
    string,
    { count: number; labels: Map<string, number> }
  >();
  for (const row of rows) {
    for (const raw of row.words ?? []) {
      const norm = normalizeWord(raw);
      if (!norm) continue;
      const cur = map.get(norm) ?? { count: 0, labels: new Map() };
      cur.count += 1;
      cur.labels.set(raw, (cur.labels.get(raw) ?? 0) + 1);
      map.set(norm, cur);
    }
  }
  const entries: WordCloudEntry[] = [];
  for (const [normalized, v] of map) {
    let label = normalized;
    let best = -1;
    for (const [orig, c] of v.labels) {
      if (c > best) {
        best = c;
        label = orig;
      }
    }
    entries.push({ label, normalized, count: v.count });
  }
  return entries.sort((a, b) => b.count - a.count);
}

/** 순서만 섞기 (크기/색은 빈도 유지 — 위치만 흩뿌려 "구름" 느낌) */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** placeholder 예시 — 감성 멘트 + ex)단어. 새로고침/클럽마다 랜덤 노출 */
export const PLACEHOLDER_HINTS: { mood: string; ex: string }[] = [
  { mood: "디제이가 미쳤어요", ex: "디제이맛집" },
  { mood: "성비 실화냐", ex: "성비깡패" },
  { mood: "입장만 한세월", ex: "웨이팅필수" },
  { mood: "춤추다 날 샜다", ex: "광질" },
  { mood: "여기 인테리어 좋지", ex: "인스타맛집" },
  { mood: "여기 언제 또 가지?", ex: "또갈집" },
  { mood: "하우스 노래 잘틀잖아", ex: "하우스성지" },
];
