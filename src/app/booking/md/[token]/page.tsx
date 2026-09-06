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
    .select("ref_no, club_id, table_info, includes, total_price, confirmed_group_size, guest_request, request_id, md_checked_in_at, request_type")
    .eq("md_token", token)
    .maybeSingle();

  if (!conf) notFound();

  // 확정서가 외국인/한국 요청 중 무엇인지에 따라 원본 테이블이 다르다
  // (2026-09-06, Migration 654). korean_booking_requests는 lang 컬럼이 없다 —
  // 한국인 전용 트랙이라 항상 "ko"로 고정한다.
  const isKorean = conf.request_type === "korean";
  const { data: reqRow } = await sb
    .from(isKorean ? "korean_booking_requests" : "foreign_requests")
    .select(`guest_name, event_date, group_size, status, assigned_md_id, ${isKorean ? "club_id" : "club_ids"}${isKorean ? "" : ", lang"}`)
    .eq("id", conf.request_id)
    .single();

  if (!reqRow) notFound();
  const req = reqRow as unknown as {
    guest_name: string;
    event_date: string;
    group_size: number;
    status: string;
    assigned_md_id: string | null;
    lang?: string;
    club_ids?: string[] | null;
    club_id?: string | null;
  };
  const reqClubIds = isKorean ? [req.club_id].filter(Boolean) as string[] : (req.club_ids ?? []);
  const lang = isKorean ? "ko" : (req.lang ?? "ko");

  const clubId = conf.club_id ?? reqClubIds[0] ?? null;
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
      lang={lang}
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
