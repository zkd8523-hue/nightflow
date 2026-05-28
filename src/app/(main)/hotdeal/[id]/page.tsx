import { notFound } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { HotdealDetail } from "@/components/hotdeal/HotdealDetail";
import type { DailyHotdeal } from "@/types/database";

export const revalidate = 30;

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HotdealDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAnonClient();

  const { data, error } = await supabase
    .from("daily_hotdeals")
    .select(
      `*,
       club:clubs(id, name, area, thumbnail_url, floor_plan_url, address, instagram),
       md:users!daily_hotdeals_md_id_fkey(id, display_name, instagram, profile_image)`
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // 프로덕션에서는 운영자/테스트 클럽 핫딜 상세 접근 차단
  const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
  const clubName = (data as { club?: { name?: string } }).club?.name ?? "";
  if (!SHOW_TEST_CLUBS && /운영자/.test(clubName)) return notFound();

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <HotdealDetail hotdeal={data as unknown as DailyHotdeal & { club: { id: string; name: string; area: string | null; thumbnail_url: string | null; floor_plan_url: string | null; address: string | null; instagram: string | null } }} />
    </div>
  );
}
