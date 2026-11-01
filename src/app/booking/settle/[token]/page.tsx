// 정산 문자 속 "내역 보기" 링크(2026-11-01). 로그인 없이 그 MD의 정산만 읽기 전용으로 보여준다.
// 토큰은 md_id + 서버 서명(settleLink.ts) — 다른 MD의 정산은 서명이 안 맞아 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMdSettlement } from "@/lib/booking/settlements";
import { verifySettleToken } from "@/lib/booking/settleLink";
import { MdSettlementView, defaultSettlementMonth } from "@/components/md/MdSettlementView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "정산 내역", robots: { index: false, follow: false } };

export default async function SettleLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { token } = await params;
  const mdId = verifySettleToken(decodeURIComponent(token));
  if (!mdId) notFound();

  const sb = createAdminClient();
  const { data: md } = await sb.from("users").select("display_name, name").eq("id", mdId).maybeSingle();
  if (!md) notFound();

  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const months = await loadMdSettlement(sb, mdId, todayKst);
  const { month } = await searchParams;
  const selected = month && months.some((m) => m.month === month) ? month : defaultSettlementMonth(months);

  return (
    <MdSettlementView
      months={months}
      selected={selected}
      basePath={`/booking/settle/${token}`}
      todayKst={todayKst}
      mdName={md.display_name || md.name}
    />
  );
}
