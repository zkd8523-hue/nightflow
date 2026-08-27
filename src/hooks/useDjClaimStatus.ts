"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface DjClaimStatus {
  /** 인증 완료 — 소유한 DJ의 slug (메뉴에서 항목을 완전히 숨기는 기준) */
  claimedSlug: string | null;
  /** 승인 대기 중인 신청 존재 여부 */
  pending: boolean;
  loading: boolean;
}

/**
 * 헤더 메뉴의 "파트너 신청" 항목을 DJ 인증 상태에 따라 감추거나 바꾸기 위한
 * 훅. users.role은 건드리지 않는 설계라(md-merry-lark 플랜 핵심 결정) 이 상태는
 * djs.claimed_by_user_id / dj_claims에서 직접 조회해야 한다 — useCurrentUser의
 * 전역 유저 객체에는 없다.
 *
 * role==='user'인 사람만 의미가 있으므로(MD·admin은 이미 다른 분기) 그 경우에만
 * 호출한다.
 */
export function useDjClaimStatus(userId: string | undefined): DjClaimStatus {
  const [claimedSlug, setClaimedSlug] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setClaimedSlug(null);
      setPending(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: owned }, { data: claim }] = await Promise.all([
        supabase.from("djs").select("slug").eq("claimed_by_user_id", userId).maybeSingle(),
        supabase.from("dj_claims").select("id").eq("claimant_id", userId).eq("status", "pending").limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setClaimedSlug(owned?.slug ?? null);
      setPending(!!claim);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { claimedSlug, pending, loading };
}
