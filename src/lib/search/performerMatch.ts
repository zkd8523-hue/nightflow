import { matchesQuery } from "./normalize";

/**
 * DJ·아티스트 검색의 최소 형태.
 * djs(라인업)와 artists(공연)는 별개 마스터 테이블이지만 검색 관점의 모양은 같아
 * 매칭 함수만 공유한다 — 테이블을 합치자는 뜻은 아니다.
 */
export interface PerformerSearchable {
  display_name: string;
  instagram?: string | null;
  /** dj_aliases 또는 artist_aliases의 alias 목록 */
  aliases?: string[] | null;
}

export function performerMatchesQuery(p: PerformerSearchable, rawQuery: string): boolean {
  return matchesQuery([p.display_name, p.instagram ?? "", ...(p.aliases ?? [])], rawQuery);
}
