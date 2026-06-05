import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAndCreditPayment } from "@/lib/payments/verify";

/**
 * 포트원 결제 완료 redirect 도착지.
 * 모바일/리다이렉트 방식 결제는 결과가 쿼리스트링으로 돌아온다.
 * 여기서 서버 검증 + 적립을 수행하고 결과를 보여준다.
 * (PG 창 방식은 CreditRecharge 에서 이미 verify 하므로, 여기선 멱등 재확인)
 */
export default async function CreditCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string; code?: string; message?: string }>;
}) {
  const params = await searchParams;
  const paymentId = params.paymentId;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  let ok = false;
  let message = params.message ?? "";

  // PG 가 실패 코드를 붙여 돌아온 경우
  if (params.code) {
    ok = false;
    message = params.message || "결제가 취소되었거나 실패했습니다.";
  } else if (paymentId) {
    const result = await verifyAndCreditPayment(paymentId);
    ok = result.success;
    message = result.success
      ? `크레딧 ${result.credits}개가 충전되었습니다.`
      : result.error ?? "결제 검증에 실패했습니다.";
  } else {
    message = "결제 정보를 찾을 수 없습니다.";
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        {ok ? (
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        ) : (
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
        )}
        <div className="space-y-2">
          <h1 className="text-xl font-black text-white">
            {ok ? "충전 완료" : "충전 실패"}
          </h1>
          <p className="text-sm text-neutral-400">{message}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/md/dashboard"
            className="w-full rounded-full bg-white text-black font-black py-3"
          >
            대시보드로 이동
          </Link>
          {!ok && (
            <Link
              href="/md/credits"
              className="w-full rounded-full border border-neutral-700 text-white font-bold py-3"
            >
              다시 충전하기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
