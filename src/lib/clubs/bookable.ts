// 외국인 트랙(en/ja/zh/zh-tw) "즉시 예약 가능" 판정.
//
// 배경: 승인 클럽 106곳 중 실제로 예약을 중개할 수 있는 건 일부뿐이다.
// 중개하려면 두 가지가 모두 있어야 한다.
//   1) 주대 데이터(club_menu_items) — 손님이 메뉴를 골라 금액을 확정하는 구조라 필수
//   2) 그 클럽과 예약 중개를 상의·승인했다는 사실
// 둘 중 하나라도 없으면 폼까지 가도 예약이 성립하지 않는다.
//
// 2번은 두 갈래로 성립한다(2026-09-10). 담당 MD가 club_partners에 연결됐거나
// (파트너 가입까지 끝난 기존 클럽), clubs.foreign_booking_agreed가 켜졌거나
// (콜드 DM으로 구두 승인만 받은 클럽 — 파트너 가입은 실제 주문이 들어온 뒤에
// 요청하는 순서라 이 시점엔 MD가 없는 게 정상).
//
// 그런데 예약 안 되는 클럽 페이지도 지우지 않는다(2026-09-06 SEO 검토 결론).
// 클럽 상세 직접 진입이 외국인 유입의 28.6%로 1위이고, 그 상위권 대부분이
// 예약 불가 클럽이다 — 카탈로그를 잘라내면 유입 통로 자체가 사라진다.
// 대신 CTA만 상태별로 분기한다: 가능 = 예약 버튼, 불가 = 준비중 + 대안 제시.
//
// ⚠️ 조각·깃발(puzzles)은 이 판정을 쓰지 않는다 — 주대·MD 유무와 무관하게 동작하므로
//    거기 로직을 끌어다 쓰면 안 된다.
// 한국인 클럽 상세(/clubs/[id])의 예약 스티키바(2026-09-06 추가)는 예외적으로 이 판정을
// 그대로 재사용한다 — 외국인과 동일하게 "MD가 직접 자리를 잡아주는" 컨시어지 모델이라
// 게이팅 기준이 같다(ClubDetailContent.tsx의 bookable 변수 참고).

export type BookableInput = {
  /** 담당 MD가 붙어 있는가. 각 페이지가 partners 조인으로 계산해 넘긴다. */
  has_md?: boolean;
  /** 주대(club_menu_items)가 등록돼 있는가. */
  has_menu?: boolean;
  /**
   * 외국인 예약 중개를 클럽과 상의·승인했는가(clubs.foreign_booking_agreed, Migration 666).
   * has_md와 별개 축 — 콜드 DM으로 구두 승인만 받고 아직 파트너 가입 전인 클럽
   * (예: Lion Super Club — 주대 49개·MD 0)도 이걸로 예약 가능이 된다.
   */
  agreed?: boolean;
  /** 제외 목록 대조용. 안 넘기면 제외 검사 없이 메뉴 유무만 본다. */
  name?: string | null;
};

// 메뉴판은 있지만 외국인 예약 중개에서 빼는 클럽(사용자 결정, 2026-09-10).
// 컬럼을 새로 파는 대신 이름 목록 — 2곳뿐이고 바뀌면 여기 한 줄만 고친다.
const FOREIGN_BOOKING_EXCLUDED = new Set(["Awesome Red", "Waikiki"]);
export function isForeignBookingExcluded(name: string | null | undefined): boolean {
  return !!name && FOREIGN_BOOKING_EXCLUDED.has(name.trim());
}

/**
 * 이 클럽을 지금 즉시 예약 중개할 수 있는가.
 *
 * 기준 = 주대(메뉴판) + "상의됐다"는 신호(has_md 또는 agreed).
 *
 * 메뉴판만으로는 부족하다 — 사진을 읽어 구조화한 가격 정보일 뿐, 그 클럽이
 * "우리 이름으로 손님 예약을 받아도 된다"고 승낙했는지와는 별개다. 한때
 * has_menu만 보게 완화했다가 상의한 적 없는 B1(메뉴 15개·MD 0)이 예약 가능으로
 * 노출됐다(2026-09-10 발견).
 *
 * 반대로 has_md만 요구하면 콜드 DM 영업이 막힌다. 파트너 가입은 클럽 담당자가
 * 직접 해야 하는 일이라, 승인 직후가 아니라 실제 주문이 들어온 뒤에 요청하는
 * 순서로 간다 — 그때까지 bookable이 아니면 주문 자체가 들어올 수 없다.
 * 그래서 승인 사실을 clubs.foreign_booking_agreed로 따로 기록하고(Migration 666),
 * 둘 중 하나만 있어도 상의된 것으로 본다.
 */
export function isBookable(club: BookableInput): boolean {
  if (isForeignBookingExcluded(club.name)) return false;
  return Boolean(club.has_menu) && (Boolean(club.has_md) || Boolean(club.agreed));
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
