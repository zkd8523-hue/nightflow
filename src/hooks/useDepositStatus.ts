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
  const [error, setError] = useState(false);

  const check = useCallback(async () => {
    if (!auctionId || !userId) return;

    setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("check_deposit_status", {
        p_auction_id: auctionId,
        p_user_id: userId,
      });

      if (rpcError) throw rpcError;
      setDepositStatus(data as DepositStatus);
    } catch {
      setError(true);
      setDepositStatus(null);
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
    error,
    refresh: check,
  };
}
