"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface DepositStatus {
  required: boolean;
  status: "not_required" | "unpaid" | "paid" | "held";
  depositId?: string;
  amount?: number;
  paid: boolean;
}

export function useDepositStatus(auctionId: string | undefined, userId: string | undefined) {
  const [depositStatus, setDepositStatus] = useState<DepositStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!auctionId || !userId) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("check_deposit_status", {
        p_auction_id: auctionId,
        p_user_id: userId,
      });

      if (error) throw error;
      setDepositStatus(data as DepositStatus);
    } catch {
      // 에러 시 not_required로 fallback (보증금 없는 경매 가능)
      setDepositStatus({ required: false, status: "not_required", paid: false });
    } finally {
      setLoading(false);
    }
  }, [auctionId, userId]);

  useEffect(() => {
    check();
  }, [check]);

  /** 보증금 결제 필요 여부 (required && !paid) */
  const needsDeposit = depositStatus?.required && !depositStatus?.paid;

  return {
    depositStatus,
    loading,
    needsDeposit,
    refresh: check,
  };
}
