import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClubDetailContent } from "@/components/clubs/ClubDetailContent";
import { clubDisplayAlias, clubAllAliases } from "@/lib/clubs/seoAliases";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";
import { normalizeDowSlots, summarizeSlots, pickUpcomingBenefit, getActiveWeekStartISO, getBusinessDowKey } from "@/lib/utils/hotdeal";
import { getBusinessDateISO } from "@/lib/lineups/time";
import type { TodayLineup } from "@/components/clubs/ClubLineupSection";
import type { UpcomingLineup } from "@/components/clubs/UpcomingLineupSheet";
import type { ClubUpcomingEvent, ClubEventPerformer } from "@/components/clubs/ClubUpcomingEvents";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";
import type { Metadata } from "next";

export const revalidate = 10;
export const dynamic = "force-dynamic"; // notFound() 시 정상 404 응답 보장 (Soft 404 방지)

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // 승인 전(pending) 클럽은 프로덕션에서만 404. 로컬·프리뷰에서는 열어서 확인할 수 있게 한다
  // (테스트 클럽이 대부분 pending이라 개발 중 상세를 못 보는 문제).
  const metaQuery = supabase
    .from("clubs")
    .select("id, name, area, thumbnail_url, dresscode, aliases")
    .eq("id", id)
    .is("deleted_at", null);
  if (!SHOW_TEST_DATA) metaQuery.eq("status", "approved");
  const { data: club } = await metaQuery.single();

  if (!club) {
    notFound(); // HTTP 404 응답 (Soft 404 방지)
  }

  const area = club.area || "";
  // clubDisplayAlias: 정적 큐레이션(57곳) 우선 → DB clubs.aliases 첫 한글 표기
  // 폴백(나머지 49곳). 감사 결과 DB 한글 별칭이 SEO 메타로 흐르는 페이지가
  // 0곳이었다 — 이 호출이 그 배선을 처음 잇는다.
  const primary = clubDisplayAlias({ id, name: club.name, aliases: club.aliases });
  // 메인 별칭이 있으면 "강남 에이스(Club Ace)" 형태로 노출.
  // 없으면 등록명을 그대로 사용.
  const headName = primary
    ? `${area ? `${area} ` : ""}${primary}(${club.name})`
    : `${area ? `${area} ` : ""}${club.name}`;
  // keywords·JSON-LD alternateName·sr-only 본문에 실을 전체 별칭 — 정적 + DB
  // 합집합, 중복 제거(대소문자 무시). 예전엔 정적 57곳만 실려서 나머지 49곳은
  // "볼레로"로 검색해도 페이지 어디에도 그 단어가 없었다.
  const aliases = clubAllAliases({ id, name: club.name, aliases: club.aliases });
  const descAliases = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";

  return {
    // "테이블 가격"은 구글에서 CTR 32.5%로 검증된 승리 키워드라 유지하고,
    // 새 모델의 핵심인 "라인업"을 제목에 넣는다. 기존 제목엔 라인업이 제목·설명·
    // 키워드 어디에도 없어서, 클럽명으로 들어온 사람에게 라인업의 존재 자체가
    // 안 보였다.
    title: `${headName} 위치·영업시간·입장료·라인업`,
    description: `${headName}${descAliases} 위치·영업시간·입장료·드레스코드, DJ 라인업과 공연 일정, 테이블 가격·주대 확인. 무료입장·프리드링크 게스트 간판 혜택까지 나플에서 한 번에.`,
    keywords: [
      club.name,
      ...aliases,
      ...(area
        ? [
            `${area} 클럽`,
            `${area} 클럽 라인업`,
            `${area} 클럽 테이블`,
            `${area} 클럽 파티`,
          ]
        : []),
      // 헤드(클럽명 단독)는 인스타·플레이스에 밀린다. 이기는 자리는 수식어가
      // 붙은 롱테일 — 네이버·구글 양쪽에서 독립적으로 확인된 패턴이다.
      // 위치·영업시간은 데이터 커버리지 100%(전 클럽 보유)라 우선순위 최상 —
      // "OO 위치"가 같은 페이지에서 헤드보다 CTR 3.6배 높았다(실측).
      `${club.name} 위치`,
      `${club.name} 영업시간`,
      `${club.name} 라인업`,
      `${club.name} DJ`,
      `${club.name} 공연`,
      `${club.name} 테이블`,
      `${club.name} 입장료`,
      `${club.name} 예약`,
      // 드레스코드는 실제로 채워진 클럽에만. 현재 106곳 중 3곳뿐이라 전부에 걸면
      // 검색해서 들어온 사람이 답을 못 찾고 나간다.
      ...(club.dresscode ? [`${club.name} 드레스코드`] : []),
      ...aliases.map((a) => `${a} 라인업`),
      ...aliases.map((a) => `${a} 위치`),
      ...aliases.map((a) => `${a} 클럽`),
      ...aliases.map((a) => `${a} 테이블`),
      ...aliases.map((a) => `${a} 입장료`),
    ],
    alternates: { canonical: `https://nightflow.kr/clubs/${id}` },
    openGraph: {
      title: `${headName} 위치·영업시간·라인업·무료입장`,
      description: `${headName}${descAliases} 위치·영업시간·DJ 라인업과 공연 일정, 테이블 가격 확인, 무료입장·프리드링크 게스트 간판 혜택까지.`,
      url: `https://nightflow.kr/clubs/${id}`,
      type: "website",
      // 클럽 대표 사진이 있으면 그걸 카톡 공유 카드 이미지로 — 없으면 나플 공통
      // 이미지로 폴백(썸네일 없는 클럽도 빈 카드가 뜨진 않게).
      images: club.thumbnail_url
        ? [{ url: club.thumbnail_url }]
        : [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
  };
}

export default async function ClubDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  // 핫딜 상세에서 진입한 경우: 조각/깃발 진입 동선을 숨겨 핫딜 전환 이탈 방지
  const fromHotdeal = from === "hotdeal";
  const supabase = await createClient();

  // 이번 주 게스트 간판 슬롯 조회에 쓰일 영업일/주차 계산 (순수 함수 — 쿼리 전 미리 계산)
  // 요일은 영업일 기준(새벽 6시 경계) — 일요일 혜택이 월요일 새벽까지 노출되도록.
  const todayDowKey = getBusinessDowKey();
  // 월요일 18시 오픈 갭 보정 포함 (지난 주 슬롯 노출)
  const thisWeekISO = getActiveWeekStartISO();

  // Migration 505: 파트너 직통 조각(host_is_md) — 오늘 이후, 진행 중인 것만.
  // "KST 오늘"은 순수 계산이라 쿼리 전에 미리 구해둔다.
  const todayKstISO = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 서로 독립적인 4개 쿼리를 병렬 실행 — 직렬(4 RTT) → 1 RTT. (mdRow만 slotRow 의존이라 이후 순차)
  const todayBusinessDateISO = getBusinessDateISO();

  const [
    { data: club },
    { data: activeAuctions },
    { data: slotRow },
    { data: sharePuzzles },
    { data: lineupRow },
    { data: upcomingLineupRows },
    { data: upcomingEventRows },
  ] = await Promise.all([
    (() => {
      const q = supabase.from("clubs").select("*").eq("id", id).is("deleted_at", null);
      if (!SHOW_TEST_DATA) q.eq("status", "approved");
      return q.single();
    })(),
    supabase
      .from("auctions")
      .select(`
        *,
        club:clubs(*),
        md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image)
      `)
      .eq("club_id", id)
      .in("status", ["active", "scheduled"])
      .order("auction_start_at", { ascending: true })
      .limit(20),
    supabase
      .from("weekly_hotdeal_slots")
      .select("id, md_id, benefits_by_dow, expires_at")
      .eq("club_id", id)
      .eq("week_start", thisWeekISO)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("puzzles")
      .select("*, leader:public_user_profiles!puzzles_leader_id_fkey(id, display_name, profile_image, deal_count_total, deal_amount_total, created_at, gender, country_code)")
      .eq("club_id", id)
      .eq("host_is_md", true)
      .eq("is_recruiting_party", true)
      .in("status", ["open", "selecting"])
      .gte("event_date", todayKstISO)
      .order("event_date", { ascending: true })
      .limit(50),
    // 오늘 영업일 라인업. 클라이언트 fetch가 아니라 서버 조회인 이유: SEO 크롤러가 봐야 한다.
    supabase
      .from("club_lineups")
      .select(
        "door_open_min, event_title, lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram, soundcloud_url))"
      )
      .eq("club_id", id)
      .eq("event_date", todayBusinessDateISO)
      .maybeSingle(),
    // 오늘부터 앞으로 예정된 라인업 전부 — "어떤 DJ들이 올까?" 목록 시트용.
    // 오늘 것만 보여주면 게시일과 실제 방문일 사이에 확인할 방법이 없다.
    supabase
      .from("club_lineups")
      .select("event_date, door_open_min, event_title, lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram, soundcloud_url))")
      .eq("club_id", id)
      .gte("event_date", todayBusinessDateISO)
      .order("event_date", { ascending: true })
      .limit(20),
    // 예정된 공연(라이브). DJ 라인업은 상세에 티커로 보이는데 공연은 어디에도
    // 안 보여서, 공연이 잡힌 클럽도 상세만 보면 일정이 없는 것처럼 읽혔다.
    // club_events는 approved만 공개 SELECT(Migration 564).
    supabase
      .from("club_events")
      .select(
        "id, event_date, title, source_url, lineup, club_event_performers(raw_name, sort_order, artists(id, display_name, instagram))"
      )
      .eq("club_id", id)
      .eq("status", "approved")
      .gte("event_date", todayKstISO)
      .order("event_date", { ascending: true })
      .limit(10),
  ]);

  if (!club) {
    notFound();
  }

  // 오늘 라인업 정규화. 셋이 없으면(라인업 자체가 없거나 빈 경우) null로 통일 —
  // ClubLineupSection이 자기소거하도록.
  const todayLineup: TodayLineup | null = (() => {
    if (!lineupRow) return null;
    const rawSets = (lineupRow.lineup_sets ?? []) as Array<{
      start_min: number | null;
      end_min: number | null;
      sort_order: number;
      djs: { id: string; slug: string; display_name: string; instagram: string | null; soundcloud_url: string | null } | { id: string; slug: string; display_name: string; instagram: string | null; soundcloud_url: string | null }[] | null;
    }>;
    if (rawSets.length === 0) return null;
    const sets = rawSets
      .map((s) => ({
        start_min: s.start_min,
        end_min: s.end_min,
        sort_order: s.sort_order,
        dj: Array.isArray(s.djs) ? s.djs[0] ?? null : s.djs,
      }))
      // 시간이 없는 캡션 라인업은 적힌 순서를 쓴다 (Migration 573)
      .sort((a, b) =>
        a.start_min !== null && b.start_min !== null
          ? a.start_min - b.start_min
          : a.sort_order - b.sort_order
      );
    return { door_open_min: lineupRow.door_open_min, event_title: lineupRow.event_title, sets };
  })();

  // "어떤 DJ들이 올까?" 시트용 — 오늘부터 앞으로 예정된 전체 라인업.
  const upcomingLineups: UpcomingLineup[] = (upcomingLineupRows ?? [])
    .map((row) => {
      const rawSets = (row.lineup_sets ?? []) as Array<{
        start_min: number | null;
        end_min: number | null;
        sort_order: number;
        djs: { id: string; slug: string; display_name: string; instagram: string | null; soundcloud_url: string | null } | { id: string; slug: string; display_name: string; instagram: string | null; soundcloud_url: string | null }[] | null;
      }>;
      const sets = rawSets
        .map((s) => ({
          start_min: s.start_min,
          end_min: s.end_min,
          sort_order: s.sort_order,
          dj: Array.isArray(s.djs) ? s.djs[0] ?? null : s.djs,
        }))
        // 시간이 없는 캡션 라인업은 적힌 순서를 쓴다 (Migration 573)
      .sort((a, b) =>
        a.start_min !== null && b.start_min !== null
          ? a.start_min - b.start_min
          : a.sort_order - b.sort_order
      );
      return { event_date: row.event_date, door_open_min: row.door_open_min, event_title: row.event_title, sets };
    })
    .filter((l) => l.sets.length > 0);

  // 예정된 공연 정규화. 출연자는 artists 조인 우선이고, 조인이 안 붙은 원문 이름은
  // extra_names 로 따로 낸다(공연 목록 화면과 같은 규칙) — 이름은 있는데 마스터에
  // 없다고 화면에서 지워버리면 "출연자 미정"처럼 보인다.
  const upcomingEvents: ClubUpcomingEvent[] = (upcomingEventRows ?? []).map((row) => {
    const perfRows = (row.club_event_performers ?? []) as Array<{
      raw_name: string | null;
      sort_order: number | null;
      artists: { id: string; display_name: string; instagram: string | null } | { id: string; display_name: string; instagram: string | null }[] | null;
    }>;
    const sorted = [...perfRows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const performers: ClubEventPerformer[] = [];
    const matchedRaw = new Set<string>();
    for (const pr of sorted) {
      const a = Array.isArray(pr.artists) ? pr.artists[0] ?? null : pr.artists;
      if (!a) continue;
      performers.push({ id: a.id, display_name: a.display_name, instagram: a.instagram });
      if (pr.raw_name) matchedRaw.add(pr.raw_name);
    }
    // lineup(원문 이름 배열)에는 있는데 조인으로 안 붙은 것만 남긴다
    const extra_names = ((row.lineup ?? []) as string[]).filter(
      (n) => n && !matchedRaw.has(n) && !performers.some((p) => p.display_name === n)
    );
    return {
      id: row.id,
      event_date: row.event_date,
      title: row.title,
      source_url: row.source_url,
      performers,
      extra_names,
    };
  });

  let guestSignSlot: {
    slot_id?: string;
    today_dow?: typeof todayDowKey;
    today_slots?: ReturnType<typeof normalizeDowSlots>;
    md: { id: string; display_name: string | null; profile_image: string | null; instagram: string | null; kakao_open_chat_url: string | null };
    today_benefit: string | null;
    today_tags: string[];
  } | null = null;

  // 노출 판정은 week_start(getActiveWeekStartISO, 월 18시 게이트 포함) 단일 기준.
  // expires_at(=다음 월 18:00, Migration 283)과 등가이므로 중복 필터는 두지 않는다.
  if (slotRow) {
    const { data: mdRow } = await supabase
      .from("public_user_profiles")
      .select("id, display_name, profile_image, instagram, kakao_open_chat_url")
      .eq("id", slotRow.md_id)
      .maybeSingle();
    if (mdRow) {
      const byDow = (slotRow.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
      const todaySlots = normalizeDowSlots(byDow[todayDowKey as HotdealDow]);
      // 표시용: 오늘 혜택 없으면 이번 주 가장 가까운 요일 혜택 (미래는 "(금)" 라벨).
      // 편집 대상(today_dow/today_slots)은 오늘 그대로 유지 — admin "오늘 혜택" 수정은 오늘 기준.
      const upcomingBenefit = pickUpcomingBenefit(byDow);
      guestSignSlot = {
        slot_id: slotRow.id,
        today_dow: todayDowKey,
        today_slots: todaySlots,
        md: {
          id: mdRow.id,
          display_name: mdRow.display_name,
          profile_image: mdRow.profile_image,
          instagram: mdRow.instagram,
          kakao_open_chat_url: mdRow.kakao_open_chat_url,
        },
        today_benefit: upcomingBenefit?.labeledText || null,
        today_tags: upcomingBenefit?.tags ?? [],
      };
    }
  }

  // SEO용: 이번 주 게스트 간판 전 요일 혜택 텍스트 생성 (sr-only 본문)
  // 지역+클럽명 prefix로 "강남 ACE" 같은 조합 검색 매칭 강화.
  const DOW_LABELS_KO: Record<HotdealDow, string> = {
    mon: "월요일",
    tue: "화요일",
    wed: "수요일",
    thu: "목요일",
    fri: "금요일",
    sat: "토요일",
    sun: "일요일",
  };
  const ssrAreaPrefix = club.area ? `${club.area} ` : "";
  const ssrWeeklyBenefits: { dow: string; text: string }[] = [];
  if (slotRow) {
    const byDow = (slotRow.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
    (Object.keys(DOW_LABELS_KO) as HotdealDow[]).forEach((d) => {
      const slots = normalizeDowSlots(byDow[d]);
      const summary = summarizeSlots(slots);
      if (summary) {
        ssrWeeklyBenefits.push({ dow: DOW_LABELS_KO[d], text: summary });
      }
    });
  }

  // JSON-LD alternateName용 전체 별칭 — 정적 + DB 합집합. 예전엔 getClubAliases만
  // 써서 정적 미등록 49곳은 alternateName이 아예 안 실렸다.
  const aliases = clubAllAliases({ id, name: club.name, aliases: club.aliases });
  // operating_hours 자유 텍스트(예: "금/토 22:00-05:00")를 OpeningHoursSpecification으로
  // 시도. 정규식 매칭 실패하면 description으로 폴백.
  const DOW_TO_SCHEMA: Record<string, string> = {
    "월": "Monday",
    "화": "Tuesday",
    "수": "Wednesday",
    "목": "Thursday",
    "금": "Friday",
    "토": "Saturday",
    "일": "Sunday",
  };
  function parseOperatingHours(raw: string | null | undefined) {
    if (!raw) return null;
    // 예: "금/토 22:00-05:00", "금,토 22:00-05:00"
    const match = raw.match(
      /([월화수목금토일]([\s\/,·]+[월화수목금토일])*)\s*(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/
    );
    if (!match) return null;
    const dowPart = match[1].replace(/[\s\/,·]+/g, "");
    const days = Array.from(dowPart).filter((c) => DOW_TO_SCHEMA[c]);
    if (days.length === 0) return null;
    const opens = `${match[3].padStart(2, "0")}:${match[4]}`;
    const closes = `${match[5].padStart(2, "0")}:${match[6]}`;
    return {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days.map((d) => DOW_TO_SCHEMA[d]),
      opens,
      closes,
    };
  }
  const openingHoursSpec = parseOperatingHours(club.operating_hours);

  const sameAsList: string[] = [];
  if (club.instagram) {
    const ig = String(club.instagram).replace(/^@/, "").trim();
    if (ig) sameAsList.push(`https://www.instagram.com/${ig}`);
  }

  // 전화번호 정규화 (숫자/하이픈만, 빈 값 제거)
  const phoneRaw = (club.phone as string | null | undefined) ?? null;
  const phoneClean = phoneRaw
    ? String(phoneRaw).replace(/[^\d\-+()]/g, "").trim() || null
    : null;

  const nightClubLd = {
    "@type": "NightClub",
    "@id": `https://nightflow.kr/clubs/${id}#nightclub`,
    name: club.name,
    ...(aliases.length > 0 ? { alternateName: aliases } : {}),
    url: `https://nightflow.kr/clubs/${id}`,
    ...(club.thumbnail_url ? { image: club.thumbnail_url } : {}),
    ...(club.area || club.address
      ? {
          address: {
            "@type": "PostalAddress",
            ...(club.address ? { streetAddress: club.address } : {}),
            ...(club.area ? { addressLocality: club.area } : {}),
            addressCountry: "KR",
          },
        }
      : {}),
    ...(openingHoursSpec
      ? { openingHoursSpecification: openingHoursSpec }
      : club.operating_hours
        ? { disambiguatingDescription: String(club.operating_hours) }
        : {}),
    ...(phoneClean ? { telephone: phoneClean } : {}),
    // 좌표 — 구글 지도/로컬 결과 연동
    ...(club.latitude != null && club.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: club.latitude,
            longitude: club.longitude,
          },
        }
      : {}),
    // 구글 별점 — 검색결과 ★ 리치 스니펫(CTR 상승 핵심). 리뷰 수 있을 때만.
    ...(typeof club.google_rating === "number" &&
    club.google_rating > 0 &&
    typeof club.google_review_count === "number" &&
    club.google_review_count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: club.google_rating,
            reviewCount: club.google_review_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(sameAsList.length > 0 ? { sameAs: sameAsList } : {}),
  };

  // BreadcrumbList — 검색 결과에 "홈 > 클럽 > {지역} {클럽명}" 경로 노출
  const breadcrumbLd = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: "https://nightflow.kr/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "전국 클럽 가이드",
        item: "https://nightflow.kr/clubs",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: club.area ? `${club.area} ${club.name}` : club.name,
        item: `https://nightflow.kr/clubs/${id}`,
      },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [nightClubLd, breadcrumbLd],
  };

  // 별칭을 본문에 자연 문장으로 노출 ("에이스", "강남 에이스", "버뮤다" 등)
  //
  // ⚠️ 중복 제거 필수: clubs.aliases에 이제 "이태원 볼레로"처럼 지역 조합이
  // DB에 직접 들어있는 클럽이 많다(2026-08-30 정비). 이 함수가 "볼레로"에서
  // "이태원 볼레로"를 다시 만들어내면 이미 DB에 있는 것과 겹쳐 문장에
  // "강남 에이스"가 두 번 나오는 식의 중복이 생긴다(실제로 발생했던 회귀).
  const ssrAliasSentence = (() => {
    if (aliases.length === 0) return null;
    const aliasesWithArea = club.area
      ? aliases.flatMap((a) =>
          a.startsWith(club.area as string) ? [a] : [a, `${club.area} ${a}`]
        )
      : aliases;
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const a of aliasesWithArea) {
      const key = a.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(a);
      }
    }
    return deduped.join(", ");
  })();

  // 메인 검색 이름 ("에이스" 등). 없으면 등록명으로 폴백. generateMetadata와
  // 같은 규칙(정적 우선 → DB 첫 한글 폴백)이라야 title과 sr-only H1이 어긋나지 않는다.
  const ssrPrimary = clubDisplayAlias({ id, name: club.name, aliases: club.aliases });
  // 본문/H1 head 라벨: "강남 에이스(Club Ace)" 형태
  const ssrHead = ssrPrimary
    ? `${ssrAreaPrefix}${ssrPrimary}(${club.name})`
    : `${ssrAreaPrefix}${club.name}`;

  // 세부 동네명 자동 추출 (주소에서 압구정/신사동/역삼/선릉/청담/홍대입구 등)
  // 사용자가 "강남 클럽"보다 더 구체적으로 검색하는 패턴에 매칭.
  const NEIGHBORHOOD_PATTERNS: { kw: string; match: RegExp }[] = [
    { kw: "압구정", match: /압구정/ },
    { kw: "신사동", match: /신사/ },
    { kw: "청담", match: /청담/ },
    { kw: "역삼", match: /역삼/ },
    { kw: "선릉", match: /선릉/ },
    { kw: "강남역", match: /강남역|강남대로/ },
    { kw: "논현", match: /논현/ },
    { kw: "삼성동", match: /삼성동/ },
    { kw: "홍대입구", match: /홍대입구|동교동|서교동/ },
    { kw: "합정", match: /합정/ },
    { kw: "이태원", match: /이태원/ },
    { kw: "한남동", match: /한남/ },
    { kw: "서면", match: /서면/ },
    { kw: "광안리", match: /광안/ },
    { kw: "해운대", match: /해운대/ },
  ];
  const ssrNeighborhoods: string[] = [];
  if (club.address) {
    const addr = String(club.address);
    for (const { kw, match } of NEIGHBORHOOD_PATTERNS) {
      if (match.test(addr)) ssrNeighborhoods.push(kw);
    }
  }
  const neighborhoodSentence =
    ssrNeighborhoods.length > 0
      ? ssrNeighborhoods
          .map((n) => `${n} 클럽`)
          .join(", ")
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sr-only">
        <h1>
          {ssrHead} - 클럽 테이블 가격·예약·핫딜·게스트·무료입장 (나플)
        </h1>
        {ssrAliasSentence && (
          <p>
            {ssrHead}은(는) {ssrAliasSentence} 등으로도 불리는
            {club.area ? ` ${club.area} ` : " "}인기 클럽입니다.
            나플에서 {ssrHead} 테이블 가격을 확인하고
            예약하세요.
          </p>
        )}
        {neighborhoodSentence && (
          <p>
            {ssrHead}은(는) {neighborhoodSentence} 검색 결과로 자주 찾는
            {ssrAreaPrefix}인기 클럽입니다. 정확한 주소·영업시간·드레스코드
            정보는 나플에서 확인하세요.
          </p>
        )}
        {/* 사용자 롱테일 검색 키워드 보강 — 위치/주소/흡연·금연·담배 */}
        <p>
          {ssrHead} 위치·주소·영업시간·흡연/금연 구역·담배 가능 여부·테이블
          위치(테이블석)·드레스코드·연령대 등 가기 전에 확인해야 할 정보를
          나플에서 한곳에 모아 확인하세요.
        </p>
        {/* 결정 단계 롱테일 키워드 — 얼마/비용/입장료/요일/오픈마감/혼자/근처 */}
        <p>
          {ssrHead} 가격이 얼마인지(테이블 비용·입장료), 토요일·금요일 등
          주말과 평일의 오픈/마감 시간, 혼자(혼클) 가도 괜찮은지, {ssrAreaPrefix}
          근처 다른 클럽과의 비교까지 나플에서 한 번에 확인할 수 있습니다.
        </p>
        {/* 클럽 종류·문화 키워드 일괄 노출 — VIP/부킹/라운지/스탠딩/테이블석 등 */}
        <p>
          {ssrHead}의 테이블 가격, 테이블석·VIP 테이블·룸·라운지·스탠딩(입석)
          정보, 부킹·이벤트·DJ·음악·프로모션, 드레스코드, 분위기, 후기,
          여성무료·커플·단체 입장 안내를 나플에서 한곳에 모아
          비교할 수 있습니다.
        </p>
        {/* 게스트 간판 미등록 클럽에도 키워드 보장 — 등록되면 아래 ssrWeeklyBenefits 섹션에서 더 풍부히 노출. */}
        <p>
          {ssrAreaPrefix}{club.name} 게스트·무료입장 정보는 매주 갱신됩니다.
          {ssrHead} 게스트 명단, 무료입장 가능 여부, 게스트 간판 혜택은
          나플에서 확인하세요. {ssrAreaPrefix}클럽 게스트 입장,
          {ssrAreaPrefix}무료입장 안내는 매주 월요일 오후 6시에 새 데이터로
          갱신됩니다.
        </p>
      </div>
      {ssrWeeklyBenefits.length > 0 && (
        <div className="sr-only">
          <h2>
            이번 주 {ssrHead} 게스트 간판·무료입장 정보
          </h2>
          <p>
            {ssrHead} 이번 주 요일별 게스트 간판·무료입장 혜택을 안내합니다.
            {ssrAreaPrefix}클럽 게스트 명단 등록, 무료입장, 게스트 입장
            정보를 나플에서 확인하고 클럽 테이블 가격·핫딜도
            함께 비교하세요.
          </p>
          <ul>
            {ssrWeeklyBenefits.map((b, i) => (
              <li key={i}>
                {ssrHead} {b.dow} 게스트 간판·무료입장 - {b.text}
              </li>
            ))}
          </ul>
          <p>
            {ssrAreaPrefix}클럽 게스트 입장은 클럽 파트너가 운영하는 게스트
            명단에 등록되어 무료입장 또는 할인 입장이 가능한 방식입니다.
            {ssrHead}에서 가능한 무료입장·게스트 혜택을 매주 갱신합니다.
          </p>
        </div>
      )}
      <ClubDetailContent
        club={club}
        activeAuctions={activeAuctions || []}
        guestSignSlot={guestSignSlot}
        hideShareList={fromHotdeal}
        sharePuzzles={sharePuzzles || []}
        todayLineup={todayLineup}
        upcomingLineups={upcomingLineups}
        upcomingEvents={upcomingEvents}
      />
    </>
  );
}
