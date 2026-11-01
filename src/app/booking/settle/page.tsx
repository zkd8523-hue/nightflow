// 정산 문자 속 "내역 보기" 링크(2026-11-01). /booking/* 는 앱 링크라 앱이 깔려 있으면 앱에서 열린다.
// 여기서는 로그인이 필요한 정산 화면으로 넘기기만 한다 — 미들웨어가 로그인 안 된 사람을 /login으로 보낸다.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettleLinkPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(month && /^\d{4}-\d{2}$/.test(month) ? `/md/settlements?month=${month}` : "/md/settlements");
}
