"use client";

import { useEffect, useState } from "react";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import {
  LANG_OPTIONS,
  detectDeviceLang,
  readAppLang,
  writeAppLang,
  suppressAutoLangRedirect,
  type Lang,
} from "@/lib/i18n";

// 앱 첫 실행 언어 선택 게이트 (네이티브 앱 전용).
//
// 배경: 기존엔 Accept-Language 추측으로 /en 등에 보내놓고 그 결과를 저장하지 않았다.
// 미들웨어가 심는 nf_lang_redirected 쿠키는 6시간짜리 "이번엔 튕기지 마라" 신호라,
// 외국인이 뒤로가기 한 번으로 루트에 돌아오면 그 뒤 6시간 내내 한국어 홈에 갇혔다.
// 앱 WebView는 브라우저와 달리 껐다 켜도 쿠키가 살아있어 체감상 영구에 가깝다.
// (UTM 링크로 들어오면 애초에 리다이렉트 자체가 스킵돼 첫 화면부터 한국어였다.)
//
// 그래서 추측 대신 한 번 물어보고 localStorage에 영구 저장한다.
//
// 원칙:
//   - 앱에서만 동작. 웹은 완전 no-op → 기존 미들웨어·SEO 경로 무변경.
//   - 한국어 기기는 묻지 않는다. 주 시장(설치의 99%)에 마찰을 더하지 않기 위함.
//   - 한 번 고르면 재실행 때 다시 묻지 않고 저장된 언어로 바로 보낸다.
//
// 웹에서는 절대 안 뜨므로 ?forcelang=1 로 강제 노출해 로컬 확인할 수 있다.

const FORCE_PARAM = "forcelang";

export function AppLangGate() {
  const { isNative, resolved } = useIsNativeApp();
  // "안 띄움"을 기본값으로 두고 확정 후에만 연다 — resolved 전에 그리면
  // 웹에서도 한 프레임 깜빡여 SEO 페이지에 노이즈가 된다.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!resolved) return;

    const forced =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get(FORCE_PARAM) === "1";

    if (!isNative && !forced) return;

    // 이미 고른 적 있으면 그 언어로 바로. 자동 리다이렉트가 덮어쓰지 못하게 억제도 같이.
    const saved = readAppLang();
    if (saved && !forced) {
      suppressAutoLangRedirect();
      const target = LANG_OPTIONS.find((o) => o.lang === saved);
      if (target && !isOnLangPath(target.href)) {
        window.location.replace(target.href);
      }
      return;
    }

    // 한국어 기기는 묻지 않는다.
    if (detectDeviceLang() === "ko" && !forced) return;

    setShow(true);
  }, [isNative, resolved]);

  if (!show) return null;

  const pick = (lang: Lang, href: string) => {
    writeAppLang(lang);
    // 미들웨어 302와 LangAutoRedirect가 선택을 되돌리지 못하게 둘 다 억제.
    suppressAutoLangRedirect();
    setShow(false);
    window.location.replace(href);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your language"
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0A0A",
        zIndex: 99998,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        color: "#fff",
        // NetworkOverlay와 같은 이유로 인라인 스타일 — 첫 실행 시점이라
        // Tailwind·웹폰트가 아직 안 붙었어도 반드시 읽혀야 한다.
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 20 }}>🌏</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
        Choose your language
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "#888",
          lineHeight: 1.6,
          marginBottom: 28,
          textAlign: "center",
        }}
      >
        언어를 선택해주세요
      </p>

      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}>
        {LANG_OPTIONS.map((o) => (
          <button
            key={o.lang}
            type="button"
            onClick={() => pick(o.lang, o.href)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              background: "#1C1C1E",
              border: "1px solid #2C2C2E",
              borderRadius: 14,
              padding: "14px 18px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
              {o.flag}
            </span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 저장된 언어의 홈에 이미 있는지 (있으면 이동시키지 않는다 — 무한 replace 방지).
// "/" 는 다른 모든 경로의 접두사라 startsWith 로는 판정할 수 없어 따로 처리한다.
function isOnLangPath(href: string): boolean {
  const path = window.location.pathname;
  if (href === "/") {
    // 한국어 = 외국어 프리픽스가 하나도 없는 경로 전부.
    return !LANG_OPTIONS.some(
      (o) => o.href !== "/" && (path === o.href || path.startsWith(`${o.href}/`))
    );
  }
  return path === href || path.startsWith(`${href}/`);
}
