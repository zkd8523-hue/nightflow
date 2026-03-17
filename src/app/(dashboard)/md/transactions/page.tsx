import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransactionList } from "@/components/md/TransactionList";

export default async function MDTransactionsPage() {
    const supabase = await createClient();

    // 1. 유저 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

    if (userData?.role !== "md" && userData?.role !== "admin") redirect("/");

    // 2. 낙찰건 조회 (won | contacted | confirmed | cancelled)
    const { data: wonAuctions, error: wonError } = await supabase
        .from("auctions")
        .select(`
            *,
            club:club_id(*),
            winner:winner_id (name, phone, noshow_count, strike_count)
        `)
        .eq("md_id", user.id)
        .in("status", ["won", "contacted", "confirmed", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(100);

    if (wonError) {
        console.error("[MDTransactions] wonAuctions query error:", wonError);
    }

    const auctionList = (wonAuctions || []).map(auction => ({
        auctionId: auction.id,
        auctionStatus: auction.status as string,
        clubName: auction.club?.name,
        eventDate: auction.event_date,
        winner: auction.winner,
        contactDeadline: auction.contact_deadline as string | null,
        createdAt: auction.won_at || auction.updated_at,
        winningPrice: auction.winning_price as number | null,
    }));

    return (
        <div className="min-h-screen bg-[#0A0A0A]">
            <TransactionList items={auctionList} />
        </div>
    );
}
