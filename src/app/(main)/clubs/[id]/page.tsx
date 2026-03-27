import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ClubDetailContent } from "@/components/clubs/ClubDetailContent";
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
    .single();

  if (!club) {
    return { title: "클럽을 찾을 수 없습니다 | NightFlow" };
  }

  return {
    title: `${club.name} | NightFlow`,
    description: `${club.name} (${club.area}) - 현재 진행 중인 경매를 확인하세요`,
  };
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", id)
    .single();

  if (!club) {
    notFound();
  }

  const { data: activeAuctions } = await supabase
    .from("auctions")
    .select(`
      *,
      club:clubs(*),
      md:users!auctions_md_id_fkey(id, name, profile_image)
    `)
    .eq("club_id", id)
    .in("status", ["active", "scheduled"])
    .order("auction_start_at", { ascending: true })
    .limit(20);

  return (
    <ClubDetailContent
      club={club}
      activeAuctions={activeAuctions || []}
    />
  );
}
