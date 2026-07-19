"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Home, User, Map, Heart, MessageCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useNotifications";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";
import { useOfferChats } from "@/hooks/useOfferChats";
import { usePartyChats } from "@/hooks/usePartyChats";
import { WagleIcon } from "@/components/icons/WagleIcon";

export function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  // 내 깃발에 들어온 새 오퍼(미확인)가 있으면 "내 정보" 탭에 점 표시.
  // Hooks 규칙상 early return보다 위에서 호출. 비로그인 시 빈 배열 반환됨.
  const { notifications, markAsRead } = useNotifications(user?.id);
  const offerChatOn = useOfferChatFlag();
  // 채팅 점 = 실제 노출되는 것과 일치: 깃발(비모집) 1:1 오퍼 + 조각 단체방.
  // 조각 1:1 오퍼 채팅은 단체방으로 통합돼 목록에서 빠졌으므로 점 계산에서도 제외.
  const { chats: offerChats, reload: reloadOffers } = useOfferChats(user?.id);
  const { rooms: partyRooms, reload: reloadParty } = usePartyChats(user?.id);
  // 화면 이동 시마다 채팅 안읽음 재조회 (realtime 누락 대비 → 점 stale 방지)
  useEffect(() => {
    reloadOffers();
    reloadParty();
  }, [pathname, reloadOffers, reloadParty]);
  // MY(/profile) 진입 시 미확인 오퍼 알림을 읽음 처리 → "Offer" 배지 제거
  useEffect(() => {
    if (pathname !== "/profile") return;
    notifications
      .filter((n) => !n.is_read && n.type === "puzzle_offer_received")
      .forEach((n) => markAsRead(n.id));
  }, [pathname, notifications, markAsRead]);
  // 종료된 대화는 읽을 수 없으므로 점 계산에서 제외
  const isClosed = (s: string) => s === "expired" || s === "rejected" || s === "withdrawn";
  const isClosedPuzzle = (s: string) => s === "expired" || s === "cancelled";
  const hasUnreadChat =
    offerChats.some((c) => !c.is_recruiting_party && !isClosed(c.offer_status) && c.unread) ||
    partyRooms.some((r) => r.unread && !isClosedPuzzle(r.puzzle_status));
  const hasNewOffer = notifications.some(
    (n) => !n.is_read && n.type === "puzzle_offer_received"
  );

  // 최초 인증 상태 확인 중에는 깜빡임 방지를 위해 숨김.
  // 비로그인 사용자에게도 탭바를 노출해 기능(와글/주변/찜 등)을 발견할 수 있게 함.
  // 인증이 필요한 탭(찜/내 정보)은 탭 시 미들웨어가 /login으로 유도 → 자연스러운 가입 전환점.
  if (isLoading) return null;

  // 찜 자리를 채팅으로 대체 (플래그 OFF면 찜 유지)
  const tabs = [
    { label: "홈", icon: Home, href: "/" },
    { label: "주변", icon: Map, href: "/clubs" },
    { label: "Live", icon: WagleIcon, href: "/chat" },
    offerChatOn
      ? { label: "채팅", icon: MessageCircle, href: "/messages" }
      : { label: "찜", icon: Heart, href: "/favorites" },
    { label: "MY", icon: User, href: "/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-sm border-t border-neutral-800">
      <div className="max-w-lg mx-auto flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ label, icon: Icon, href }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          // 와글 활성 시 보라 시그니처 (MUSIC 가치), 나머지는 흰색
          const activeClass = "text-white";
          // "내 정보"=새 오퍼는 NEW 뱃지, "채팅"=안읽은 대화는 점 표시
          const showNewOfferBadge = href === "/profile" && hasNewOffer;
          const showUnreadDot = href === "/messages" && hasUnreadChat;
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
                {showNewOfferBadge && (
                  <span className="pointer-events-none absolute -top-2.5 -right-5 -rotate-12 px-2 py-0.5 text-[9px] font-black leading-none tracking-widest text-white bg-gradient-to-br from-red-500 to-rose-600 rounded-full shadow-lg shadow-rose-900/50">
                    Offer
                  </span>
                )}
                {showUnreadDot && (
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
