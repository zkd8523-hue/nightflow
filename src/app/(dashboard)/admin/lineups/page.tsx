import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AdminLineupsTabs } from "@/components/admin/AdminLineupsTabs";

export const dynamic = "force-dynamic";

export default async function AdminLineupsPage() {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
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

  const [{ data: clubs }, { data: drafts }, { data: reports }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, area, aliases")
      .is("deleted_at", null)
      .eq("status", "approved")
      .order("name"),
    supabase
      .from("lineup_drafts")
      .select(
        "id, club_id, origin, poster_url, normalized, confidence, confidence_detail, status, created_at, clubs(name, area)"
      )
      .eq("status", "pending")
      .order("confidence", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
    // 유저 제보 — pending만. 관리자가 파싱/직접입력/반려로 처리하면 여기서 빠진다.
    // (2026-08-27: 저장·푸시는 되는데 검토 화면이 없었던 걸 메꾸는 탭)
    supabase
      .from("lineup_reports")
      .select("id, created_at, image_urls, memo, reporter_id, users(display_name, name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  // Supabase JS는 1:1 조인도 배열 타입으로 추론한다 — 단일 객체로 정리
  //
  // normalized 가 비어 있는 draft 는 큐에서 뺀다(2026-08-30 실측): 수집 실행이
  // 파싱 후 정규화 전에 끊기면 pending 인 채로 남는데, 검토 화면은 normalized 를
  // 읽으므로 열어도 빈 폼만 뜬다("알맹이 없는 검토 대기"). 실제로 40건이 그렇게
  // 쌓여 있었다. 이런 행은 수집기의 6시간 회수 로직이 걷어가 재수집되므로,
  // 사람이 손댈 게 없는 동안 목록에서만 감춘다.
  const hasSets = (n: unknown) => {
    const rows = (n as { sets?: unknown[]; rows?: unknown[] } | null)?.sets
      ?? (n as { rows?: unknown[] } | null)?.rows;
    return Array.isArray(rows) && rows.length > 0;
  };
  const normalizedDrafts = (drafts ?? [])
    .filter((d) => hasSets(d.normalized))
    .map((d) => ({
      ...d,
      clubs: Array.isArray(d.clubs) ? d.clubs[0] ?? null : d.clubs,
    }));

  const normalizedReports = (reports ?? []).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] ?? null : r.users;
    return {
      id: r.id,
      created_at: r.created_at,
      image_urls: r.image_urls,
      memo: r.memo,
      reporter_id: r.reporter_id,
      reporter_name: u?.display_name ?? u?.name ?? null,
    };
  });

  return (
    <AdminLineupsTabs
      clubs={clubs ?? []}
      initialDrafts={normalizedDrafts}
      initialReports={normalizedReports}
    />
  );
}
