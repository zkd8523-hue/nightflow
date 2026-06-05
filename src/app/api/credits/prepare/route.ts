import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditProduct } from "@/lib/payments/credit-products";

/**
 * 결제 의도 등록.
 * 클라이언트는 productId 만 보낸다. 금액/크레딧은 서버가 상수에서 재확정해
 * credit_payments(pending) 을 만들고 paymentId 를 발급한다. → 금액 위변조 차단.
 */
export async function POST(req: Request) {
  try {
    const { productId } = await req.json();

    const product = getCreditProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: "유효하지 않은 상품입니다." },
        { status: 400 }
      );
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
        { error: "MD 계정만 충전할 수 있습니다." },
        { status: 403 }
      );
    }

    // 결제 환경변수 확인
    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
    if (!storeId || !channelKey) {
      return NextResponse.json(
        { error: "결제 설정이 완료되지 않았습니다. (관리자 문의)" },
        { status: 503 }
      );
    }

    // 전역 유일 paymentId 생성 (상품코드 + UUID)
    const paymentId = `${product.id}_${crypto.randomUUID()}`;

    // pending 결제 기록 생성 (service_role)
    const admin = createAdminClient();
    const { error: insErr } = await admin.rpc("create_credit_payment", {
      p_md_id: user.id,
      p_payment_id: paymentId,
      p_product_id: product.id,
      p_credits: product.credits,
      p_amount: product.amount,
    });

    if (insErr) {
      return NextResponse.json(
        { error: "결제 준비에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentId,
      amount: product.amount,
      orderName: product.name,
      storeId,
      channelKey,
    });
  } catch {
    return NextResponse.json(
      { error: "결제 준비 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
