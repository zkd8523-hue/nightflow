"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotifications } from "@/hooks/useNotifications";
import { CreditChargedDialog } from "@/components/md/CreditChargedDialog";
import { useSupportUnread } from "@/hooks/useSupportUnread";
import { useDjClaimStatus } from "@/hooks/useDjClaimStatus";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  Menu,
  Gavel,
  Trophy,
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  Bell,
  CheckCircle2,
  XCircle,
  X,
  Trash2,
  Plus,
  Clock,
  AlertTriangle,
  User,
  TrendingUp,
  Star,
  ChevronLeft,
  ChevronRight,
  Headset,
  Globe,
} from "lucide-react";
import type { InAppNotification } from "@/types/database";

function getFallbackUrl(type: InAppNotification["type"]): string | null {
  if (type.startsWith("puzzle_")) return "/";
  if (type.startsWith("md_")) return "/md/dashboard";
  if (
    type.startsWith("auction_") ||
    type === "outbid" ||
    type === "fallback_won" ||
    type === "contact_deadline_warning" ||
    type === "contact_expired_no_fault" ||
    type === "contact_expired_user_attempted" ||
    type === "cancellation_confirmed"
  ) return "/notifications";
  return null;
}

function getNotificationIcon(type: InAppNotification["type"]) {
  switch (type) {
    case "md_approved":
      return <CheckCircle2 className="w-4 h-4 text-money shrink-0" />;
    case "md_rejected":
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    case "outbid":
      return <Gavel className="w-4 h-4 text-brand-amber shrink-0" />;
    case "auction_won":
      return <Trophy className="w-4 h-4 text-money shrink-0" />;
    case "fallback_won":
      return <Trophy className="w-4 h-4 text-brand-amber shrink-0" />;
    case "contact_deadline_warning":
      return <Clock className="w-4 h-4 text-brand-amber shrink-0" />;
    case "noshow_penalty":
      return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
    case "contact_expired_no_fault":
      return <Clock className="w-4 h-4 text-blue-500 shrink-0" />;
    case "contact_expired_user_attempted":
      return <Clock className="w-4 h-4 text-brand-amber shrink-0" />;
    case "cancellation_confirmed":
      return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
    case "md_winner_cancelled":
      return <XCircle className="w-4 h-4 text-brand-amber shrink-0" />;
    case "md_winner_noshow":
      return <AlertTriangle className="w-4 h-4 text-brand-amber shrink-0" />;
    case "md_new_bid":
      return <TrendingUp className="w-4 h-4 text-money shrink-0" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

interface HeaderProps {
  hideDashboardLink?: boolean;
  /** compact 모드: NightFlow 로고 + 부제/CTA(MD대시보드/깃발꽂기)를 숨기고 햄버거만 노출.
   *  좌측에 customTitle/customSubtitle을 대신 표시. (와글 같은 풀스크린 페이지용) */
  compact?: boolean;
  customTitle?: string;
  customSubtitle?: string;
  /** compact 모드에서 타이틀 좌측에 뒤로가기(←) 표시. 지정한 경로로 이동. */
  backHref?: string;
}

export function Header({
  hideDashboardLink,
  compact,
  customTitle,
  customSubtitle,
  backHref,
}: HeaderProps = {}) {
  const { user, isLoading } = useCurrentUser();
  // role==='user'일 때만 의미가 있다 — MD·admin은 이미 다른 메뉴 분기가 있다.
  const djClaim = useDjClaimStatus(user?.role === "user" ? user.id : undefined);
  const resetAuth = useAuthStore((s) => s.reset);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
  } = useNotifications(user?.id);
  // 내 깃발에 들어온 새 오퍼 — 하단 탭 MY 가 LINE UP 으로 바뀌면서 이 배지도
  // 메뉴의 "내 정보" 항목으로 옮겨왔다 (BottomNav 와 같은 판정식).
  const hasNewOffer = notifications.some(
    (n) => !n.is_read && n.type === "puzzle_offer_received"
  );
  const supportUnread = useSupportUnread(user?.id);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  // 클럽지도(view=map)에서는 화면을 지도에 양보.
  // SSR 시점엔 window가 없으므로 항상 false → 헤더 렌더.
  // 클라이언트 mount 후 effect에서 실제 view 감지 → 필요 시 헤더 숨김.
  // (hydration mismatch 회피: 초기 상태는 서버와 동일하게)
  const [isOnClubMapView, setIsOnClubMapView] = useState(false);
  useEffect(() => {
    if (pathname !== "/clubs") {
      setIsOnClubMapView(false);
      return;
    }
    setIsOnClubMapView(
      new URLSearchParams(window.location.search).get("view") === "map"
    );
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      if (detail?.view) {
        setIsOnClubMapView(detail.view === "map");
      } else {
        setIsOnClubMapView(
          new URLSearchParams(window.location.search).get("view") === "map"
        );
      }
    };
    window.addEventListener("club-view-change", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("club-view-change", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, [pathname]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [pendingMDCount, setPendingMDCount] = useState(0);
  const [foreignNewCount, setForeignNewCount] = useState(0);

  useEffect(() => {
    if (user?.role !== "admin") return;
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("md_status", "pending")
      .then(({ count }) => setPendingMDCount(count || 0));
    supabase
      .from("foreign_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .then(({ count }) => setForeignNewCount(count || 0));
  }, [user?.role, supabase]);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchEnd - touchStart;
    const isRightSwipe = distance > minSwipeDistance;
    if (isRightSwipe) {
      setMenuOpen(false);
    }
  };

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overscrollBehavior = '';
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    // signOut이 hang해도 3초 내 강제 탈출
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("signOut timeout")), 3000)
        ),
      ]);
    } catch (e) {
      console.error("[Header] signOut 실패/timeout:", e);
    } finally {
      // 서버 세션 정리 실패해도 로컬 state는 무조건 초기화
      resetAuth();
      router.push("/");
      router.refresh();
    }
  };

  const handleNotificationClick = async (notification: InAppNotification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setMenuOpen(false);
    const target = notification.action_url || getFallbackUrl(notification.type);
    if (target) router.push(target);
  };

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notificationId: string
  ) => {
    e.stopPropagation();
    await deleteNotification(notificationId);
  };

  if (isOnClubMapView) return null;

  return (
    <header
      className="border-b border-border bg-background sticky top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <CreditChargedDialog />
      {/* 홈만 데스크톱에서 좌우 확장 (page.tsx의 lg:max-w-4xl과 정렬을 맞춤).
          다른 페이지는 아직 max-w-lg 본문이라 헤더만 넓히면 정렬이 어긋난다. */}
      <div className={`container mx-auto max-w-lg ${pathname === "/" ? "lg:max-w-4xl" : ""} px-4 h-[52px] flex items-center justify-between`}>
        <div className="flex items-center gap-2 min-w-0">
          {compact && backHref && (
            <Link
              href={backHref}
              aria-label="뒤로가기"
              className="w-9 h-9 -ml-2 flex items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
          {compact && customTitle ? (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="shrink-0 text-lg font-black tracking-tighter leading-none bg-gradient-to-r from-[#7C3AED] to-[#DB2777] dark:from-[#A78BFA] dark:to-[#F472B6] bg-clip-text text-transparent">
                {customTitle}
              </span>
              {customSubtitle && (
                <span className="text-[12px] text-muted-foreground font-medium tracking-tight truncate">
                  {customSubtitle}
                </span>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/"
                className="text-lg font-black tracking-tighter text-foreground leading-none flex items-baseline gap-1.5"
                aria-label="나이트플로우 홈 (베타)"
              >
                NightFlow
              </Link>
              <p className="text-[13px] text-muted-foreground font-medium tracking-tight whitespace-nowrap">
                전국 클럽·공연 정보와 혜택을 한손에
              </p>
            </>
          )}
          </div>
        </div>

        {isLoading ? (
          <Link href="/login" className="w-9 h-9 bg-muted animate-pulse rounded-lg" aria-label="로딩 중 - 클릭하면 로그인 페이지" />
        ) : user ? (
          <>
            <div className="flex items-center gap-1">
              {!compact && ((user.role === "md" && user.md_status === "approved") || user.role === "admin") && (
                <Link
                  href="/md/dashboard"
                  className="h-9 px-3.5 flex items-center gap-1 rounded-full bg-inverse hover:opacity-90 transition-colors shadow-sm"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-inverse-foreground" />
                  <span className="text-[12px] font-black text-inverse-foreground whitespace-nowrap">파트너</span>
                </Link>
              )}
              {!compact && user.md_status === "pending" && (
                <Link
                  href="/md/apply"
                  className="h-9 px-3.5 flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5 text-brand-amber" />
                  <span className="text-[12px] font-bold text-brand-amber">승인 대기 중</span>
                </Link>
              )}
              {/* 헤더 "예약하기"(/start) 제거 — 깃발 종료로 /start가 파티 단독이 되면서
                  전역 헤더에 상시 노출할 만큼의 진입점이 아니게 됨. 파티는 홈 섹션에서 진입. */}
              <button
                onClick={() => setMenuOpen(true)}
                className="relative w-11 h-11 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                aria-label="메뉴 열기"
              >
                <Menu className="w-5 h-5 text-foreground/80" />
                {(unreadCount > 0 || supportUnread) && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </div>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetContent
                side="right"
                data-no-pull-refresh="strict"
                className="w-[280px] bg-background border-border p-0 flex flex-col h-full"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <SheetHeader className="p-6 pb-2 border-b border-border/50 shrink-0">
                  <div
                    className="flex items-center gap-3 text-left cursor-pointer"
                    onClick={() => { setMenuOpen(false); router.push(`/u/${user.id}`); }}
                  >
                    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0 ring-1 ring-border">
                      {user.profile_image ? (
                        <Image src={user.profile_image} alt="" fill sizes="48px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-muted-foreground">
                          <User className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-foreground font-black hover:text-foreground/80 transition-colors truncate">
                        {user.display_name || user.name || "사용자"}
                      </SheetTitle>
                      {(user.role === "md" || user.role === "admin") ? (
                        <p className="text-[12px] text-muted-foreground">
                          {user.role === "md" ? "프로필" : "관리자"}
                        </p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground">프로필 보기</p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto shrink-0 mr-4" />
                  </div>
                </SheetHeader>

                {/* 스크롤 가능한 영역 */}
                <div className="flex-1 overflow-y-auto overscroll-none">
                  {/* 알림 섹션 */}
                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[13px] font-bold text-foreground/80">알림</span>
                        {unreadCount > 0 && (
                          <span className="text-[11px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {notifications.length > 0 && unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] text-muted-foreground hover:text-foreground/80 transition-colors"
                          >
                            모두 읽음
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={() => {
                              if (confirm("모든 알림을 삭제하시겠습니까?")) {
                                deleteAllNotifications();
                              }
                            }}
                            className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            모두 지우기
                          </button>
                        )}
                        <Link
                          href="/notifications"
                          onClick={() => setMenuOpen(false)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
                        >
                          전체 보기
                        </Link>
                      </div>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground py-3 text-center">
                        새로운 알림이 없습니다
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className="relative group"
                          >
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors ${
                                notification.is_read
                                  ? "opacity-50 hover:opacity-70"
                                  : "bg-muted/30 hover:bg-muted/50"
                              }`}
                            >
                              <div className="mt-0.5">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0 pr-6">
                                <p className="text-[12px] font-bold text-foreground truncate">
                                  {notification.title}
                                </p>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                  {notification.message}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {timeAgo(notification.created_at)}
                                </p>
                              </div>
                              {!notification.is_read && (
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                              )}
                            </button>
                            <button
                              onClick={(e) => handleDeleteNotification(e, notification.id)}
                              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-card/80 hover:bg-red-500/20 transition-colors"
                              aria-label="알림 삭제"
                            >
                              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <nav className="flex flex-col p-4 gap-1 pb-8">

                    {user.role === "admin" && (
                      <>
                        <Link
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                        >
                          <ShieldCheck className="w-5 h-5 text-money" />
                          <span className="text-[15px] font-bold">Admin</span>
                        </Link>
                        <Link
                          href="/admin/mds"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                        >
                          <User className="w-5 h-5 text-brand-amber" />
                          <span className="text-[15px] font-bold">파트너 승인</span>
                          {pendingMDCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {pendingMDCount}
                            </span>
                          )}
                        </Link>
                        <Link
                          href="/admin/support"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                        >
                          <Headset className="w-5 h-5 text-blue-400" />
                          <span className="text-[15px] font-bold">고객 문의</span>
                        </Link>
                        <Link
                          href="/admin/foreign"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                        >
                          <Globe className="w-5 h-5 text-red-400" />
                          <span className="text-[15px] font-bold">외국인 요청</span>
                          {foreignNewCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {foreignNewCount}
                            </span>
                          )}
                        </Link>
                      </>
                    )}

                    {((user.role === "md" && user.md_status === "approved") || user.role === "admin") && (
                      <Link
                        href="/md/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <span className="text-[15px] font-bold">파트너 대시보드</span>
                      </Link>
                    )}

                    {/* 내 정보(/profile) — 하단 탭 MY 자리를 LINE UP 에 내주고 이리로 옮겼다
                        (2026-09-02). 내 파티 목록과 제재 정보가 이 화면에만 있어서
                        진입 경로가 사라지면 안 된다. 새 오퍼 알림 배지도 함께 이동. */}
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">내 정보</span>
                      {hasNewOffer && (
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black leading-none tracking-widest shadow-md shadow-rose-900/40">
                          Offer
                        </span>
                      )}
                    </Link>

                    <Link
                      href="/my-coupons"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">쿠폰</span>
                    </Link>

                    <Link
                      href="/favorites"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">찜</span>
                    </Link>

                    <Link
                      href="/lineups"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">DJ 라인업</span>
                    </Link>

                    {/* DJ 라인업과 짝 — 같은 수집 파이프라인에서 나오는 두 축이라
                        메뉴에서도 붙여 둔다(라인업=클럽 DJ 타임테이블, 공연=래퍼/가수) */}
                    <Link
                      href="/events"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">공연 정보</span>
                    </Link>

                    {/* DJ 라인업/공연 정보와 같은 DJ 발견 계열 — 데이터를 재미로
                        먼저 만나는 입구라 바로 아래 붙인다 */}
                    <Link
                      href="/dj-cup"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">DJ 이상형 월드컵</span>
                    </Link>

                    <div className="h-px bg-muted/50 my-2" />

                    {/* ── 지원: 필요할 때만 찾는 것들 ── */}
                    <Link
                      href="/faq"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">자주 묻는 질문</span>
                    </Link>

                    <Link
                      href="/contact"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">고객 문의</span>
                      {supportUnread && (
                        <span className="ml-auto w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </Link>

                    <Link
                      href="/suggestions"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">건의게시판</span>
                    </Link>

                    <div className="h-px bg-muted/50 my-2" />

                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <span className="text-[15px] font-bold">설정</span>
                    </Link>

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted/50 hover:text-red-400 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="text-[15px] font-bold">로그아웃</span>
                    </button>
                  </nav>
                </div>

                {/* 화면 최하단 고정: 파트너 신청(MD/DJ 갈림길).
                    둘 중 하나라도 완료(claimedSlug)되면 항목을 아예 숨긴다 —
                    이미 인증된 DJ에게 "또 신청하라"는 화면을 보여줄 이유가 없다. */}
                {user.role === "user" && user.md_status !== "pending" && !djClaim.claimedSlug && (
                  <div className="shrink-0 border-t border-border/50 p-3">
                    <Link
                      href={djClaim.pending ? "/dj/apply" : "/partner/apply"}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      {djClaim.pending ? (
                        <>
                          <Clock className="w-5 h-5 text-brand-amber" />
                          <span className="text-[15px] font-bold">인증 대기 중</span>
                        </>
                      ) : (
                        <>
                          <Star className="w-5 h-5 text-brand-amber" />
                          <span className="text-[15px] font-bold">파트너 신청</span>
                        </>
                      )}
                    </Link>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <Link href="/login" className="relative z-[60]">
              <Button size="sm" className="h-9 rounded-lg bg-inverse text-inverse-foreground font-bold hover:opacity-90">
                로그인
              </Button>
            </Link>
            <button
              onClick={() => setGuestMenuOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
              aria-label="메뉴 열기"
            >
              <Menu className="w-5 h-5 text-foreground/80" />
            </button>

            <Sheet open={guestMenuOpen} onOpenChange={setGuestMenuOpen}>
              <SheetContent
                side="right"
                data-no-pull-refresh="strict"
                className="w-[280px] bg-background border-border p-0 flex flex-col h-full"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
              >
                <SheetHeader className="p-6 pb-2 border-b border-border/50 shrink-0">
                  <SheetTitle className="text-foreground font-black text-left">메뉴</SheetTitle>
                </SheetHeader>

                <nav className="flex flex-col p-4 gap-1">
                  <Link
                    href="/lineups"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">DJ 라인업</span>
                  </Link>

                  {/* 로그인 메뉴와 짝을 맞춘다 — 비로그인도 볼 수 있는 화면인데
                      여기만 빠져 있으면 가입 전 유저는 공연을 발견할 길이 없다 */}
                  <Link
                    href="/events"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">공연 정보</span>
                  </Link>

                  <Link
                    href="/dj-cup"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">DJ 이상형 월드컵</span>
                  </Link>

                  <div className="h-px bg-muted/50 my-2" />

                  <Link
                    href="/faq"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">자주 묻는 질문</span>
                  </Link>

                  <Link
                    href="/contact"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">고객 문의</span>
                  </Link>

                  <Link
                    href="/suggestions"
                    onClick={() => setGuestMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    <span className="text-[15px] font-bold">건의게시판</span>
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </header>
  );
}
