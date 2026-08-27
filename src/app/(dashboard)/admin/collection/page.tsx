import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AdminCollectionHealth } from "@/components/admin/AdminCollectionHealth";

export const dynamic = "force-dynamic";

/**
 * 인스타 수집 현황.
 *
 * 왜 필요한가(2026-08-27): collect-club-events 는 카운터를 17종 세면서 로그로만
 * 뱉고 버리고 있었다. 그래서 아래 네 가지가 조용히 실패하는 동안 아무도 몰랐고,
 * 전부 사람이 앱 화면을 눈으로 보다가 발견했다.
 *   - max_tokens 3000 에서 응답이 잘려 월간 스케줄이 통째로 빈 결과가 됨
 *   - 날짜 규칙이 과해서 출연자를 다 뽑고도 event_date=null 로 폐기
 *   - Restricted 계정 대신 온 "남의 계정 글"을 else 없이 스킵
 *   - groovenspot 등은 인스타가 막아 데이터 자체가 안 옴
 * 처음 셋은 숫자만 봤어도 당일 잡혔다. 이 화면은 그 숫자를 보이게 하는 것이다.
 */
export default async function AdminCollectionPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const [{ data: runs }, { data: accounts }] = await Promise.all([
    supabase
      .from("collection_runs")
      .select("*")
      .eq("source", "club-events")
      .order("started_at", { ascending: false })
      .limit(14),
    supabase.from("admin_collection_accounts").select("*"),
  ]);

  return <AdminCollectionHealth runs={runs ?? []} accounts={accounts ?? []} />;
}
