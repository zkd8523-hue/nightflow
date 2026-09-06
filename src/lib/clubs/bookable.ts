// 외국인 트랙(en/ja/zh/zh-tw) "즉시 예약 가능" 판정.
//
// 배경: 승인 클럽 106곳 중 실제로 예약을 중개할 수 있는 건 일부뿐이다.
// 중개하려면 두 가지가 모두 있어야 한다.
//   1) 담당 MD(club_partners) — 실제로 테이블을 잡아줄 사람
//   2) 주대 데이터(club_menu_items) — 손님이 메뉴를 골라 금액을 확정하는 구조라 필수
// 둘 중 하나라도 없으면 폼까지 가도 예약이 성립하지 않는다.
//
// 그런데 예약 안 되는 클럽 페이지도 지우지 않는다(2026-09-06 SEO 검토 결론).
// 클럽 상세 직접 진입이 외국인 유입의 28.6%로 1위이고, 그 상위권 대부분이
// 예약 불가 클럽이다 — 카탈로그를 잘라내면 유입 통로 자체가 사라진다.
// 대신 CTA만 상태별로 분기한다: 가능 = 예약 버튼, 불가 = 준비중 + 대안 제시.
//
// ⚠️ 한국인 트랙(/clubs, (main))은 이 판정을 쓰지 않는다. 조각·깃발은
//    주대·MD 유무와 무관하게 동작하므로 여기 로직을 끌어다 쓰면 안 된다.

export type BookableInput = {
  /** 담당 MD가 붙어 있는가. 각 페이지가 partners 조인으로 계산해 넘긴다. */
  has_md?: boolean;
  /** 주대(club_menu_items)가 등록돼 있는가. */
  has_menu?: boolean;
};

/** 이 클럽을 지금 즉시 예약 중개할 수 있는가. */
export function isBookable(club: BookableInput): boolean {
  return Boolean(club.has_md) && Boolean(club.has_menu);
}

// 서버/브라우저 클라이언트를 모두 받는다. supabase-js의 제네릭이 호출부마다
// 달라 정확히 맞추기 어렵고, 여기서 쓰는 건 rpc/from 두 개뿐이라 최소로만 좁힌다.
type MinimalClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (t: string) => {
    select: (c: string) => {
      range: (a: number, b: number) => PromiseLike<{ data: { club_id: string }[] | null }>;
    };
  };
};

/**
 * 주대가 등록된 club_id 집합. 목록에서 클럽마다 조회하면 N+1이라 한 번만 부른다.
 *
 * ⚠️ club_menu_items를 통째로 select 하면 안 된다 — 항목이 1,100행을 넘어
 * PostgREST 기본 상한(1000행)에 잘리고, 잘린 뒤쪽 클럽이 조용히 "주대 없음"으로
 * 판정된다. 실제로 부산 3곳이 이 이유로 배지가 사라졌다(2026-09-06).
 * 그래서 행이 아니라 "서로 다른 club_id"만 받는 RPC를 쓴다.
 *
 * RPC가 없거나 실패하면 range로 전량을 페이지네이션해 받아 폴백한다 —
 * 이 정보가 없다고 페이지 전체가 죽으면 안 되고, 조용히 잘린 목록을 쓰느니
 * 느려도 정확한 게 낫다.
 */
export async function fetchMenuClubIds(supabase: MinimalClient): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.rpc("club_ids_with_menu");
    if (!error && Array.isArray(data)) {
      return new Set((data as { club_id: string }[]).map((r) => r.club_id));
    }
  } catch {
    // RPC 미배포 등 — 아래 폴백으로 간다.
  }

  // 폴백: 1000행씩 끊어 전부 읽는다.
  const ids = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data } = await supabase
      .from("club_menu_items")
      .select("club_id")
      .range(from, from + PAGE - 1);
    const rows = data ?? [];
    for (const r of rows) ids.add(r.club_id);
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** 클럽 한 줄 소개(Migration 650). 언어별로 따로 쓴 문장을 고른다. */
export type ClubTaglines = {
  tagline_ko?: string | null;
  tagline_en?: string | null;
  tagline_ja?: string | null;
  tagline_zh?: string | null;
  tagline_zh_tw?: string | null;
};

/**
 * 그 언어로 쓴 소개가 있으면 그것만 쓴다. 없으면 빈 문자열 —
 * 다른 언어 문장으로 폴백하지 않는다. 영어권 손님에게 한국어 문장을 보여주는 건
 * 없는 것만 못하고, 이 기능의 값어치는 "그 언어로 골라 쓴 표현"에 있다.
 */
export function clubTagline(
  club: ClubTaglines,
  lang: "ko" | "en" | "ja" | "zh" | "zh-tw",
): string {
  const raw =
    lang === "ko" ? club.tagline_ko
    : lang === "ja" ? club.tagline_ja
    : lang === "zh" ? club.tagline_zh
    : lang === "zh-tw" ? club.tagline_zh_tw
    : club.tagline_en;
  return raw?.trim() ?? "";
}
