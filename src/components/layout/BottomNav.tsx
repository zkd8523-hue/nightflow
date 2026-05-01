"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gavel, Heart, User } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const TABS = [
  { label: "홈", icon: Home, href: "/" },
  { label: "내 활동", icon: Gavel, href: "/bids" },
  { label: "찜", icon: Heart, href: "/favorites" },
  { label: "프로필", icon: User, href: "/profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();

  // 비로그인 사용자에게는 하단 탭바 미노출 (홈 콘텐츠에 집중)
  if (isLoading || !user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-sm border-t border-neutral-800">
      <div className="max-w-lg mx-auto flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ label, icon: Icon, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-4 transition-colors ${
                isActive ? "text-white" : "text-neutral-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
