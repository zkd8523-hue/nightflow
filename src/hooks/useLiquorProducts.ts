"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiquorProduct } from "@/types/database";

/**
 * liquor_products를 한 번만 불러와 캐시 — 오퍼 카드마다 재조회하지 않음.
 * enabled=false면 실제로 필요할 때까지 전체 테이블 로드를 건너뜀 (기본 true = 기존 동작).
 */
export function useLiquorProducts(enabled: boolean = true) {
  const [products, setProducts] = useState<LiquorProduct[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    setIsLoading(true);
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("liquor_products")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        if (cancelled) return;
        setProducts((data as LiquorProduct[]) || []);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { products, isLoading };
}
