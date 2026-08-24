import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CouponRedeemScreen } from "@/components/coupon/CouponRedeemScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CouponUsePage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/my-coupons/${claimId}/use`);

  // 본인 claim인지 존재 확인만 (실제 상태 검증은 CouponRedeemScreen이 RPC로 재확인)
  const { data: claim } = await supabase
    .from("coupon_claims")
    .select("id, user_id")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim || claim.user_id !== user.id) notFound();

  const { data: profile } = await supabase
    .from("public_user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return <CouponRedeemScreen claimId={claimId} displayName={profile?.display_name ?? "게스트"} />;
}
