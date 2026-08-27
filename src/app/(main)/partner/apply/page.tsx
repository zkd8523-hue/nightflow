import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Music, Star } from "lucide-react";

// "파트너 신청" 메뉴 하나에서 갈라지는 갈림길 — 메뉴 항목을 늘리지 않기 위해
// (사용자 결정). DJ와 클럽 쪽(영업진·MD·대표)은 검증 방식은 같아도 신청서
// 내용이 완전히 다르므로 이 화면에서 먼저 나눈다.
export default async function PartnerApplyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/partner/apply");

  return (
    <div className="min-h-screen bg-background pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-black text-foreground">어떤 활동을 하시나요?</h1>
          <p className="text-muted-foreground text-[13px]">신청서가 서로 달라 먼저 확인할게요</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/dj/apply"
            className="flex items-center gap-4 bg-card border border-border rounded-2xl p-5 hover:border-foreground/20 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Music className="w-6 h-6 text-brand-amber" />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-black text-foreground">DJ</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">플레이 일정과 프로필을 관리해요</p>
            </div>
          </Link>

          <Link
            href="/md/apply"
            className="flex items-center gap-4 bg-card border border-border rounded-2xl p-5 hover:border-foreground/20 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Star className="w-6 h-6 text-brand-amber" />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-black text-foreground">관리자 (영업진, MD, 대표)</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">테이블 예약과 게스트 관리를 해요</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
