"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiquorProduct } from "@/types/database";

/** liquor_products를 한 번만 불러와 캐시 — 오퍼 카드마다 재조회하지 않음 */
export function useLiquorProducts() {
  const [products, setProducts] = useState<LiquorProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return { products, isLoading };
}
