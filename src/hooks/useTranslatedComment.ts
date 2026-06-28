"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

// 오퍼 comment(한글)를 외국어로 번역. enabled=true(외국인)일 때만 /api/translate 호출.
// lang(en/ja/zh)별로 번역 대상이 갈림. 같은 comment+lang은 sessionStorage 캐시.
// 번역 전/실패 시 null 반환 → 호출부에서 원문(한글) 폴백.
export function useTranslatedComment(
  comment: string | null | undefined,
  enabled: boolean,
  lang: Lang = "en"
): string | null {
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || lang === "ko" || !comment || !comment.trim()) {
      setTranslated(null);
      return;
    }
    const cacheKey = `nf_tr:${lang}:${comment}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setTranslated(cached);
        return;
      }
    } catch {
      /* sessionStorage 불가 환경 무시 */
    }

    let cancelled = false;
    fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: comment, lang }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const t: string | null = d?.translated ?? null;
        if (t) {
          try { sessionStorage.setItem(cacheKey, t); } catch { /* noop */ }
          setTranslated(t);
        }
      })
      .catch(() => { /* 실패 시 원문 폴백 */ });

    return () => { cancelled = true; };
  }, [comment, enabled, lang]);

  return translated;
}
