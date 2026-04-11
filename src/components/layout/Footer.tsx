"use client";

import Link from "next/link";
import { useAuthStore } from "@/stores/useAuthStore";

export function Footer() {
  const { user } = useAuthStore();
  const isPartner = user?.role === "md" || user?.role === "admin";

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-neutral-400">
          <Link href="/" className="text-base font-bold text-white">
            NightFlow
          </Link>
          <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
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
            href="http://pf.kakao.com/_ilSqX"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-neutral-500 hover:text-yellow-400 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.611 1.564 4.904 3.938 6.32-.173.618-.628 2.24-.72 2.587-.112.422.155.416.327.303.134-.09 2.124-1.44 2.982-2.026.476.066.963.1 1.473.1 5.523 0 10-3.477 10-7.784C22 6.477 17.523 3 12 3z" />
            </svg>
            카카오톡 채널
          </Link>
          <div className="text-center text-xs text-neutral-600 leading-relaxed space-y-1">
            <p>
              상호: 매드다윗 · 대표: 김민기 · 사업자등록번호: 842-06-03382
            </p>
            <p>
              주소: 부산광역시 연제구 쌍미천로129번길 21 · 이메일: maddawids@gmail.com
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
