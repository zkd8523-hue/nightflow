"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 모듈 레벨 캐시 — 앱 세션 동안 1회만 조회 (Kill Switch 플래그)
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchFlag(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_settings")
        .select("bool_value")
        .eq("key", "offer_chat_enabled")
        .maybeSingle();
      // 서버 is_offer_chat_enabled() 와 동일하게 COALESCE(..., TRUE):
      // 행 누락/조회 실패는 "새 모델(ON)" 로 간주해 서버 과금과 표시를 일치시킨다.
      cached = data?.bool_value ?? true;
    } catch {
      cached = true;
    } finally {
      inflight = null;
    }
    return cached ?? true;
  })();
  return inflight;
}

/**
 * 오퍼 채팅 Kill Switch 플래그 (3-state).
 *   undefined → 아직 확정 전(로딩). FeatureGate는 이때 fallback 대신 아무것도 안 그린다.
 *   true      → 새 모델 (채팅/15크레딧)
 *   false     → 관리자가 킬스위치를 명시적으로 내림 (레거시 30크레딧)
 *
 * 기본/실패 시 TRUE 로 정렬 (서버 COALESCE TRUE 와 동일).
 * 즉시 원복하려면 app_settings.offer_chat_enabled = FALSE.
 */
export function useOfferChatFlag(): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(cached ?? undefined);
  useEffect(() => {
    if (cached !== null) {
      setEnabled(cached);
      return;
    }
    let mounted = true;
    fetchFlag().then((v) => {
      if (mounted) setEnabled(v);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return enabled;
}
