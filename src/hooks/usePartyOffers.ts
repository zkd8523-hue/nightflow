"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PartyOffer } from "@/types/database";

/**
 * 조각 단체방 오퍼 리스트 (get_party_offers RPC).
 * - 좋아요/싫어요 투표 + MD 초대 후 재조회.
 * - 오퍼/투표/초대 변화 실시간 반영.
 */
export function usePartyOffers(puzzleId: string) {
  const [offers, setOffers] = useState<PartyOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_party_offers", { p_puzzle_id: puzzleId });
    if (error) {
      console.error("[usePartyOffers] error", error.message);
      setOffers([]);
    } else {
      setOffers((data ?? []) as PartyOffer[]);
    }
    setLoading(false);
  }, [puzzleId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 오퍼/투표/초대 변화 실시간 → 목록 갱신
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`party-offers:${puzzleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_offers", filter: `puzzle_id=eq.${puzzleId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_offer_votes" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_party_md", filter: `puzzle_id=eq.${puzzleId}` }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [puzzleId, reload]);

  const vote = useCallback(async (offerId: string, v: "like" | "dislike") => {
    // 옵티미스틱
    setOffers((prev) =>
      prev.map((o) => {
        if (o.offer_id !== offerId) return o;
        const had = o.my_vote;
        const next = had === v ? null : v;
        let like = o.like_count;
        let dislike = o.dislike_count;
        if (had === "like") like -= 1;
        if (had === "dislike") dislike -= 1;
        if (next === "like") like += 1;
        if (next === "dislike") dislike += 1;
        return { ...o, my_vote: next, like_count: like, dislike_count: dislike };
      })
    );
    const { error } = await createClient().rpc("vote_offer", { p_offer_id: offerId, p_vote: v });
    if (error) reload();
  }, [reload]);

  return { offers, loading, reload, vote };
}
