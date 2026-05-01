"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
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
  HelpCircle,
  MessageCircle,
  Heart,
  TrendingUp,
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
      return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
    case "md_rejected":
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    case "outbid":
      return <Gavel className="w-4 h-4 text-amber-500 shrink-0" />;
    case "auction_won":
      return <Trophy className="w-4 h-4 text-green-500 shrink-0" />;
    case "fallback_won":
      return <Trophy className="w-4 h-4 text-amber-500 shrink-0" />;
    case "contact_deadline_warning":
      return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
    case "noshow_penalty":
      return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
    case "contact_expired_no_fault":
      return <Clock className="w-4 h-4 text-blue-500 shrink-0" />;
    case "contact_expired_user_attempted":
      return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
    case "cancellation_confirmed":
      return <XCircle className="w-4 h-4 text-neutral-400 shrink-0" />;
    case "md_winner_cancelled":
      return <XCircle className="w-4 h-4 text-amber-500 shrink-0" />;
    case "md_winner_noshow":
      return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    case "md_new_bid":
      return <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />;
    default:
      return <Bell className="w-4 h-4 text-neutral-500 shrink-0" />;
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

export function Header({ hideDashboardLink }: { hideDashboardLink?: boolean } = {}) {
  const { user, isLoading } = useCurrentUser();
  const resetAuth = useAuthStore((s) => s.reset);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
  } = useNotifications(user?.id);
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [pendingMDCount, setPendingMDCount] = useState(0);

  useEffect(() => {
    if (user?.role !== "admin") return;
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("md_status", "pending")
      .then(({ count }) => setPendingMDCount(count || 0));
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
      router.push("/login");
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

  return (
    <header className="border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto max-w-lg px-4 h-[68px] flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Link href="/" className="text-lg font-black tracking-tighter text-white leading-none">
            NightFlow
          </Link>
          <p className="text-[11px] text-neutral-400 font-medium tracking-tight">
            같은 돈으로 더 크게 놀자
          </p>
        </div>

        {isLoading ? (
          <Link href="/login" className="w-9 h-9 bg-neutral-800 animate-pulse rounded-lg" aria-label="로딩 중 - 클릭하면 로그인 페이지" />
        ) : user ? (
          <>
            <div className="flex items-center gap-1">
              {!hideDashboardLink && ((user.role === "md" && user.md_status === "approved") || user.role === "admin") && (
                <Link
                  href="/md/dashboard"
                  className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
                  aria-label="대시보드"
                >
                  <LayoutDashboard className="w-[18px] h-[18px] text-blue-400" />
                </Link>
              )}
              {((user.role === "md" && user.md_status === "approved") || user.role === "admin") && (
                <Link
                  href="/md/auctions/new"
                  className="h-9 px-3.5 flex items-center gap-1 rounded-full bg-white hover:bg-neutral-200 transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-black" />
                  <span className="text-[12px] font-black text-black">경매 등록</span>
                </Link>
              )}
              {user.md_status === "pending" && (
                <Link
                  href="/md/apply"
                  className="h-9 px-3.5 flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[12px] font-bold text-amber-400">승인 대기 중</span>
                </Link>
              )}
              <button
                onClick={() => setMenuOpen(true)}
                className="relative w-11 h-11 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
                aria-label="메뉴 열기"
              >
                <Menu className="w-5 h-5 text-neutral-300" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </div>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetContent
                side="right"
                className="w-[280px] bg-[#0A0A0A] border-neutral-800 p-0 flex flex-col h-full"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <SheetHeader className="p-6 pb-2 border-b border-neutral-800/50 shrink-0">
                  <div className="text-left">
                    <SheetTitle
                      className="text-white font-black cursor-pointer hover:text-neutral-300 transition-colors"
                      onClick={() => { setMenuOpen(false); router.push("/profile"); }}
                    >
                      {user.display_name || user.name || "사용자"}
                    </SheetTitle>
                    <p className="text-[12px] text-neutral-500">
                      {user.role === "md" ? "MD 파트너" : user.role === "admin" ? "관리자" : "일반 회원"}
                    </p>
                  </div>
                </SheetHeader>

                {/* 스크롤 가능한 영역 */}
                <div className="flex-1 overflow-y-auto overscroll-none">
                  {/* 알림 섹션 */}
                  <div className="p-4 border-b border-neutral-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-neutral-400" />
                        <span className="text-[13px] font-bold text-neutral-300">알림</span>
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
                            className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
                          >
                            모두 읽음
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
                      <p className="text-[12px] text-neutral-600 py-3 text-center">
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
                                  : "bg-neutral-800/30 hover:bg-neutral-800/50"
                              }`}
                            >
                              <div className="mt-0.5">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0 pr-6">
                                <p className="text-[12px] font-bold text-neutral-200 truncate">
                                  {notification.title}
                                </p>
                                <p className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5">
                                  {notification.message}
                                </p>
                                <p className="text-[10px] text-neutral-600 mt-1">
                                  {timeAgo(notification.created_at)}
                                </p>
                              </div>
                              {!notification.is_read && (
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                              )}
                            </button>
                            <button
                              onClick={(e) => handleDeleteNotification(e, notification.id)}
                              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-neutral-900/80 hover:bg-red-500/20 transition-colors"
                              aria-label="알림 삭제"
                            >
                              <X className="w-3.5 h-3.5 text-neutral-400 hover:text-red-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <nav className="flex flex-col p-4 gap-1 pb-8">
                    <Link
                      href="/bids"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <Gavel className="w-5 h-5 text-neutral-500" />
                      <span className="text-[15px] font-bold">내 활동</span>
                    </Link>

                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <User className="w-5 h-5 text-neutral-500" />
                      <span className="text-[15px] font-bold">프로필</span>
                    </Link>

                    <Link
                      href="/favorites"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <Heart className="w-5 h-5 text-red-500" />
                      <span className="text-[15px] font-bold">찜 목록</span>
                    </Link>

                    {user.role === "admin" && (
                      <>
                        <Link
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                        >
                          <ShieldCheck className="w-5 h-5 text-green-500" />
                          <span className="text-[15px] font-bold">Admin</span>
                        </Link>
                        <Link
                          href="/admin/mds"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                        >
                          <User className="w-5 h-5 text-amber-500" />
                          <span className="text-[15px] font-bold">MD 승인</span>
                          {pendingMDCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {pendingMDCount}
                            </span>
                          )}
                        </Link>
                      </>
                    )}

                    <div className="h-px bg-neutral-800/50 my-2" />

                    {((user.role === "md" && user.md_status === "approved") || user.role === "admin") && (
                      <Link
                        href="/md/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                      >
                        <LayoutDashboard className="w-5 h-5 text-blue-500" />
                        <span className="text-[15px] font-bold">MD 대시보드</span>
                      </Link>
                    )}

                    <Link
                      href="/faq"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <HelpCircle className="w-5 h-5 text-neutral-500" />
                      <span className="text-[15px] font-bold">도움말</span>
                    </Link>

                    <Link
                      href="/contact"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <MessageCircle className="w-5 h-5 text-neutral-500" />
                      <span className="text-[15px] font-bold">고객 문의</span>
                    </Link>

                    <Link
                      href="/settings/notifications"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                    >
                      <Bell className="w-5 h-5 text-neutral-500" />
                      <span className="text-[15px] font-bold">알림 설정</span>
                    </Link>

                    <div className="h-px bg-neutral-800/50 my-2" />

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-500 hover:bg-neutral-800/50 hover:text-red-400 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="text-[15px] font-bold">로그아웃</span>
                    </button>
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <Link href="/login">
            <Button size="sm" className="h-9 rounded-lg bg-white text-black font-bold hover:bg-neutral-200">
              로그인
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
