"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readAppLang, detectDeviceLang, LANG_OPTIONS } from "@/lib/i18n";

// 기기(OS) 언어 자동 감지 → 외국어 기기만 해당 언어 경로로 유도 (국제 앱 표준).
// 루트("/")에서만 동작. 앱은 항상 nightflow.kr(루트)로 진입하므로 여기서 분기.
//
// 핵심 원칙 (주 시장=한국 보호):
//   - 명시적 선택(nf_app_lang)이 있으면 최우선. 앱 언어 게이트·푸터 스위처에서
//     유저가 직접 고른 값만 담기므로 추측보다 신뢰할 수 있다.
//     (구 nf_lang_pref 는 페이지를 '보기만' 해도 쌓여 한국 유저를 하이재킹했다 — 그래서 폐기.)
//   - 선택이 없는 한국어 기기 → 루트에서 절대 외국어로 튕기지 않음.
//   - 선택이 없는 외국어 기기(en/ja/zh/zh-tw) → 해당 경로(네이티브 메타데이터·JSON-LD·SEO 심김)로.
//   - 세션당 1회만 리다이렉트 — 유저가 수동으로 한국어 홈에 돌아오면 그 세션 동안 존중(무한 튕김 방지).

const SESSION_KEY = "nf_lang_redirected";

export function LangAutoRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // 루트에서만. 다른 한국어 페이지(/clubs 등)는 건드리지 않음.
    if (pathname !== "/") return;

    // 앱에서 명시적으로 고른 언어가 있으면 그게 최우선 — 기기 언어 추측보다 강하다.
    // (한국어를 골랐다면 여기서 끝. 아래 기기 감지로 내려가면 안 튕겨야 할 유저를 튕긴다.)
    // 구 nf_lang_pref 하이재킹 문제와는 무관: 이 키는 앱 게이트/스위처에서 유저가
    // 직접 고른 값만 담기고, 한국어 기기는 애초에 게이트를 보지 않는다.
    const saved = readAppLang();
    if (saved) {
      const target = LANG_OPTIONS.find((o) => o.lang === saved);
      if (target && target.href !== "/") router.replace(target.href);
      return;
    }

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

    router.replace(LANG_OPTIONS.find((o) => o.lang === lang)?.href ?? "/en");
  }, [pathname, router]);

  return null;
}
