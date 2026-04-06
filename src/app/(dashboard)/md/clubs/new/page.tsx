import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubForm } from "@/components/md/ClubForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NewClubPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!userData || (userData.role !== "md" && userData.role !== "admin") || (userData.role === "md" && userData.md_status !== "approved")) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="px-6 pt-8 pb-6">
          <Link
            href="/md/clubs"
            className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">뒤로</span>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight">클럽 추가 등록</h1>
          <p className="text-neutral-500 text-sm mt-1">클럽 정보를 입력해주세요.</p>
        </div>

        {/* Form */}
        <div className="px-6">
          <ClubForm mdId={user.id} />
        </div>
      </div>
    </div>
  );
}
