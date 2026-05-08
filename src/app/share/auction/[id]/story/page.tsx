import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Auction } from "@/types/database";
import { StoryShareView } from "./StoryShareView";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StorySharePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = createAdminClient();
  const { data: auction, error } = await supabase
    .from("auctions")
    .select(`
      *,
      club:clubs (*),
      md:public_user_profiles!auctions_md_id_fkey (id, display_name, profile_image, md_deal_count)
    `)
    .eq("id", id)
    .single();

  if (error || !auction || auction.status === "draft") {
    notFound();
  }

  const clubRaw = (auction as { club?: unknown }).club;
  const club = Array.isArray(clubRaw) ? clubRaw[0] : clubRaw;
  const mdRaw = (auction as { md?: unknown }).md;
  const md = Array.isArray(mdRaw) ? mdRaw[0] : mdRaw;

  const normalizedAuction = { ...auction, club: club ?? null, md: md ?? null } as Auction;

  return <StoryShareView auction={normalizedAuction} />;
}
