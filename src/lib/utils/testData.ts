/**
 * 테스트/운영자 데이터 노출 정책 — 단일 진실 소스(SSOT).
 *
 * 규칙: 프로덕션에서만 테스트 데이터를 숨기고, 로컬·프리뷰에서는 노출한다.
 *   (개발/디버깅 중에는 테스트 클럽·깃발을 봐야 하므로)
 *
 * 식별 기준은 is_test 컬럼:
 *   - 클럽/조각/핫딜 → clubs.is_test
 *   - 깃발(puzzle)   → leader(users).is_test  (club_id 없음)
 *
 * NEXT_PUBLIC_VERCEL_ENV 는 Vercel 프로덕션 배포에서만 "production".
 * 로컬(undefined)·프리뷰("preview")에서는 SHOW_TEST_DATA=true.
 *
 * 기존 핫딜 쪽 SHOW_TEST_CLUBS 와 동일한 판정식이며, 이 모듈로 통일한다.
 */
export const SHOW_TEST_DATA =
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

/**
 * Supabase 쿼리에 "테스트 데이터 제외" 필터를 환경 조건부로 적용한다.
 *
 * - 프로덕션: `<embedRef>.is_test = false` 필터를 건다 (테스트 데이터 숨김).
 * - 로컬/프리뷰: 필터를 걸지 않고 쿼리를 그대로 통과시킨다 (테스트 데이터 노출).
 *
 * @param query  Supabase 쿼리 빌더 (체이닝 중간)
 * @param embedRef  is_test 가 위치한 테이블/임베드 참조명.
 *                  - 직접 컬럼이면 "is_test" 가 아니라 컬럼 없이 적용되도록 빈 문자열 대신
 *                    테이블명 생략 → `hideTestData(q, "")` 는 `q.eq("is_test", false)`.
 *                  - 임베디드 조인이면 조인된 테이블명 (예: "clubs", "users").
 *
 * @example
 *   // 직접 컬럼 (clubs 테이블 자체 조회)
 *   hideTestData(supabase.from("clubs").select("id"), "")
 *
 *   // 임베디드 조인 (auctions → clubs!inner)
 *   hideTestData(
 *     supabase.from("auctions").select("*, club:clubs!inner(...)"),
 *     "clubs"
 *   )
 */
export function hideTestData<T>(query: T, embedRef: string): T {
  if (SHOW_TEST_DATA) return query;
  const column = embedRef ? `${embedRef}.is_test` : "is_test";
  // Supabase 쿼리 빌더는 .eq 체이닝 후 동일 타입을 반환한다.
  return (query as { eq: (col: string, val: boolean) => T }).eq(column, false);
}

/**
 * 외국인(/en 트랙) 깃발을 프로덕션에서만 숨긴다 — 외국인 트랙 정식 출시 전 임시 가드.
 *
 * - 프로덕션: leader.country_code IS NULL 인 깃발만 노출 (= 내국인 깃발만).
 * - 로컬/프리뷰: 필터 없이 그대로 (개발 중 외국인 깃발 확인 가능).
 *
 * 식별 기준은 leader(users).country_code — 외국인은 가입 시 국가코드가 채워진다.
 *
 * ⚠️ 외국인 트랙(깃발 상세 영문화·MD 오퍼·매치 플로우)이 완성되면 이 호출만 제거하면
 *    외국인 깃발 ↔ 한국 MD 양면시장이 프로덕션에서 열린다. (제거 = 출시 스위치)
 *
 * @param query     Supabase 쿼리 빌더 (체이닝 중간)
 * @param leaderRef leader(users) 임베드 참조명. hideTestData 와 동일 규약 (보통 "users").
 */
export function hideForeignerFlags<T>(query: T, leaderRef: string): T {
  if (SHOW_TEST_DATA) return query;
  // 외국인 = country_code 가 채워졌고 'KR'이 아닌 유저.
  // country_code IS NULL(내국인 기본) 또는 'KR'(/en 트랙 등으로 국가코드가 채워진 내국인)은 노출.
  // ⚠️ 예전엔 country_code IS NULL 만 노출 → 네이버 블로그를 영어(/en)로 보고 가입한 한국인은
  //    country_code="KR"이 채워져서, 내국인인데도 깃발이 한국 홈에서 통째로 사라지는 버그가 있었음.
  const orFilter = "country_code.is.null,country_code.eq.KR";
  if (leaderRef) {
    return (query as { or: (f: string, o: { referencedTable: string }) => T })
      .or(orFilter, { referencedTable: leaderRef });
  }
  return (query as { or: (f: string) => T }).or(orFilter);
}
