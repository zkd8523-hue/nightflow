"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import type { Auction } from "@/types/database";
import { MyShareCard } from "@/components/shares/MyShareCard";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MySharesPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const router = useRouter();
  const supabase = createClient();

  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyShares = async (userId: string) => {
    const { data } = await supabase
      .from("share_claims")
      .select(`
        auction_id,
        auctions!inner(
          *,
          club:clubs(*)
        )
      `)
      .eq("user_id", userId)
      .is("cancelled_at", null)
      .order("claimed_at", { ascending: false });

    if (data) {
      setAuctions(data.map((d) => (d.auctions as unknown as Auction)));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user && !userLoading) {
      router.push("/login");
      return;
    }
    if (user) fetchMyShares(user.id);
  }, [user, userLoading]);

  if (loading || userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-brand-amber" />
          <h1 className="text-xl font-bold text-foreground">내 파티 참여</h1>
        </div>

        {auctions.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">참여 중인 파티 매물이 없습니다.</p>
            <p className="text-muted-foreground text-xs mt-1">메인 화면에서 파티 매물을 찾아보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auctions.map((auction) => (
              <MyShareCard
                key={auction.id}
                auction={auction}
                onCancelled={() => fetchMyShares(user!.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
