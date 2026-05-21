import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubForm } from "@/components/md/ClubForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Club } from "@/types/database";

export default async function EditClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch club — Migration 177(club_partners) 기반 (옛 clubs.md_id 단일 매핑은 다중 파트너 시 누락 발생)
  // Migration 216: club_partners.thumbnail_url (MD 본인의 클럽 대표 이미지) 같이 조회
  const { data: clubRaw, error } = await supabase
    .from("clubs")
    .select("*, club_partners!inner(md_id, thumbnail_url)")
    .eq("id", id)
    .eq("club_partners.md_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error || !clubRaw) {
    notFound();
  }
  const { club_partners, ...club } = clubRaw;
  const partnerThumbnailUrl =
    (club_partners as Array<{ md_id: string; thumbnail_url: string | null }>)?.[0]
      ?.thumbnail_url ?? null;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto">
        <div className="px-6 pt-8 pb-6">
          <Link
            href="/md/clubs"
            className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">뒤로</span>
          </Link>
          <h1 className="text-2xl font-black text-white tracking-tight">클럽 수정</h1>
          <p className="text-neutral-500 text-sm mt-1">{club.name}</p>
        </div>

        <div className="px-6">
          <ClubForm
            mdId={user.id}
            initialData={club as Club}
            initialPartnerThumbnailUrl={partnerThumbnailUrl}
          />
        </div>
      </div>
    </div>
  );
}
