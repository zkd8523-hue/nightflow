import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { AdminVisitReviews } from "@/components/admin/AdminVisitReviews";

export default async function AdminVisitReviewsPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <Link href="/admin" className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-card">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-[16px] font-black tracking-tight">방문 리뷰 검토</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed break-keep">
          만료된 깃발에서 유저가 &ldquo;다녀왔다&rdquo;고 남긴 리뷰예요. 파트너에게 실제
          방문을 확인한 뒤 승인하면 파트너 프로필에 별점·태그가 표시됩니다.
        </p>
        <AdminVisitReviews />
      </div>
    </div>
  );
}
