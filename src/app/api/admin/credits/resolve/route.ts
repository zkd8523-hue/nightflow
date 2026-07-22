import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 — 계좌이체 충전 신청 처리.
 *  action='confirm' → 통장 입금 확인 후 적립 (confirm_credit_payment, 멱등)
 *  action='reject'  → 오입금/미입금 반려 (fail_credit_payment, 'cancelled')
 * 적립 성공 시 credit_payments UPDATE 트리거가 MD에게 "충전 완료" 푸시.
 */
export async function POST(req: Request) {
  try {
    const { paymentId, action } = await req.json();

    if (!paymentId || (action !== "confirm" && action !== "reject")) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    // 인증 + admin 권한 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { data: me } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "관리자만 처리할 수 있습니다." }, { status: 403 });
    }

    const admin = createAdminClient();

    // 계좌이체 pending 건인지 확인 (PG 건/이미 처리된 건 보호)
    const { data: payment } = await admin
      .from("credit_payments")
      .select("id, status, method, credits")
      .eq("payment_id", paymentId)
      .single();

    if (!payment || payment.method !== "bank_transfer") {
      return NextResponse.json({ error: "계좌이체 신청을 찾을 수 없습니다." }, { status: 404 });
    }
    if (payment.status !== "pending") {
      return NextResponse.json(
        { error: `이미 처리된 신청입니다. (${payment.status})` },
        { status: 409 }
      );
    }

    if (action === "confirm") {
      const { data: result, error } = await admin.rpc("confirm_credit_payment", {
        p_payment_id: paymentId,
        p_pg_tx_id: `BANK:${user.id}`,
      });
      if (error || !result?.success) {
        return NextResponse.json({ error: "적립 처리에 실패했습니다." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, credited: result.credits ?? payment.credits });
    }

    // reject
    const { error } = await admin.rpc("fail_credit_payment", {
      p_payment_id: paymentId,
      p_status: "cancelled",
    });
    if (error) {
      return NextResponse.json({ error: "반려 처리에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, rejected: true });
  } catch {
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
