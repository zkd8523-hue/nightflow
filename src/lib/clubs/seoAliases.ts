import { getClubAliases, getPrimaryAlias } from "./aliases";

/**
 * SEO 메타데이터 전용 별칭 유틸 — 검색용 병합 유틸 `clubHaystack()`(lib/search/clubMatch.ts)의
 * 짝이다. clubHaystack은 정적 CLUB_ALIASES + DB clubs.aliases를 검색 매칭에만 합치고,
 * 이 파일은 같은 두 소스를 **제목·설명·키워드·JSON-LD**에 실을 형태로 가공한다.
 *
 * 감사 결과(2026-08-30): DB 한글 별칭이 SEO 메타로 흐르는 페이지가 0곳이었다 — 정적
 * 57곳만 쓰고 나머지 49곳은 별칭이 아예 없었다. 이 파일이 그 배선을 담당한다.
 */

// 클럽명 앞에 붙은 지역 접두어. 정적 대표명 중 일부가 이미 지역을 포함해서
// ("홍대 25") 제목에 다시 지역을 붙이면 "홍대 홍대 25(25)"처럼 중복이 났다
// (실서비스에서 확인된 라이브 버그). 제목 생성 전에 반드시 걷어낸다.
const AREA_PREFIXES = [
  "강남",
  "홍대",
  "이태원",
  "수원",
  "대구",
  "부산",
  "광주",
  "대전",
  "압구정",
  "청담",
  "신사",
];

// 제목에 병기하면 오히려 어색하거나 클릭률을 깎는 클럽 — id 기준으로 표시용
// 대표명 생성만 건너뛴다(검색·keywords·JSON-LD에는 계속 실린다. clubAllAliases는
// 이 목록을 참조하지 않는다).
//   XX / XX2   — 대표 표기가 자모 나열("엑엑")이라 제목에 못 쓴다
//   25         — 실제 유입 키워드는 "홍대 25클럽"이지 "트웬티파이브"가 아니다
//   Sanbu Sound Bar — DB 표기 "산부"가 어색하다
const DISPLAY_ALIAS_EXCLUDE = new Set<string>([
  "85d91b4f-1e9d-4281-a8f7-400c22161e43", // XX (홍대)
  "df39186b-b8b0-417f-beab-69a0cf748228", // XX2 (홍대)
  "96571129-fea9-4602-b9d1-5b2f6a6543ed", // 25 (홍대)
  "92e9c8ff-7bf2-4311-892c-6cdbd0bdb7da", // Sanbu Sound Bar (부산)
]);

export interface ClubAliasSource {
  id: string;
  name: string;
  /** clubs.aliases (Migration 231). 없으면 정적 소스만으로 동작한다. */
  aliases?: string[] | null;
}

function stripAreaPrefix(s: string): string {
  for (const area of AREA_PREFIXES) {
    if (s.startsWith(`${area} `)) return s.slice(area.length).trim();
  }
  return s;
}

/** 제목에 병기할 후보로 유효한지 — 한글 표기이고, 지역 제거 후 남는 게 있고,
 *  등록명과 같지 않아야 한다(같으면 "도깨비(도깨비)"처럼 의미 없는 중복이 된다). */
function toValidCandidate(raw: string | null | undefined, registeredName: string): string | null {
  if (!raw) return null;
  const stripped = stripAreaPrefix(raw.trim());
  if (!stripped) return null;
  if (!/[가-힣]/.test(stripped)) return null; // 한글 아니면 병기 의미 없음(Club FF → FF 등)
  if (stripped.toLowerCase() === registeredName.trim().toLowerCase()) return null;
  return stripped;
}

/**
 * 제목·H1용 한글 대표 별칭 하나. "정적 큐레이션 우선 → DB 첫 한글 표기 폴백" —
 * 정적 57곳은 사람이 고른 대표명이라 우선하고, 나머지 49곳은 DB에서 뽑는다.
 * DB 폴백은 공백 없는(합성어) 표기를 먼저 찾고, 없으면 공백 있는 표기(지역 제거
 * 후 남은 부분)까지 본다. 106/106 클럽에서 대표명이 나오는 것을 실측으로 확인했다.
 *
 * 별칭이 전혀 없거나(불가능 — DB 106곳 전부 보유) 제외 목록에 있으면 null.
 * 호출부는 null이면 등록명만 쓰면 된다(기존 getPrimaryAlias 폴백 규약과 동일).
 */
export function clubDisplayAlias(club: ClubAliasSource): string | null {
  if (DISPLAY_ALIAS_EXCLUDE.has(club.id)) return null;

  const staticPick = toValidCandidate(getPrimaryAlias(club.id), club.name);
  if (staticPick) return staticPick;

  const dbAliases = club.aliases ?? [];
  for (const a of dbAliases) {
    const pick = toValidCandidate(a, club.name);
    if (pick && !pick.includes(" ")) return pick;
  }
  for (const a of dbAliases) {
    const pick = toValidCandidate(a, club.name);
    if (pick) return pick;
  }
  return null;
}

/**
 * keywords / JSON-LD alternateName / sr-only 본문용 전체 별칭 합집합.
 * 정적 + DB를 대소문자 무시 중복 제거해서 합친다. DISPLAY_ALIAS_EXCLUDE는
 * 여기 적용하지 않는다 — 제목에 못 쓰는 표기도 검색·색인 가치는 그대로다.
 */
export function clubAllAliases(club: ClubAliasSource): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const a of [...(club.aliases ?? []), ...getClubAliases(club.id)]) {
    const trimmed = a.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      merged.push(trimmed);
    }
  }
  return merged;
}
