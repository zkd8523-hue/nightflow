// 손님용 예약 확인서. 로그인 없이 public_token으로 열린다 —
// WhatsApp으로 링크만 받고 앱/계정 없이 본다(한국 앱스토어 심사 미완료).
//
// 서버에서 service role로 읽는다: 손님은 비로그인이라 RLS로는 조회가 안 되고,
// 토큰을 아는 사람만 볼 수 있으면 충분하다.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingPass } from "@/components/booking/BookingPass";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = createAdminClient();

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("ref_no, club_id, table_info, includes, total_price, confirmed_group_size, guest_request, request_id, request_type")
    .eq("public_token", token)
    .maybeSingle();

  if (!conf) notFound();

  // 확정서가 외국인 요청인지 한국 예약 요청인지에 따라 원본 테이블이 다르다
  // (2026-09-06, Migration 654) — club_ids(배열)/club_id(단일) 차이만 통일해서 다룬다.
  const reqTable = conf.request_type === "korean" ? "korean_booking_requests" : "foreign_requests";
  const clubIdCol = conf.request_type === "korean" ? "club_id" : "club_ids";
  const { data: reqRow } = await sb
    .from(reqTable)
    .select(`guest_name, event_date, group_size, status, assigned_md_id, ${clubIdCol}`)
    .eq("id", conf.request_id)
    .single();

  if (!reqRow) notFound();
  const req = reqRow as unknown as {
    guest_name: string;
    event_date: string;
    group_size: number;
    status: string;
    assigned_md_id: string | null;
    club_ids?: string[] | null;
    club_id?: string | null;
  };
  const reqClubIds = conf.request_type === "korean" ? [req.club_id].filter(Boolean) as string[] : (req.club_ids ?? []);

  const clubId = conf.club_id ?? reqClubIds[0] ?? null;
  const { data: club } = clubId
    ? await sb
        .from("clubs")
        .select("name, name_en, address, latitude, longitude, operating_hours")
        .eq("id", clubId)
        .maybeSingle()
    : { data: null };

  const { data: md } = req.assigned_md_id
    ? await sb.from("users").select("display_name").eq("id", req.assigned_md_id).maybeSingle()
    : { data: null };

  // MD가 "입장 완료"를 눌렀는지 — 리뷰 작성 자체를 막지는 않지만, 안 눌렀을 때는
  // 화면에 다른 안내 문구를 보여준다.
  const { data: pings } = await sb
    .from("arrival_pings")
    .select("kind")
    .eq("request_id", conf.request_id)
    .eq("kind", "arrived");

  const { data: existingReview } = await sb
    .from("booking_reviews")
    .select("rating, comment")
    .eq("request_id", conf.request_id)
    .maybeSingle();

  return (
    <BookingPass
      publicToken={token}
      requestId={conf.request_id}
      requestType={conf.request_type}
      refNo={conf.ref_no}
      arrivalConfirmed={(pings ?? []).length > 0}
      existingReview={existingReview ?? null}
      guestName={req.guest_name}
      eventDate={req.event_date}
      groupSize={conf.confirmed_group_size ?? req.group_size}
      cancelled={req.status === "cancelled"}
      clubName={club?.name_en || club?.name || null}
      address={club?.address ?? null}
      lat={club?.latitude ?? null}
      lng={club?.longitude ?? null}
      operatingHours={club?.operating_hours ?? null}
      tableInfo={conf.table_info}
      includes={conf.includes ?? []}
      totalPrice={conf.total_price}
      guestRequest={conf.guest_request}
      hostName={md?.display_name ?? null}
    />
  );
}
