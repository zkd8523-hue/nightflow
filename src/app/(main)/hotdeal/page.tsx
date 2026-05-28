import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { HotdealList } from "@/components/hotdeal/HotdealList";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Hot Deal Now - NightFlow",
  description:
    "지금 진행 중인 클럽 핫딜·특가. 종료 시간이 다가오는 한정 혜택을 한눈에.",
  alternates: { canonical: "https://nightflow.kr/hotdeal" },
};

function createAnonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// 프로덕션에서는 운영자/테스트 클럽 핫딜을 숨김 (HotdealHomeSection과 동일 정책)
const HIDDEN_CLUB_PATTERN = /운영자/;
const SHOW_TEST_CLUBS = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

type HotdealRow = Parameters<typeof HotdealList>[0]["hotdeals"][number];

export default async function HotdealIndexPage() {
  const supabase = createAnonClient();

  const { data: hotdeals } = await supabase
    .from("daily_hotdeals")
    .select(
      `*,
       club:clubs(id, name, area, thumbnail_url),
       md:users!daily_hotdeals_md_id_fkey(id, display_name, instagram, profile_image)`
    )
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true });

  const rows = (hotdeals ?? []) as unknown as HotdealRow[];
  const visible = SHOW_TEST_CLUBS
    ? rows
    : rows.filter((h) => !(h.club?.name && HIDDEN_CLUB_PATTERN.test(h.club.name)));

  return (
    <div className="container mx-auto max-w-3xl px-4 pt-4 pb-8 mb-20">
      <Suspense fallback={null}>
        <HotdealList hotdeals={visible} />
      </Suspense>
    </div>
  );
}
