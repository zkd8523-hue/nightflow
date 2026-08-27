/**
 * 공연 상세 URL 슬러그 — /events/{event_date}/{slug}
 *
 * 배경: 승인 공연 492건이 /events 목록 하나에 뭉쳐 있어 공연마다 착지할 URL이 없었다.
 * "SENSI SOUND", "팔로알토 공연" 같은 고유명사 검색을 받을 페이지가 필요하다.
 *
 * 슬러그는 DB에 저장하지 않고 title에서 파생한다 — 컬럼·마이그레이션 없이 동작하고,
 * 제목이 고쳐지면 URL도 따라간다(clubs 쪽 clubSlug()와 같은 방침).
 *
 * 충돌 안전성: 제목 단독은 13종이 중복되지만(TENX10Ns 3건 등)
 * **제목+날짜 조합은 492/492 전부 고유**하다. 날짜가 경로에 있으므로 충돌하지 않는다.
 */

/**
 * "SENSI SOUND VOL.3 1부" → "sensi-sound-vol-3-1부"
 *
 * clubSlug()는 재사용할 수 없다 — 거긴 [^a-z0-9]를 전부 날려서
 * 한글 제목(492건 중 119건)이 빈 문자열이 된다. 여기서는 한글을 살린다.
 * 한글 URL은 퍼센트 인코딩되어 나가지만 구글·네이버 모두 정상 처리한다.
 */
export function eventSlug(title: string | null | undefined): string {
  // NFKC 정규화 먼저 — 인스타 제목에 유니코드 볼드/전각이 흔하다.
  // 𝗗𝗥𝗢𝗣𝗦𝗛𝗜𝗣𝗟𝗜𝗩𝗘 같은 수학 볼드 문자는 \w에 안 걸려서 슬러그가 통째로 비고,
  // 그러면 그 공연은 URL이 없어 영영 접근 불가가 된다. NFKC가 이를 ASCII로 되돌린다.
  const s = (title ?? "").normalize("NFKC").toLowerCase().trim();
  if (!s) return "";
  return s
    .replace(/&/g, " and ")
    // 한글·한자·영숫자·언더스코어만 남기고 나머지는 하이픈으로. 이모지·특수문자 제거.
    // 한자를 넣는 이유: "[多多多]" 같은 파티명이 실제로 있고, 빼면 슬러그가 비어
    // 그 공연만 URL이 없어진다.
    .replace(/[^\w가-힣\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    // slice가 하이픈 위에서 잘릴 수 있다
    .replace(/-+$/, "");
}

/** URL 세그먼트로 들어온 슬러그를 비교용으로 정규화(대소문자·인코딩 차이 흡수). */
export function normalizeSlugParam(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * "2026-09-05" 형태이고 실재하는 날짜인지 — 잘못된 경로를 쿼리 전에 걸러낸다.
 *
 * 검증은 반드시 UTC(`Z`)로 파싱한다. KST(`+09:00`)로 파싱하면 toISOString()이
 * 전날로 나와서 멀쩡한 날짜가 전부 거부된다. 여기는 달력 유효성만 보므로 시간대는 무관.
 * (2026-02-30 같은 값은 3월 2일로 굴러가므로 문자열 비교로 걸린다)
 */
export function isValidEventDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/**
 * 화면·메타에 쓸 제목. 슬러그와 달리 원문을 최대한 보존하되 **표기만** 정규화한다.
 *
 * 인스타 제목에 수학 볼드(𝗗𝗥𝗢𝗣𝗦𝗛𝗜𝗣𝗟𝗜𝗩𝗘)·전각 문자가 흔한데, 그대로 두면
 *  - 구글 검색결과 스니펫에서 깨져 보이고
 *  - 스크린리더가 "mathematical bold capital D"로 한 글자씩 읽는다.
 * NFKC가 이를 일반 ASCII로 되돌린다. 이모지·기호는 건드리지 않는다.
 */
export function displayTitle(title: string | null | undefined): string {
  return (title ?? "").normalize("NFKC").trim();
}

/** 검색결과 스니펫 길이(약 155자)에 맞춰 자른다. 단어 중간에서 끊지 않는다. */
export function clampDescription(text: string, max = 155): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,·\s]+$/, "") + "…";
}
