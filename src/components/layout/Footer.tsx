"use client";

import Link from "next/link";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function Footer() {
  const { user, isLoading } = useCurrentUser();
  const isPartner = isLoading || user?.role === "md" || user?.role === "admin";

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-neutral-400">
          <Link href="/" className="text-base font-bold text-white">
            NightFlow
          </Link>
          <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
            <Link href="/about" className="hover:text-white transition-colors">
              About Us
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/contact" className="hover:text-white transition-colors">
              고객문의
            </Link>
          </nav>
          {!isPartner && (
            <Link
              href="/md/apply"
              className="inline-block rounded-full border border-amber-500 px-5 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500 hover:text-black transition-colors"
            >
              MD 파트너 모집 →
            </Link>
          )}
          <Link
            href="https://www.instagram.com/nightflow.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-neutral-500 hover:text-pink-400 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            @nightflow.kr · 문의
          </Link>
          <div className="text-center text-xs text-neutral-600 leading-relaxed space-y-1">
            <p>
              상호: 매드다윗 · 대표: 김민기 · 사업자등록번호: 842-06-03382
            </p>
            <p>
              주소: 부산광역시 연제구 쌍미천로129번길 21 · 이메일: maddawids@gmail.com · 전화번호: 070-7954-7464
            </p>
            <p className="text-neutral-700 mt-2">
              매드다윗은 통신판매중개자로서, 클럽 테이블 예약에 관한 의무와 책임은 MD(판매자)에게 있습니다.
            </p>
          </div>
          <p className="text-neutral-500 text-xs">
            &copy; {new Date().getFullYear()} NightFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
