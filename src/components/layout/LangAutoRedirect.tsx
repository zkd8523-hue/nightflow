"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 기기(OS) 언어 자동 감지 → 외국어 기기만 해당 언어 경로로 유도 (국제 앱 표준).
// 루트("/")에서만 동작. 앱은 항상 nightflow.kr(루트)로 진입하므로 여기서 분기.
//
// 핵심 원칙 (주 시장=한국 보호):
//   - 한국어 기기 → 루트에서 절대 외국어로 튕기지 않음. 저장된 외국어 선호가 있어도 무시.
//     (예전엔 nf_lang_pref 최우선이라, 외국어 페이지 한 번 본 한국 유저가 도메인 입력 시 계속 외국어로 하이재킹됐음)
//   - 외국어 기기(en/ja/zh) → /en · /ja · /zh (네이티브 메타데이터·JSON-LD·SEO 심긴 경로 라우트)로.
//   - 세션당 1회만 리다이렉트 — 유저가 수동으로 한국어 홈에 돌아오면 그 세션 동안 존중(무한 튕김 방지).

const SESSION_KEY = "nf_lang_redirected";

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

    const lang = detectDeviceLang();
    // 한국어 기기는 무조건 한국어 홈 유지 (외국어 pref가 있어도 하이재킹 금지)
    if (lang === "ko") return;

    // 외국어 기기 — 세션당 1회만. 리다이렉트 후 유저가 한국어 홈으로 돌아오면 다시 안 튕김.
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* noop */
    }

    router.replace(lang === "en" ? "/en" : `/${lang}`);
  }, [pathname, router]);

  return null;
}
