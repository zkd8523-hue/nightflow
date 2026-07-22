import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditProduct, BANK_TRANSFER_ACCOUNT } from "@/lib/payments/credit-products";

/**
 * 계좌이체 충전 신청.
 * MD가 패키지 + 입금자명을 보내면 credit_payments(pending, method='bank_transfer')를 생성한다.
 * 금액/크레딧은 서버가 productId 로 재확정(위변조 차단). 생성 즉시 DB 트리거가 관리자에게 푸시.
 * 실제 입금은 MD가 안내된 사업용 계좌로 직접 송금하고, 관리자가 통장 확인 후 수기 적립한다.
 */
export async function POST(req: Request) {
  try {
    const { productId, depositorName } = await req.json();

    const product = getCreditProduct(productId);
    if (!product) {
      return NextResponse.json({ error: "유효하지 않은 상품입니다." }, { status: 400 });
    }

    const name = typeof depositorName === "string" ? depositorName.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "입금자명을 입력해주세요." }, { status: 400 });
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "입금자명이 너무 깁니다." }, { status: 400 });
    }

    // 인증 + MD 권한 확인
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
    if (!me || (me.role !== "md" && me.role !== "admin")) {
      return NextResponse.json(
        { error: "파트너 계정만 충전할 수 있습니다." },
        { status: 403 }
      );
    }

    // 전역 유일 paymentId (계좌이체 식별 prefix)
    const paymentId = `bank_${product.id}_${crypto.randomUUID()}`;

    // pending 신청 생성 (service_role) → INSERT 트리거가 관리자 푸시 발송
    const admin = createAdminClient();
    const { error: insErr } = await admin.rpc("create_bank_transfer_request", {
      p_md_id: user.id,
      p_payment_id: paymentId,
      p_product_id: product.id,
      p_credits: product.credits,
      p_amount: product.amount,
      p_depositor_name: name,
    });

    if (insErr) {
      return NextResponse.json(
        { error: "신청 처리에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentId,
      amount: product.amount,
      credits: product.credits,
      depositorName: name,
      account: BANK_TRANSFER_ACCOUNT,
    });
  } catch {
    return NextResponse.json(
      { error: "신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
