/**
 * 검색어·후보 텍스트 공통 정규화 (전 화면 단일 규칙).
 *
 * 소문자로 낮추고 영숫자·한글만 남긴다 — 공백과 기호(`:`, `&`, `.`)를 버리므로
 * "하잎 서울"/"하잎서울", "A:tension"/"atension"이 자동으로 같아진다.
 * 덕분에 띄어쓰기 변형을 별칭으로 중복 등록할 필요가 없다.
 *
 * ⚠️ 한글↔영문 표기 차이("볼레로"↔"Bolero")는 이 함수로 해결되지 않는다.
 *    그건 clubs.aliases(DB) 데이터로만 풀린다.
 *
 * ⚠️ DJ/아티스트의 `normalized` 컬럼은 lib/lineups/djName.ts의 normalizeDjName이
 *    담당한다(DB UNIQUE 제약과 결합돼 있어 규칙이 다르다). 혼동 주의.
 */
export function normalizeSearchText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

/**
 * 후보 문자열들 중 하나라도 검색어를 부분포함하면 true.
 * 빈 검색어는 true(= 필터 미적용).
 *
 * 각 후보를 개별 정규화해 비교한다 — 하나로 join하면 "클럽명 끝 + 지역 앞"처럼
 * 경계를 넘는 우연한 일치가 생긴다.
 */
export function matchesQuery(
  haystacks: Array<string | null | undefined>,
  rawQuery: string
): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  return haystacks.some((h) => {
    if (!h) return false;
    return normalizeSearchText(h).includes(q);
  });
}
