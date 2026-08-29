import { pickUpcomingBenefit } from "@/lib/utils/hotdeal";
import { SEOUL_AREAS } from "@/lib/clubs/tags";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import type { HotdealBenefitsByDow } from "@/types/database";

/**
 * ClubBenefitSection("오늘 어디갈래?")가 그릴 카드 목록을 raw row에서 뽑아내는
 * 순수 가공 로직. page.tsx(RSC)에서 SSR로 호출해 props로 넘기기 위해 컴포넌트
 * 파일에서 분리했다 — "use client" 없이 서버/클라이언트 어디서나 호출 가능해야 한다.
 */

const isSeoulArea = (area: string | null) =>
  SEOUL_AREAS.includes(area as (typeof SEOUL_AREAS)[number]);

/** 배열 순서(셔플 등)는 유지한 채 서울(강남/홍대/이태원) 클럽을 앞으로 */
function seoulFirst<T extends { area: string | null }>(arr: T[]): T[] {
  const seoul = arr.filter((c) => isSeoulArea(c.area));
  const rest = arr.filter((c) => !isSeoulArea(c.area));
  return [...seoul, ...rest];
}

export interface ClubBenefitItem {
  club_id: string;
  club_name: string;
  club_area: string | null;
  club_thumbnail: string | null;
  benefit_text: string | null;
  benefit_tags: string[];
  md_count: number;
  fav_count: number;
}

const MAX_CARDS = 12;
const PRIORITY_GROUP_SIZE = 8;
// "오퍼 많은 그룹" 상위노출 큐레이션. 클럽 id 또는 이름(name)으로 지정.
// 여기 속한 클럽은 최상위(최대 PRIORITY_GROUP_SIZE개)로 노출되며, 이 그룹 내에서 새로고침마다 셔플.
// 비워두면 기존 혜택-우선 정렬을 그대로 사용 (비회귀).
const PRIORITY_CLUBS: string[] = [];
const HIDDEN_PATTERN = /운영자/;

export type ClubBenefitSlotRow = {
  club_id: string;
  benefits_by_dow: HotdealBenefitsByDow | null;
  expires_at: string;
};

export type ClubBenefitClubRow = {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  seed_favorite_count: number | null;
  club_partners: { md_id: string }[] | null;
};

export type ClubBenefitFavoriteRow = {
  club_id: string;
};

export function buildClubBenefitItems(
  slotsRows: ClubBenefitSlotRow[] | null,
  clubsRows: ClubBenefitClubRow[] | null,
  favoritesRows: ClubBenefitFavoriteRow[] | null
): ClubBenefitItem[] {
  // 이번 주 전체에서 "오늘부터 가장 가까운 다가오는 요일" 혜택 추출 (전 화면 공용 규칙).
  // 오늘 혜택이 없어도 이번 주 남은 요일 혜택을 미리 노출해 노출을 최대화한다.
  const slotMap = new Map<string, { text: string; tags: string[]; dowIdx: number }>();
  for (const s of slotsRows ?? []) {
    if (!s.club_id) continue;
    const ub = pickUpcomingBenefit(s.benefits_by_dow);
    if (ub && (ub.labeledText || ub.tags.length > 0)) {
      slotMap.set(s.club_id, { text: ub.labeledText, tags: ub.tags, dowIdx: ub.dowIdx });
    }
  }

  const rows = clubsRows ?? [];

  // 클럽별 좋아요 카운트 집계 (실제 row + seed_favorite_count)
  const favCountMap: Record<string, number> = {};
  for (const f of favoritesRows ?? []) {
    if (!f.club_id) continue;
    favCountMap[f.club_id] = (favCountMap[f.club_id] || 0) + 1;
  }
  for (const c of rows) {
    const seed = c.seed_favorite_count ?? 0;
    if (seed > 0) favCountMap[c.id] = (favCountMap[c.id] || 0) + seed;
  }
  const filtered = SHOW_TEST_DATA ? rows : rows.filter((c) => !HIDDEN_PATTERN.test(c.name));

  // Hot Deal Tonight 중복 제거 로직 제거 — 핫딜(daily_hotdeals) 폐기로 점유 클럽 개념이 사라짐.
  // 이제 모든 클럽이 "오늘 어디갈래?" 후보가 된다.
  const remaining = filtered;

  // 셔플 헬퍼 (Fisher-Yates) — 그룹 내 순서를 새로고침마다 랜덤화
  const shuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // "오퍼 많은 그룹" 큐레이션: PRIORITY_CLUBS에 속한 클럽을 최상위(최대 8)로 →
  // 그 그룹 안에서 셔플. 큐레이션이 비어있으면 priorityGroup=[] 이라 기존 동작과 동일.
  const priorityGroup = shuffle(
    remaining.filter((c) => PRIORITY_CLUBS.includes(c.id) || PRIORITY_CLUBS.includes(c.name))
  ).slice(0, PRIORITY_GROUP_SIZE);
  const prioritySet = new Set(priorityGroup.map((c) => c.id));
  const rest = remaining.filter((c) => !prioritySet.has(c.id));

  // 나머지: 혜택 있는 클럽 최우선 → 파트너(MD) 지정된 클럽 → 그 외.
  // 각 그룹 안에서는 서울(강남/홍대/이태원) 클럽을 지방 클럽보다 먼저 노출.
  // 혜택 클럽은 서울 여부 다음으로 "가장 가까운 혜택 요일(dowIdx)" 오름차순(=날짜순) 정렬.
  // 같은 요일끼리, 그리고 파트너/그외 그룹 내부(서울·지방 각각)는 셔플로 공정 노출.
  const withBenefit = shuffle(rest.filter((c) => slotMap.has(c.id)));
  withBenefit.sort((a, b) => {
    const aSeoul = isSeoulArea(a.area) ? 0 : 1;
    const bSeoul = isSeoulArea(b.area) ? 0 : 1;
    if (aSeoul !== bSeoul) return aSeoul - bSeoul;
    return (slotMap.get(a.id)?.dowIdx ?? 99) - (slotMap.get(b.id)?.dowIdx ?? 99);
  });
  const noBenefit = rest.filter((c) => !slotMap.has(c.id));
  const withPartner = seoulFirst(shuffle(noBenefit.filter((c) => (c.club_partners?.length ?? 0) > 0)));
  const withoutPartner = seoulFirst(shuffle(noBenefit.filter((c) => (c.club_partners?.length ?? 0) === 0)));
  let ordered = [...priorityGroup, ...withBenefit, ...withPartner, ...withoutPartner];

  // 비프로덕션: 테스트 클럽(운영자/...)을 최상위로 끌어올림 (Hot Deal Now와 동일 패턴)
  if (SHOW_TEST_DATA) {
    const testClubs = ordered.filter((c) => HIDDEN_PATTERN.test(c.name));
    const others = ordered.filter((c) => !HIDDEN_PATTERN.test(c.name));
    ordered = [...testClubs, ...others];
  }
  const topClubs = ordered.slice(0, MAX_CARDS);

  return topClubs.map((c) => ({
    club_id: c.id,
    club_name: c.name,
    club_area: c.area,
    club_thumbnail: c.thumbnail_url,
    benefit_text: slotMap.get(c.id)?.text || null,
    benefit_tags: slotMap.get(c.id)?.tags ?? [],
    md_count: c.club_partners?.length ?? 0,
    fav_count: favCountMap[c.id] ?? 0,
  }));
}
