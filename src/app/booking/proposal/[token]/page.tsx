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

import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BookingProposal } from "@/components/booking/BookingProposal";
import { parseSeatZones } from "@/lib/booking/seats";
import { effectiveTcRule, isWeekendDate, loadPickerMenu, type MdMenu } from "@/lib/booking/mdMenu";

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
      .select("id, proposal_token, guest_name, event_date, group_size, status, lang, club_ids, selected_menu, selected_menu_total, budget, notes, assigned_md_id, md_response, md_table_choosable, md_table_options, md_reject_reason, md_required_amount, md_proposed_items, md_reject_note, md_seats, md_bump_risk, md_conditions, md_menu, guest_choice, md_reconfirm_state, guest_action_payload, proposal_sent_at")
      // URL 세그먼트는 proposal_token(무작위 16바이트). 예약 id는 노출하지 않는다.
      .eq("proposal_token", token)
      .maybeSingle()
  ).data;

  let requestType: "foreign" | "korean" = "foreign";
  if (!req) {
    requestType = "korean";
    const { data: koreanReq } = await sb
      .from("korean_booking_requests")
      .select("id, proposal_token, guest_name, event_date, group_size, status, club_id, selected_menu, selected_menu_total, notes, assigned_md_id, md_response, md_table_choosable, md_table_options, md_reject_reason, md_required_amount, md_proposed_items, md_reject_note, md_seats, md_bump_risk, md_conditions, md_menu, guest_choice, md_reconfirm_state")
      .eq("proposal_token", token)
      .maybeSingle();
    req = koreanReq
      ? { ...koreanReq, lang: "ko", club_ids: koreanReq.club_id ? [koreanReq.club_id] : [], budget: null, guest_action_payload: null, proposal_sent_at: null }
      : null;
  }

  if (!req) notFound();

  const clubId = (req.club_ids as string[] | null)?.[0] ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name, drink_menu_url, drink_menu_urls, floor_plan_url, floor_plan_urls, seat_zones, table_charge_rule, table_charge_weekday, table_charge_weekend").eq("id", clubId).maybeSingle()
    : { data: null };

  const { data: md } = req.assigned_md_id
    ? await sb.from("users").select("display_name").eq("id", req.assigned_md_id).maybeSingle()
    : { data: null };

  // 확정서가 이미 나왔으면 제안서에서 바로 넘어갈 수 있게 MD용 확정서 링크를 준다 —
  // 푸시·예약관리에서 제안서로 들어온 MD가 확정 여부를 따로 찾지 않아도 된다(2026-09-30).
  // proposal_token을 가진 사람 = 담당 MD라 MD용 확정서(md_token)를 보여줘도 같은 범위다.
  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("md_token")
    .eq("request_type", requestType)
    .eq("request_id", req.id)
    .maybeSingle();

  // 외국인 예약은 확인서가 나가면 제안서를 닫는다 — 푸시·문자로 받은 옛 링크를 다시 열면 "이 조건으로 가능하신가요?"가 또 보여 헷갈리고,
  // 도착 알림·입장 완료·밀림은 전부 MD 확인서에 있어서 링크 하나만 기억하면 된다(2026-11-06). 취소된 예약은 예전처럼 제안서에 "취소됨"으로 보여준다.
  if (requestType === "foreign" && conf?.md_token && req.status !== "cancelled") redirect(`/booking/md/${conf.md_token}`);

  // 메뉴판에서 구성을 고르는 건 "MD 추천" 요청뿐 — 손님이 직접 고른 요청은 구성·합계가 이미 정해져 있다.
  const isRecommend = !!(req.selected_menu as { md_recommend?: unknown } | null)?.md_recommend;
  const menuItems = clubId && isRecommend ? await loadPickerMenu(sb, clubId, isWeekendDate(req.event_date)) : [];
  const saved = req.md_menu as MdMenu | null;
  const mdMenuInit = {
    qty: Object.fromEntries((saved?.lines ?? []).map((l) => [l.variant_id, l.qty])),
    tc: saved?.tc ?? 0,
    // 이미 고른 구성이면 TC를 그대로 두고, 처음이면 클럽 규칙으로 자동 채운다
    tcTouched: !!saved,
  };

  // 메뉴판이 없는 클럽에서 "지난번 구성 불러오기" — 이 담당자가 이 클럽에 저번에 보낸 구성 한 건.
  let lastItems: string | null = null;
  if (requestType === "foreign" && req.assigned_md_id && clubId && !(req.selected_menu as { items?: unknown[] } | null)?.items?.length) {
    const { data: prev } = await sb
      .from("foreign_requests")
      .select("md_proposed_items")
      .eq("assigned_md_id", req.assigned_md_id)
      .contains("club_ids", [clubId])
      .not("md_proposed_items", "is", null)
      .neq("id", req.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastItems = (prev?.md_proposed_items as string | null) ?? null;
  }

  // 담당 MD 본인이 로그인 상태(앱)로 열었을 때만 예약관리로 돌아가는 링크를 단다.
  const { data: { user: viewer } } = await (await createClient()).auth.getUser();
  const backHref = viewer && viewer.id === req.assigned_md_id ? "/md/dashboard?section=concierge" : null;

  return (
    <BookingProposal
      proposalToken={req.proposal_token}
      mdResponse={req.md_response}
      mdTableChoosable={req.md_table_choosable}
      mdTableOptions={req.md_table_options}
      mdRejectReason={req.md_reject_reason}
      mdRequiredAmount={req.md_required_amount}
      mdProposedItems={req.md_proposed_items}
      mdRejectNote={req.md_reject_note}
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
      confirmHref={conf?.md_token ? `/booking/md/${conf.md_token}` : null}
      menuUrls={
        club?.drink_menu_urls?.length ? club.drink_menu_urls : club?.drink_menu_url ? [club.drink_menu_url] : []
      }
      backHref={backHref}
      floorPlanUrls={
        club?.floor_plan_urls?.length ? club.floor_plan_urls : club?.floor_plan_url ? [club.floor_plan_url] : []
      }
      seatZones={parseSeatZones(club?.seat_zones)}
      mdSeats={req.md_seats ?? []}
      mdBumpRisk={req.md_bump_risk ?? null}
      mdConditions={req.md_conditions ?? null}
      pendingGuestChoice={req.md_reconfirm_state === "pending" ? req.guest_choice : null}
      guestBackup={((): string | null => { const b = (req.guest_action_payload as { backup?: unknown } | null)?.backup; return typeof b === "string" && b !== "any" ? b : null; })()}
      menuItems={menuItems}
      tcRule={effectiveTcRule(club, isWeekendDate(req.event_date))}
      mdMenuInit={mdMenuInit}
      lastItems={lastItems}
      proposalSentAt={req.proposal_sent_at ?? null}
    />
  );
}
