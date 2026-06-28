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
      cached = data?.bool_value ?? false;
    } catch {
      cached = false;
    } finally {
      inflight = null;
    }
    return cached ?? false;
  })();
  return inflight;
}

/**
 * 오퍼 채팅 Kill Switch 플래그.
 * 기본값 false → 플래그 확인 전엔 채팅 진입점 숨김(안전).
 * app_settings.offer_chat_enabled = FALSE 로 즉시 전체 원복.
 */
export function useOfferChatFlag(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? false);
  useEffect(() => {
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
