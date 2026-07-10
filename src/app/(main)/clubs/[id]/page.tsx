import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClubDetailContent } from "@/components/clubs/ClubDetailContent";
import { getClubAliases, getPrimaryAlias } from "@/lib/clubs/aliases";
import { normalizeDowSlots, summarizeSlots, getActiveWeekStartISO, getBusinessDowKey } from "@/lib/utils/hotdeal";
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

  const { data: club } = await supabase
    .from("clubs")
    .select("name, area")
    .eq("id", id)
    .is("deleted_at", null)
    .eq("status", "approved")
    .single();

  if (!club) {
    notFound(); // HTTP 404 응답 (Soft 404 방지)
  }

  const area = club.area || "";
  const aliases = getClubAliases(id);
  const primary = getPrimaryAlias(id);
  // 메인 별칭이 있으면 "강남 에이스(Club Ace)" 형태로 노출.
  // 없으면 등록명을 그대로 사용.
  const headName = primary
    ? `${area ? `${area} ` : ""}${primary}(${club.name})`
    : `${area ? `${area} ` : ""}${club.name}`;
  const descAliases = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";

  return {
    title: `${headName} - 클럽 테이블 가격·예약`,
    description: `${headName}${descAliases} 테이블을 정가보다 저렴하게 예약. 잔여 테이블 실시간 가격 비교, 파트너 직거래로 수수료 없음. 나플에서 입찰하세요.`,
    keywords: [
      club.name,
      ...aliases,
      ...(area
        ? [
            `${area} 클럽`,
            `${area} 클럽 테이블`,
            `${area} 클럽 조각`,
            `${area} 클럽 합석`,
          ]
        : []),
      `${club.name} 테이블`,
      `${club.name} 예약`,
      `${club.name} 조각`,
      `${club.name} 합석`,
      ...aliases.map((a) => `${a} 클럽`),
      ...aliases.map((a) => `${a} 테이블`),
      ...aliases.map((a) => `${a} 조각`),
      ...aliases.map((a) => `${a} 합석`),
    ],
    alternates: { canonical: `https://nightflow.kr/clubs/${id}` },
    openGraph: {
      title: `${headName} - 클럽 테이블 가격·예약`,
      description: `${headName}${descAliases} 잔여 테이블 실시간 경매. 정가보다 저렴하게.`,
      url: `https://nightflow.kr/clubs/${id}`,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
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

  // 서로 독립적인 3개 쿼리를 병렬 실행 — 직렬(3 RTT) → 1 RTT. (mdRow만 slotRow 의존이라 이후 순차)
  const [
    { data: club },
    { data: activeAuctions },
    { data: slotRow },
  ] = await Promise.all([
    supabase
      .from("clubs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .eq("status", "approved")
      .single(),
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
  ]);

  if (!club) {
    notFound();
  }

  let guestSignSlot: {
    slot_id?: string;
    today_dow?: typeof todayDowKey;
    today_slots?: ReturnType<typeof normalizeDowSlots>;
    md: { id: string; display_name: string | null; profile_image: string | null; instagram: string | null; kakao_open_chat_url: string | null };
    today_benefit: string | null;
  } | null = null;

  // 노출 판정은 week_start(getActiveWeekStartISO, 월 18시 게이트 포함) 단일 기준.
  // expires_at(=다음 월 18:00, Migration 283)과 등가이므로 중복 필터는 두지 않는다.
  if (slotRow) {
    const { data: mdRow } = await supabase
      .from("users")
      .select("id, display_name, profile_image, instagram, kakao_open_chat_url")
      .eq("id", slotRow.md_id)
      .maybeSingle();
    if (mdRow) {
      const byDow = (slotRow.benefits_by_dow ?? {}) as HotdealBenefitsByDow;
      const todaySlots = normalizeDowSlots(byDow[todayDowKey as HotdealDow]);
      const todayText = summarizeSlots(todaySlots) || null;
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
        today_benefit: todayText,
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

  const aliases = getClubAliases(id);
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
  const ssrAliasSentence = (() => {
    if (aliases.length === 0) return null;
    const aliasesWithArea = club.area
      ? aliases.flatMap((a) =>
          a.startsWith(club.area as string) ? [a] : [a, `${club.area} ${a}`]
        )
      : aliases;
    return aliasesWithArea.join(", ");
  })();

  // 메인 검색 이름 ("에이스" 등). 없으면 등록명으로 폴백.
  const ssrPrimary = getPrimaryAlias(id);
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
      />
    </>
  );
}
