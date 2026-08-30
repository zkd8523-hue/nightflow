"use client";

import Link from "next/link";
import Image from "next/image";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { BusinessInfo } from "@/components/layout/BusinessInfo";
import { LangSwitcher } from "@/components/layout/LangSwitcher";
import { useAppDownloadCta, PLAY_STORE_URL } from "@/hooks/useAppDownloadCta";
import { trackAppDownloadClick } from "@/lib/analytics/events";

export function Footer() {
  const { user, isLoading } = useCurrentUser();
  const isPartner = isLoading || user?.role === "md" || user?.role === "admin";
  const { eligible: showAppCta } = useAppDownloadCta();

  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto px-4 pt-5 pb-8">
        <div className="flex flex-col items-center gap-3.5 text-sm text-muted-foreground">
          <LangSwitcher />
          {/* Google 발견용 — 크롤러가 볼 수 있는 언어 링크 (LangSwitcher는 open 상태에서만 링크 노출).
              hreflang을 명시해 국가별 SERP에서 올바른 URL이 매칭되도록 함.
              바로 위 LangSwitcher와 기능이 겹쳐 화면에서는 sr-only로 숨기되,
              DOM에는 남겨 크롤러의 언어 버전 발견 경로를 유지한다. */}
          <nav aria-label="Language versions" className="sr-only">
            <a
              href="/"
              hrefLang="ko-KR">
              <span aria-hidden="true">🇰🇷</span>
              <span>한국어</span>
            </a>
            <a
              href="/en"
              hrefLang="en-US">
              <span aria-hidden="true">🇺🇸</span>
              <span>English</span>
            </a>
            <a
              href="/ja"
              hrefLang="ja-JP">
              <span aria-hidden="true">🇯🇵</span>
              <span>日本語</span>
            </a>
            <a
              href="/zh"
              hrefLang="zh-CN">
              <span aria-hidden="true">🇨🇳</span>
              <span>简体中文</span>
            </a>
            <a
              href="/zh-tw"
              hrefLang="zh-TW">
              <span aria-hidden="true">🇹🇼</span>
              <span>繁體中文</span>
            </a>
          </nav>
          <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/refund-policy" className="hover:text-foreground transition-colors">
              환불정책
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              고객문의
            </Link>
          </nav>
          {!isPartner && (
            <Link
              href="/md/apply"
              className="inline-block rounded-full border border-amber-500 px-5 py-2 text-sm font-semibold text-brand-amber hover:bg-amber-500 hover:text-black transition-colors"
            >
              파트너 모집 →
            </Link>
          )}
          {showAppCta && (
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackAppDownloadClick("footer", {
                  user_role: user?.role ?? "guest",
                })
              }
              className="inline-flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-1.5 hover:bg-muted/60 transition-colors"
            >
              <Image
                src="/app-icon.png"
                alt="나플"
                width={44}
                height={44}
                className="rounded-lg"
              />
              <span className="text-sm font-bold text-foreground">
                앱으로 더 편하게 이용하기
              </span>
            </a>
          )}
          <Link
            href="https://www.instagram.com/nightflow.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-pink-400 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            @nightflow.kr · 문의
          </Link>
          <BusinessInfo collapsible />
          <p className="text-muted-foreground text-xs text-center leading-relaxed">
            &copy; {new Date().getFullYear()} 나플 | 나이트플로우 · 밤을 더 아름답게
          </p>
        </div>
      </div>
    </footer>
  );
}
