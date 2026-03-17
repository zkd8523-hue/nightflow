import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-sm text-neutral-400">
          <Link href="/" className="text-base font-bold text-white">
            NightFlow
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/contact"
              className="hover:text-white transition-colors"
            >
              문의
            </Link>
          </nav>
          <Link
            href="/md/apply"
            className="text-sm text-neutral-400 hover:text-amber-400 transition-colors"
          >
            MD 파트너 모집
          </Link>
          <p className="text-neutral-500">
            &copy; {new Date().getFullYear()} NightFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
