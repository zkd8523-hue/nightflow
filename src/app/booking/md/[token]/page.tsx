// MD용 예약 확정서. 손님용(public_token)과 토큰을 분리해 서로의 화면을 못 보게 한다.
// 손님 연락처는 넘기지 않는다 — 클럽이 손님에게 직접 연락할 일이 없고, 새면
// 플랫폼 우회 경로가 된다. 문제가 생기면 운영자를 거친다.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingPassMd } from "@/components/booking/BookingPassMd";

export const dynamic = "force-dynamic";

export default async function BookingMdPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = createAdminClient();

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("ref_no, club_id, table_info, includes, total_price, confirmed_group_size, guest_request, request_id, md_checked_in_at")
    .eq("md_token", token)
    .maybeSingle();

  if (!conf) notFound();

  const { data: req } = await sb
    .from("foreign_requests")
    .select("guest_name, event_date, group_size, status, lang, assigned_md_id, club_ids")
    .eq("id", conf.request_id)
    .single();

  if (!req) notFound();

  const clubId = conf.club_id ?? (req.club_ids as string[] | null)?.[0] ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };

  const { data: md } = req.assigned_md_id
    ? await sb.from("users").select("display_name").eq("id", req.assigned_md_id).maybeSingle()
    : { data: null };

  // 이미 도착 신호가 왔는지 (새로고침해도 상태가 유지되어야 한다)
  const { data: pings } = await sb
    .from("arrival_pings")
    .select("kind")
    .eq("request_id", conf.request_id);

  return (
    <BookingPassMd
      mdToken={token}
      requestId={conf.request_id}
      refNo={conf.ref_no}
      checkedInAt={conf.md_checked_in_at}
      guestName={req.guest_name}
      eventDate={req.event_date}
      groupSize={conf.confirmed_group_size ?? req.group_size}
      cancelled={req.status === "cancelled"}
      lang={req.lang}
      clubName={club?.name ?? null}
      tableInfo={conf.table_info}
      includes={conf.includes ?? []}
      totalPrice={conf.total_price}
      guestRequest={conf.guest_request}
      hostName={md?.display_name ?? null}
      arrivedPings={(pings ?? []).map((p) => p.kind)}
    />
  );
}
