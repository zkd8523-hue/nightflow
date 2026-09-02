"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Home, Disc3, Map, Heart, MessageCircle } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useNotifications";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";
import { useOfferChats } from "@/hooks/useOfferChats";
import { usePartyChats } from "@/hooks/usePartyChats";
import { useDmThreads } from "@/hooks/useDmThreads";
import { UnreadBadge, unreadCountOf } from "@/components/chat/UnreadBadge";
import { WagleIcon } from "@/components/icons/WagleIcon";
import { useChatComposerStore } from "@/stores/useChatComposerStore";

export function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  // 와글 채팅 입력 중이면 네비 숨김 (채팅 공간 확보 + 키보드 겹침 완화)
  const composerFocused = useChatComposerStore((s) => s.focused);
  // notifications 는 아래 "/profile 진입 시 오퍼 읽음 처리"에 쓴다.
  // Hooks 규칙상 early return보다 위에서 호출. 비로그인 시 빈 배열 반환됨.
  const { notifications, markAsRead } = useNotifications(user?.id);
  const offerChatOn = useOfferChatFlag();
  // 채팅 점 = 실제 노출되는 것과 일치: 깃발(비모집) 1:1 오퍼 + 조각 단체방.
  // 조각 1:1 오퍼 채팅은 단체방으로 통합돼 목록에서 빠졌으므로 점 계산에서도 제외.
  const { chats: offerChats, reload: reloadOffers } = useOfferChats(user?.id);
  const { rooms: partyRooms, reload: reloadParty } = usePartyChats(user?.id);
  const { threads: dmThreads, reload: reloadDm } = useDmThreads(user?.id);
  // 화면 이동 시마다 채팅 안읽음 재조회 (realtime 누락 대비 → 뱃지 stale 방지)
  useEffect(() => {
    reloadOffers();
    reloadParty();
    reloadDm();
  }, [pathname, reloadOffers, reloadParty, reloadDm]);
  // /profile 진입 시 미확인 오퍼 알림을 읽음 처리 → 헤더 메뉴의 "Offer" 배지 제거.
  // BottomNav 는 전 페이지에 렌더되므로 어느 경로로 들어가든 동작한다.
  useEffect(() => {
    if (pathname !== "/profile") return;
    notifications
      .filter((n) => !n.is_read && n.type === "puzzle_offer_received")
      .forEach((n) => markAsRead(n.id));
  }, [pathname, notifications, markAsRead]);
  // 종료된 대화는 읽을 수 없으므로 점 계산에서 제외
  const isClosed = (s: string) => s === "expired" || s === "rejected" || s === "withdrawn";
  const isClosedPuzzle = (s: string) => s === "expired" || s === "cancelled";
  // 카톡식 숫자 뱃지 — 깃발 1:1 + 조각 단체방 + DM 안읽음 합계
  const unreadChatCount =
    offerChats.reduce(
      (sum, c) =>
        sum + (!c.is_recruiting_party && !isClosed(c.offer_status) ? unreadCountOf(c) : 0),
      0
    ) +
    partyRooms.reduce(
      (sum, r) => sum + (isClosedPuzzle(r.puzzle_status) ? 0 : unreadCountOf(r)),
      0
    ) +
    dmThreads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0);

  // 최초 인증 상태 확인 중에는 깜빡임 방지를 위해 숨김.
  // 비로그인 사용자에게도 탭바를 노출해 기능(와글/주변/찜 등)을 발견할 수 있게 함.
  // 인증이 필요한 탭(찜/내 정보)은 탭 시 미들웨어가 /login으로 유도 → 자연스러운 가입 전환점.
  if (isLoading) return null;
  // 채팅 입력 포커스 중엔 네비 숨김
  if (composerFocused) return null;

  // 찜 자리를 메시지로 대체 (플래그 OFF면 찜 유지).
  // ⚠️ useOfferChatFlag는 3-state다 — undefined(확정 전) / true / false.
  //    undefined를 falsy로 흘리면 "찜"이 먼저 그려졌다가 조회 완료 후 "메시지"로
  //    바뀌어 깜빡인다. 확정 전에는 자리만 잡아두고 아무것도 그리지 않는다
  //    (탭을 빼버리면 나머지 4개가 재배치돼 더 크게 흔들린다).
  const tabs = [
    { label: "홈", icon: Home, href: "/" },
    { label: "클럽지도", icon: Map, href: "/clubs" },
    // MY(/profile) → LINE UP 으로 교체 (사용자 결정, 2026-09-02).
    // 라인업이 앱의 주 콘텐츠인데 탭바에서 빠져 있어 홈 상단 토글로만 닿았다.
    // 대신 /profile 은 햄버거 메뉴 "내 정보"로 옮겨 진입 경로를 남긴다 —
    // 내 파티 목록과 제재 정보(/my-penalties)가 거기에만 있어서 그냥 빼면
    // 접근 불가가 된다.
    { label: "LINE UP", icon: Disc3, href: "/lineups" },
    { label: "OPEN", icon: WagleIcon, href: "/chat" },
    offerChatOn === undefined
      ? null
      : offerChatOn
        ? { label: "메시지", icon: MessageCircle, href: "/messages" }
        : { label: "찜", icon: Heart, href: "/favorites" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
      {/* 홈만 데스크톱에서 본문(lg:max-w-4xl)과 폭을 맞춘다 — 안 맞추면 콘텐츠는 중앙인데
          탭만 화면 전체로 퍼져 정렬이 어긋나 보인다. 다른 페이지는 본문이 아직 max-w-lg. */}
      <div className={`max-w-lg ${pathname === "/" ? "lg:max-w-4xl" : ""} mx-auto flex items-center justify-around pb-[env(safe-area-inset-bottom)]`}>
        {tabs.map((tab, i) => {
          // 플래그 확정 전 슬롯 — 자리만 차지하고 비워둔다 (레이아웃 고정)
          if (!tab) return <div key={`pending-${i}`} className="flex-1" aria-hidden />;
          const { label, icon: Icon, href } = tab;
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          // 와글 활성 시 보라 시그니처 (MUSIC 가치), 나머지는 흰색
          const activeClass = "text-foreground";
          // "메시지"=안읽은 메시지 개수 뱃지.
          // 새 오퍼("Offer") 뱃지는 MY 탭이 LINE UP 으로 바뀌면서 헤더 메뉴의
          // "내 정보" 항목으로 옮겼다 (Header.tsx).
          const chatBadgeCount = href === "/messages" ? unreadChatCount : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                isActive ? activeClass : "text-muted-foreground"
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {chatBadgeCount > 0 && (
                  <UnreadBadge
                    count={chatBadgeCount}
                    className="absolute -top-2 -right-3 ring-2 ring-background"
                  />
                )}
              </span>
              <span className={`font-bold ${label === "OPEN" ? "text-[11px]" : "text-[10px]"} whitespace-nowrap`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
