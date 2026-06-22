"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, User, Map, Heart } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useNotifications";
import { WagleIcon } from "@/components/icons/WagleIcon";

const TABS = [
  { label: "홈", icon: Home, href: "/" },
  { label: "주변", icon: Map, href: "/clubs" },
  { label: "와글", icon: WagleIcon, href: "/chat" },
  { label: "찜", icon: Heart, href: "/favorites" },
  { label: "내 정보", icon: User, href: "/profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  // 내 깃발에 들어온 새 오퍼(미확인)가 있으면 "내 정보" 탭에 점 표시.
  // Hooks 규칙상 early return보다 위에서 호출. 비로그인 시 빈 배열 반환됨.
  const { notifications } = useNotifications(user?.id);
  const hasNewOffer = notifications.some(
    (n) => !n.is_read && n.type === "puzzle_offer_received"
  );

  // 최초 인증 상태 확인 중에는 깜빡임 방지를 위해 숨김.
  // 비로그인 사용자에게도 탭바를 노출해 기능(와글/주변/찜 등)을 발견할 수 있게 함.
  // 인증이 필요한 탭(찜/내 정보)은 탭 시 미들웨어가 /login으로 유도 → 자연스러운 가입 전환점.
  if (isLoading) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-sm border-t border-neutral-800">
      <div className="max-w-lg mx-auto flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ label, icon: Icon, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          // 와글 활성 시 보라 시그니처 (MUSIC 가치), 나머지는 흰색
          const activeClass = href === "/chat" ? "text-[#C084FC]" : "text-white";
          // "내 정보" 탭에 새 오퍼 미확인 점 표시
          const showOfferDot = href === "/profile" && hasNewOffer;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                isActive ? activeClass : "text-neutral-500"
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {showOfferDot && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-neutral-950" />
                )}
              </span>
              <span className="text-[10px] font-bold">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
