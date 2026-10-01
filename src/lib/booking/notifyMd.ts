// 담당 MD(파트너)에게 제안서/확정서 알림을 보낸다 — 앱 푸시 + 벨 아이콘(인앱) 둘 다,
// 푸시가 안 되면 링크를 SMS로. 어드민 "제안서 보내기/확정서 보내기"(/api/admin/notify-md)와
// 손님의 "다시 요청"(/api/booking-rerequest)이 같이 쓴다(2026-09-30).
//
// "확정서 보내기"(kind='confirmation')는 MD뿐 아니라 손님에게도 같은 방식(푸시+인앱)으로
// 보낸다 — 예전엔 확정서 "저장" 시점에 손님에게 자동 발송했는데, 운영자가 내용을
// 다듬기 전에 먼저 나가는 문제가 있어 "보내기" 버튼 하나로 합쳤다(사용자 결정, 2026-09-30).
//
// 아무 채널도 없으면 no_channel — 부르는 쪽이 운영자에게 "직접 보내라"고 알려야 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/notifications/alimtalk";

// SMS 링크는 운영 도메인으로 고정한다 — 로컬에서 보내도 받는 사람 링크는 열려야 한다.
const SITE = "https://nightflow.kr";
const DOW = "일월화수목금토";

// in_app_notifications.type CHECK(Migration 679)에 이미 추가된 값만 쓸 수 있다.
// 벨 알림 INSERT는 실패해도(트리거·제약 문제 등) 절대 본 발송(push/sms)을 막지 않는다.
async function insertInApp(
  sb: SupabaseClient,
  userId: string,
  type: string,
  title: string,
  message: string,
  actionUrl: string
) {
  try {
    await sb.from("in_app_notifications").insert({ user_id: userId, type, title, message, action_url: actionUrl });
  } catch (e) {
    console.error("[insertInApp] 실패", type, e);
  }
}

export type GuestChannel = "push" | "sms" | "none";

export type NotifyMdResult =
  | { ok: true; channel: "push" | "sms"; guestChannel?: GuestChannel }
  | { ok: false; error: "not_found" | "cancelled" | "md_required" | "no_confirmation" | "no_channel"; status: number };

export async function notifyAssignedMd(
  sb: SupabaseClient,
  opts: {
    requestType: "foreign" | "korean";
    requestId: string;
    kind: "proposal" | "confirmation";
    /** 손님이 조건을 바꿔 다시 요청한 제안서 — 제목·문구를 "수정된 제안"으로 */
    revised?: boolean;
  }
): Promise<NotifyMdResult> {
  const { requestType, requestId, kind, revised } = opts;
  const table = requestType === "korean" ? "korean_booking_requests" : "foreign_requests";

  const { data: rawReq } = await sb
    .from(table)
    .select(
      `id, user_id, guest_name, event_date, group_size, status, assigned_md_id, proposal_token, selected_menu_total, contact_type, contact_value, ${
        requestType === "korean" ? "club_id" : "club_ids, budget"
      }`
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!rawReq) return { ok: false, error: "not_found", status: 404 };
  const r = rawReq as unknown as {
    id: string;
    user_id: string;
    guest_name: string | null;
    event_date: string;
    group_size: number;
    status: string;
    assigned_md_id: string | null;
    proposal_token: string | null;
    selected_menu_total: number | null;
    contact_type: string | null;
    contact_value: string | null;
    budget?: number | null;
    club_id?: string | null;
    club_ids?: string[] | null;
  };
  if (r.status === "cancelled") return { ok: false, error: "cancelled", status: 409 };
  if (!r.assigned_md_id) return { ok: false, error: "md_required", status: 400 };

  const { data: conf } = await sb
    .from("booking_confirmations")
    .select("ref_no, md_token, public_token, club_id, total_price, confirmed_group_size")
    .eq("request_type", requestType)
    .eq("request_id", r.id)
    .maybeSingle();

  let path: string;
  if (kind === "proposal") {
    if (!r.proposal_token) return { ok: false, error: "not_found", status: 404 };
    path = `/booking/proposal/${r.proposal_token}`;
  } else {
    if (!conf?.md_token) return { ok: false, error: "no_confirmation", status: 404 };
    path = `/booking/md/${conf.md_token}`;
  }

  // 알림 문구 — 잠금화면에서 열지 않고도 무슨 건인지 알 수 있게 클럽·날짜·인원·금액을 담는다.
  const clubId = conf?.club_id ?? (requestType === "korean" ? r.club_id : r.club_ids?.[0]) ?? null;
  const { data: club } = clubId
    ? await sb.from("clubs").select("name").eq("id", clubId).maybeSingle()
    : { data: null };
  const d = new Date(r.event_date + "T00:00:00");
  const dateText = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const rawSize = ((kind === "confirmation" ? conf?.confirmed_group_size : null) ?? String(r.group_size)).trim();
  const sizeText = /^\d+$/.test(rawSize) ? `${rawSize}명` : rawSize;
  const amount = kind === "confirmation" ? conf?.total_price : (r.selected_menu_total ?? r.budget ?? null);
  const parts = [
    `${requestType === "foreign" ? "[외국인] " : ""}${club?.name ?? "클럽 미정"}`,
    dateText,
    sizeText,
    amount ? `${amount.toLocaleString("ko-KR")}원` : null,
  ].filter(Boolean);
  const title =
    kind === "confirmation"
      ? "✅ 예약 확정서가 나왔어요"
      : revised
      ? "📩 손님이 조건을 바꿔 다시 요청했어요"
      : "📩 예약 제안이 왔어요";
  const text =
    kind === "proposal"
      ? `${parts.join(" · ")} — 가능 여부를 알려주세요`
      : `${parts.join(" · ")} — ${conf?.ref_no ?? ""} 확정서를 확인해 주세요`;

  const mdId = r.assigned_md_id;
  const inAppType = kind === "proposal" ? "md_new_booking_proposal" : "md_booking_confirmed";
  // 벨 알림은 채널(푸시/SMS) 성공 여부와 무관하게 항상 남긴다 — 실패해도 위에서
  // try/catch로 격리했으니 본 발송을 막지 않는다.
  await insertInApp(sb, mdId, inAppType, title, text, path);

  const { count: tokenCount } = await sb
    .from("push_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", mdId);

  let mdResult: NotifyMdResult;
  if ((tokenCount ?? 0) > 0) {
    const { error } = await sb.rpc("notify_user_push", {
      p_user_id: mdId,
      p_title: title,
      p_body: text,
      p_data: { type: kind === "proposal" ? "booking_proposal" : "booking_confirmation", request_id: r.id },
      p_url: path,
      p_category: "transaction",
    });
    mdResult = error
      ? { ok: false, error: "no_channel", status: 422 }
      : { ok: true, channel: "push" };
    if (error) console.error("[notifyAssignedMd] push 실패", mdId, error);
  } else {
    mdResult = { ok: false, error: "no_channel", status: 422 };
  }

  if (mdResult.ok === false) {
    const { data: md } = await sb.from("users").select("phone").eq("id", mdId).single();
    if (md?.phone) {
      try {
        await sendSms(md.phone, `[나이트플로우] ${title.replace(/^\S+\s/, "")}\n${text}\n${SITE}${path}`);
        mdResult = { ok: true, channel: "sms" };
      } catch (e) {
        console.error("[notifyAssignedMd] sms 실패", e);
      }
    }
  }

  // 확정서가 나온 경우엔 손님에게도 보낸다 — "확정서 저장" 시점 자동 발송을 없애고
  // 이 "보내기" 버튼 하나로 MD·손님 모두 커버한다(2026-09-30).
  // 손님 알림은 부가 기능이라 실패해도 MD 발송 결과(mdResult)에는 영향을 주지 않는다.
  //
  // 앱이 없는 손님은 푸시 토큰이 없어 벨 알림만 남고 사실상 아무것도 못 받았다
  // (2026-10-01, 두 건 모두 미수신). 그래서 푸시가 안 되면 연락처가 한국 휴대폰일 때
  // 링크를 문자로 보내고, 결과 채널을 확정서에 남겨 어드민 카드에서 보이게 한다.
  if (kind === "confirmation" && conf?.public_token) {
    let guestChannel: GuestChannel = "none";
    try {
      const guestPath = `/booking/${conf.public_token}`;
      const guestTitle = "✅ 예약이 확정됐어요";
      const guestText = `${parts.join(" · ")} — ${conf.ref_no ?? ""} 확정서를 확인해 주세요`;
      await insertInApp(sb, r.user_id, "korean_booking_confirmed", guestTitle, guestText, guestPath);

      const { count: guestTokenCount } = await sb
        .from("push_tokens")
        .select("*", { count: "exact", head: true })
        .eq("user_id", r.user_id);
      if ((guestTokenCount ?? 0) > 0) {
        const { error: guestPushErr } = await sb.rpc("notify_user_push", {
          p_user_id: r.user_id,
          p_title: guestTitle,
          p_body: guestText,
          p_data: { type: "booking_confirmed", request_id: r.id },
          p_url: guestPath,
          p_category: "transaction",
        });
        if (guestPushErr) console.error("[notifyAssignedMd] 손님 push 실패", guestPushErr);
        else guestChannel = "push";
      }

      const guestPhone = r.contact_type === "phone" ? (r.contact_value ?? "").replace(/[^0-9]/g, "") : "";
      if (guestChannel === "none" && /^01\d{8,9}$/.test(guestPhone)) {
        try {
          await sendSms(
            guestPhone,
            `[나이트플로우] 예약이 확정됐어요\n${guestText}\n${SITE}${guestPath}\n입장할 때 확정서 화면을 보여주세요.`
          );
          guestChannel = "sms";
        } catch (e) {
          console.error("[notifyAssignedMd] 손님 sms 실패", e);
        }
      }
    } catch (e) {
      console.error("[notifyAssignedMd] 손님 알림 실패", e);
    }

    // 컬럼은 Migration 680 — 미적용이어도 에러만 반환되고 발송은 이미 끝났다.
    const { error: recErr } = await sb
      .from("booking_confirmations")
      .update({ guest_notified_at: new Date().toISOString(), guest_notify_channel: guestChannel })
      .eq("request_type", requestType)
      .eq("request_id", r.id);
    if (recErr) console.error("[notifyAssignedMd] 손님 전달 기록 실패", recErr);

    return mdResult.ok ? { ...mdResult, guestChannel } : mdResult;
  }

  return mdResult;
}
