// MD용 제안서 — 확정서를 저장하기 전에 "이 조건 되냐"고 묻기 위한 페이지.
//
// 확정서(booking_confirmations)는 자리·확정가가 합의된 뒤에 만든다. 그 전에
// 운영자가 MD에게 보낼 게 없어서 카톡으로 일일이 타이핑하고 있었다. 이 페이지는
// 손님이 낸 요청을 확정서와 같은 레이아웃으로 보여준다.
//
// 외국인 요청(foreign_requests)과 한국 예약 요청(korean_booking_requests)이
// 이 페이지를 공유한다 — proposal_token은 두 테이블 다 UNIQUE라 어느 테이블에서
// 찾았는지로 판별한다(2026-09-06, Migration 654). /api/proposal-response와
// 같은 분기 방식.
//
// 손님 연락처는 넘기지 않는다 — MD가 손님에게 직접 연락할 일이 없고, 새면
// 플랫폼 우회 경로가 된다. 확정서(BookingPassMd)와 같은 원칙.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingProposal } from "@/components/booking/BookingProposal";

export const dynamic = "force-dynamic";

export default async function BookingProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = createAdminClient();

  let req = (
    await sb
      .from("foreign_requests")
      .select("id, proposal_token, guest_name, event_date, group_size, status, lang, club_ids, selected_menu, selected_menu_total, budget, notes, assigned_md_id, md_response, md_table_choosable, md_table_options, md_reject_reason, md_required_amount")
      // URL 세그먼트는 proposal_token(무작위 16바이트). 예약 id는 노출하지 않는다.
      .eq("proposal_token", token)
      .maybeSingle()
  ).data;

  if (!req) {
    const { data: koreanReq } = await sb
      .from("korean_booking_requests")
      .select("id, proposal_token, guest_name, event_date, group_size, status, club_id, selected_menu, selected_menu_total, notes, assigned_md_id, md_response, md_table_choosable, md_table_options, md_reject_reason, md_required_amount")
      .eq("proposal_token", token)
      .maybeSingle();
    req = koreanReq
      ? { ...koreanReq, lang: "ko", club_ids: koreanReq.club_id ? [koreanReq.club_id] : [], budget: null }
      : null;
  }

  if (!req) notFound();

  const clubId = (req.club_ids as string[] | null)?.[0] ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };

  const { data: md } = req.assigned_md_id
    ? await sb.from("users").select("display_name").eq("id", req.assigned_md_id).maybeSingle()
    : { data: null };

  return (
    <BookingProposal
      proposalToken={req.proposal_token}
      mdResponse={req.md_response}
      mdTableChoosable={req.md_table_choosable}
      mdTableOptions={req.md_table_options}
      mdRejectReason={req.md_reject_reason}
      mdRequiredAmount={req.md_required_amount}
      guestName={req.guest_name}
      eventDate={req.event_date}
      groupSize={req.group_size}
      cancelled={req.status === "cancelled"}
      lang={req.lang}
      clubName={club?.name ?? null}
      selectedMenu={req.selected_menu}
      selectedMenuTotal={req.selected_menu_total}
      budget={req.budget}
      guestRequest={req.notes}
      hostName={md?.display_name ?? null}
    />
  );
}
