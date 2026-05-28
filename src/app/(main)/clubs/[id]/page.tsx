import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClubDetailContent } from "@/components/clubs/ClubDetailContent";
import { getClubAliases } from "@/lib/clubs/aliases";
import { normalizeDowSlots, summarizeSlots } from "@/lib/utils/hotdeal";
import type { HotdealBenefitsByDow, HotdealDow } from "@/types/database";
import type { Metadata } from "next";

export const revalidate = 10;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("name, area")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!club) {
    return { title: "클럽을 찾을 수 없습니다 | NightFlow" };
  }

  const area = club.area || "";
  const titleArea = area ? `${area} ` : "";
  const aliases = getClubAliases(id);
  const titleAlias = aliases[0] ? `(${aliases[0]})` : "";
  const descAliases = aliases.length > 0 ? ` (${aliases.join(", ")})` : "";

  return {
    title: `${club.name}${titleAlias} ${titleArea}클럽 테이블 가격·예약`,
    description: `${club.name}${descAliases} ${area ? `${area} ` : ""}클럽 테이블 정가보다 저렴하게 예약. 잔여 테이블 실시간 가격 비교, MD 직거래로 수수료 없음. 나이트플로우(나플)에서 입찰하세요.`,
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
      title: `${club.name}${titleAlias} ${titleArea}클럽 테이블 가격·예약 - 나이트플로우`,
      description: `${club.name}${descAliases} 잔여 테이블 실시간 경매. 정가보다 저렴하게.`,
      url: `https://nightflow.kr/clubs/${id}`,
      type: "website",
    },
  };
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!club) {
    notFound();
  }

  const { data: activeAuctions } = await supabase
    .from("auctions")
    .select(`
      *,
      club:clubs(*),
      md:public_user_profiles!auctions_md_id_fkey(id, display_name, profile_image)
    `)
    .eq("club_id", id)
    .in("status", ["active", "scheduled"])
    .order("auction_start_at", { ascending: true })
    .limit(20);

  // 이번 주 게스트 간판 슬롯 + 차지 MD 정보 + 오늘 요일 혜택
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dowIdx = kstNow.getUTCDay();
  const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const todayDowKey = DOW_KEYS[dowIdx];
  const daysFromMonday = dowIdx === 0 ? 6 : dowIdx - 1;
  const thisMonday = new Date(kstNow);
  thisMonday.setUTCDate(kstNow.getUTCDate() - daysFromMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);
  const thisWeekISO = thisMonday.toISOString().slice(0, 10);

  const { data: slotRow } = await supabase
    .from("weekly_hotdeal_slots")
    .select("id, md_id, benefits_by_dow, expires_at")
    .eq("club_id", id)
    .eq("week_start", thisWeekISO)
    .limit(1)
    .maybeSingle();

  let guestSignSlot: {
    md: { id: string; display_name: string | null; profile_image: string | null; instagram: string | null; kakao_open_chat_url: string | null };
    today_benefit: string | null;
  } | null = null;

  if (slotRow && new Date(slotRow.expires_at) > new Date()) {
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

  const aliases = getClubAliases(id);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NightClub",
    "@id": `https://nightflow.kr/clubs/${id}#nightclub`,
    name: club.name,
    ...(aliases.length > 0 ? { alternateName: aliases } : {}),
    url: `https://nightflow.kr/clubs/${id}`,
    ...(club.area
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: club.area,
            addressCountry: "KR",
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ClubDetailContent
        club={club}
        activeAuctions={activeAuctions || []}
        guestSignSlot={guestSignSlot}
      />
    </>
  );
}
