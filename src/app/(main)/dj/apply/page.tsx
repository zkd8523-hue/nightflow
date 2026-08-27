import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DjApplyForm } from "@/components/djs/DjApplyForm";
import { DjPendingStatus } from "@/components/djs/DjPendingStatus";

export default async function DjApplyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dj/apply");

  // 이미 인증된 DJ면 본인 프로필로
  const { data: owned } = await supabase
    .from("djs")
    .select("slug")
    .eq("claimed_by_user_id", user.id)
    .maybeSingle();
  if (owned?.slug) redirect(`/dj/${owned.slug}`);

  // 최근 신청 1건 — pending이면 대기 화면, rejected면 재신청 배너
  const { data: latestClaim } = await supabase
    .from("dj_claims")
    .select("id, status, claimed_instagram, reject_reason, dj:djs(display_name), requested_name")
    .eq("claimant_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestClaim?.status === "pending") {
    const djRef = Array.isArray(latestClaim.dj) ? latestClaim.dj[0] : latestClaim.dj;
    return (
      <div className="min-h-screen bg-background pt-20 pb-24 px-4">
        <div className="max-w-lg mx-auto">
          <DjPendingStatus
            instagram={latestClaim.claimed_instagram}
            djName={djRef?.display_name ?? latestClaim.requested_name}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        {latestClaim?.status === "rejected" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <p className="text-red-400 text-[13px] font-bold">이전 신청이 반려되었습니다.</p>
            {latestClaim.reject_reason && (
              <p className="text-muted-foreground text-[12px] mt-1">사유: {latestClaim.reject_reason}</p>
            )}
            <p className="text-muted-foreground text-[12px] mt-2">아래에서 다시 신청할 수 있습니다.</p>
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">DJ 인증</h1>
          <p className="text-muted-foreground text-[13px]">
            내 활동명을 찾아 인증하면 프로필 사진·소개를 채우고 인증 배지를 받을 수 있어요.
          </p>
        </div>

        <DjApplyForm />
      </div>
    </div>
  );
}
