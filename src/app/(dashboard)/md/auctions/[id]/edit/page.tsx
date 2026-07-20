import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuctionForm } from "@/components/md/AuctionForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface EditAuctionPageProps {
    params: Promise<{ id: string }>;
}

export default async function EditAuctionPage({ params }: EditAuctionPageProps) {
    const { id } = await params;
    const supabase = await createClient();

    // 1. 세션 및 MD 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: userData } = await supabase
        .from("users")
        .select("role, default_club_id")
        .eq("id", user.id)
        .single();

    if (!userData || (userData.role !== "md" && userData.role !== "admin")) {
        redirect("/");
    }

    // 2. 경매 정보 데이터 조회 (admin은 모든 경매, 그 외엔 본인 경매만)
    const isAdmin = userData.role === "admin";
    let { data: auction } = await supabase
        .from("auctions")
        .select("*")
        .eq("id", id)
        .single();

    // MD 직통 조각은 auctions가 아니라 puzzles에 저장됨 → puzzles에서 찾아
    // AuctionForm이 기대하는 형태(listing_type='share')로 매핑해 동일 폼으로 수정.
    if (!auction) {
        const { data: puzzle } = await supabase
            .from("puzzles")
            .select("*")
            .eq("id", id)
            .eq("host_is_md", true)
            .single();
        if (puzzle) {
            auction = {
                id: puzzle.id,
                md_id: puzzle.leader_id,
                listing_type: "share",
                club_id: puzzle.club_id,
                event_date: puzzle.event_date,
                total_seats: puzzle.target_count,
                price_per_seat: puzzle.budget_per_person,
                includes: puzzle.includes ?? [],
                table_info: puzzle.table_info ?? null,
                md_message: puzzle.notes ?? "",
                md_comment: puzzle.md_comment ?? "",
                target_male: 0,
                target_female: 0,
            } as typeof auction;
        }
    }

    if (!auction) {
        redirect("/md/dashboard");
    }
    if (!isAdmin && auction.md_id !== user.id) {
        redirect("/md/dashboard");
    }

    // 3. 클럽 목록: 경매 owner의 클럽 로드 (Migration 177: club_partners 기반)
    //    admin이 남의 경매 수정 시에도 owner(md_id)의 partner 클럽 풀을 사용.
    //    Migration 216: MD 본인의 club_partners.thumbnail_url 같이 조회
    const { data: clubs } = await supabase
        .from("clubs")
        .select("*, club_partners!inner(md_id, thumbnail_url)")
        .eq("club_partners.md_id", auction.md_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

    const partnerThumbnailMap: Record<string, string | null> = {};
    for (const c of clubs ?? []) {
        const partners = (c as { club_partners?: Array<{ md_id: string; thumbnail_url: string | null }> }).club_partners ?? [];
        const own = partners.find((p) => p.md_id === auction.md_id);
        partnerThumbnailMap[c.id] = own?.thumbnail_url ?? null;
    }

    const editTitle = auction.listing_type === "share"
        ? "조각 정보 수정"
        : auction.listing_type === "instant"
            ? "오늘특가 정보 수정"
            : "경매 정보 수정";
    const editDesc = auction.listing_type === "share"
        ? "등록된 조각 내용을 수정합니다."
        : auction.listing_type === "instant"
            ? "등록된 오늘특가 내용을 수정합니다."
            : "등록된 경매 내용을 수정합니다.";

    return (
        <div className="min-h-screen bg-background pb-20">
            <div className="max-w-lg mx-auto p-6 pt-12">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/md/dashboard" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border">
                        <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <div className="space-y-0.5">
                        <h1 className="text-2xl font-black text-foreground tracking-tight">{editTitle}</h1>
                        <p className="text-muted-foreground text-sm font-medium">{editDesc}</p>
                    </div>
                </div>

                <AuctionForm
                    clubs={clubs || []}
                    mdId={auction.md_id}
                    initialData={auction}
                    defaultClubId={userData.default_club_id}
                    partnerThumbnailMap={partnerThumbnailMap}
                />
            </div>
        </div>
    );
}
