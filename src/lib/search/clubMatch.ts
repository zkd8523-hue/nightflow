import { getClubAliases } from "@/lib/clubs/aliases";
import { matchesQuery } from "./normalize";

/**
 * 클럽 검색의 최소 형태. 화면마다 들고 있는 클럽 타입이 달라 구조적 타이핑으로 받는다.
 * `aliases`(DB clubs.aliases)는 optional — 아직 select에 안 실은 화면도 정적 별칭만으로 동작한다.
 */
export interface ClubSearchable {
  id: string;
  name: string;
  area?: string | null;
  /** clubs.aliases (Migration 231). 운영자가 /admin/clubs/search-misses로 늘리는 쪽. */
  aliases?: string[] | null;
}

/**
 * 클럽 검색 haystack — 클럽명 + 지역 + DB 별칭 + 정적 별칭(aliases.ts).
 *
 * 별칭 소스가 둘로 갈라져 있는 것을 여기서만 흡수한다. 정적 파일을 걷어낼 때
 * (SEO용 primary_alias를 DB 컬럼으로 옮긴 뒤) 이 함수의 getClubAliases 한 줄만
 * 지우면 되고, 호출부는 손대지 않는다.
 */
export function clubHaystack(c: ClubSearchable): string[] {
  return [c.name, c.area ?? "", ...(c.aliases ?? []), ...getClubAliases(c.id)];
}

export function clubMatchesQuery(c: ClubSearchable, rawQuery: string): boolean {
  return matchesQuery(clubHaystack(c), rawQuery);
}
