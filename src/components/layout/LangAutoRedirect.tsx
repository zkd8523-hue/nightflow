"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 기기(OS) 언어 자동 감지 → 해당 언어 진입 (국제 앱 표준).
// 루트("/")에서만 동작. 앱은 항상 nightflow.kr(루트)로 진입하므로 여기서 분기.
//   ko → 머무름(한국어) / en → /en / ja → /en?lang=ja / zh → /en?lang=zh
// 저장된 선호(nf_lang_pref)가 있으면 그걸 우선 — 드롭다운 수동 변경 존중 + 매 실행 일관.

const PREF_KEY = "nf_lang_pref";

function detectDeviceLang(): "ko" | "en" | "ja" | "zh" {
  const l = (navigator.language || "en").toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("zh")) return "zh";
  return "en"; // 그 외 전부 영어
}

export function LangAutoRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // 루트에서만. 다른 한국어 페이지(/clubs 등)는 건드리지 않음.
    if (pathname !== "/") return;

    let pref: string | null = null;
    try { pref = localStorage.getItem(PREF_KEY); } catch { /* noop */ }

    // 저장된 선호 없으면 기기 언어로 1회 결정 후 저장
    if (!pref) {
      pref = detectDeviceLang();
      try { localStorage.setItem(PREF_KEY, pref); } catch { /* noop */ }
    }

    if (pref === "ja") router.replace("/en?lang=ja");
    else if (pref === "zh") router.replace("/en?lang=zh");
    else if (pref === "en") router.replace("/en");
    // ko → 한국어 홈 그대로
  }, [pathname, router]);

  return null;
}
