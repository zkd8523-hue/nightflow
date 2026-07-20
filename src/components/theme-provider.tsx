"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * 테마 전환 배선.
 *
 * - attribute="class"  → <html> 에 .dark / .light 클래스를 붙임.
 *                        globals.css 의 @custom-variant dark (&:is(.dark *)) 와 짝.
 * - enableSystem=false → "시스템 설정 따름" 없이 밝음/어두움 2단만.
 * - defaultTheme="dark"→ 기존 사용자는 전원 어두움 유지 (localStorage 값 없을 때).
 *
 * next-themes 가 paint 전에 실행되는 인라인 스크립트를 심어주므로
 * 새로고침 시 흰 화면이 번쩍이는 현상(FOUC)은 발생하지 않음.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      themes={["light", "dark"]}
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
