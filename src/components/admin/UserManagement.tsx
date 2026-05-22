"use client";

import { useState, useEffect } from "react";
import { User } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  Search,
  ShieldBan,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Flag,
  Gavel,
  Star,
  Trophy,
  Users as UsersIcon,
  Trash2,
} from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { createClient } from "@/lib/supabase/client";
import { normalizeProfileImage } from "@/lib/utils/image";

interface UserActivityStats {
  // 깃발 (Puzzles) - 작성자 기준
  puzzlesCreated: number;        // 깃발 꽂은 수
  puzzlesAccepted: number;       // 선택(성사)된 수
  puzzlesCancelled: number;      // 본인이 내린 수
  puzzlesExpired: number;        // 만료된 수
  // 깃발 (Puzzles) - 참여자 기준
  puzzleJoinedCount: number;     // 참여한 깃발 수
  puzzleNoshowCount: number;     // 참여 후 노쇼 수
  // 얼리버드 (Auctions)
  bidsTotal: number;             // 총 입찰 수
  bidsWon: number;               // 낙찰 수
  auctionsConfirmed: number;     // 방문 확정 수
}

interface UserManagementProps {
  users: User[];
  bidStats: Record<string, unknown>[];
  focusId?: string;
}

export function UserManagement({ users, focusId }: UserManagementProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    if (!focusId) return;
    const target = users.find((u) => u.id === focusId);
    if (target) setSelectedUser(target);
  }, [focusId, users]);

  useEffect(() => {
    if (!selectedUser) {
      setStats(null);
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    setStatsLoading(true);
    setStats(null);

    (async () => {
      const userId = selectedUser.id;
      const countOpts = { count: "exact" as const, head: true };

      const [
        puzzlesCreatedRes,
        puzzlesAcceptedRes,
        puzzlesCancelledRes,
        puzzlesExpiredRes,
        puzzleJoinedRes,
        puzzleNoshowRes,
        bidsTotalRes,
        bidsWonRes,
        auctionsConfirmedRes,
      ] = await Promise.all([
        supabase.from("puzzles").select("id", countOpts).eq("leader_id", userId),
        supabase.from("puzzles").select("id", countOpts).eq("leader_id", userId).eq("status", "accepted"),
        supabase.from("puzzles").select("id", countOpts).eq("leader_id", userId).eq("status", "cancelled"),
        supabase.from("puzzles").select("id", countOpts).eq("leader_id", userId).eq("status", "expired"),
        supabase.from("puzzle_members").select("id", countOpts).eq("user_id", userId),
        supabase.from("puzzle_members").select("id", countOpts).eq("user_id", userId).eq("noshow", true),
        supabase.from("bids").select("id", countOpts).eq("bidder_id", userId),
        supabase.from("bids").select("id", countOpts).eq("bidder_id", userId).eq("status", "won"),
        supabase.from("auctions").select("id", countOpts).eq("winner_id", userId).eq("status", "confirmed"),
      ]);

      if (cancelled) return;

      setStats({
        puzzlesCreated: puzzlesCreatedRes.count ?? 0,
        puzzlesAccepted: puzzlesAcceptedRes.count ?? 0,
        puzzlesCancelled: puzzlesCancelledRes.count ?? 0,
        puzzlesExpired: puzzlesExpiredRes.count ?? 0,
        puzzleJoinedCount: puzzleJoinedRes.count ?? 0,
        puzzleNoshowCount: puzzleNoshowRes.count ?? 0,
        bidsTotal: bidsTotalRes.count ?? 0,
        bidsWon: bidsWonRes.count ?? 0,
        auctionsConfirmed: auctionsConfirmedRes.count ?? 0,
      });
      setStatsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  const handleBlock = async (userId: string, block: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, block }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(block ? "유저를 차단했습니다" : "차단을 해제했습니다");
      window.location.reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'UserManagement.handleBlock');
      toast.error(msg || "처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`유저를 영구 삭제했습니다 (${data.deleted_display_name ?? userId})`);
      setDeleteConfirm(null);
      setDeleteConfirmText("");
      setSelectedUser(null);
      window.location.reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, "UserManagement.handleDelete");
      toast.error(msg || "삭제 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPenalty = async (userId: string, type: "noshow" | "strike") => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/reset-penalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const messages: Record<string, string> = {
        strike: "스트라이크를 초기화했습니다",
        noshow: "노쇼 카운트를 초기화했습니다 (레거시)",
      };

      toast.success(messages[type] || "패널티를 초기화했습니다");
      window.location.reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'UserManagement.handleResetPenalty');
      toast.error(msg || "처리 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.includes(searchQuery) ||
      u.kakao_id?.includes(searchQuery);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "blocked" && u.is_blocked) ||
      (statusFilter === "suspended" && isUserSuspended(u)) ||
      (statusFilter === "normal" && !u.is_blocked && !isUserSuspended(u) &&
        (u.strike_count || 0) === 0 && u.noshow_count === 0) ||
      (statusFilter === "warning" && !u.is_blocked && !isUserSuspended(u) &&
        ((u.strike_count || 0) > 0 || u.noshow_count > 0)) ||
      (statusFilter === "md" && u.role === "md") ||
      (statusFilter === "new_24h" && dayjs(u.created_at).isAfter(dayjs().subtract(1, "day"))) ||
      (statusFilter === "new_7d" && dayjs(u.created_at).isAfter(dayjs().subtract(7, "day")));

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const diff = dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf();
    return sortOrder === "newest" ? diff : -diff;
  });

  const isUserSuspended = (user: User) =>
    !user.is_blocked && user.blocked_until && dayjs(user.blocked_until).isAfter(dayjs());

  const getStatusBadge = (user: User) => {
    if (user.is_blocked) {
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-xs px-2 py-1 border font-bold">
          <ShieldBan className="w-3 h-3 mr-1" />
          차단됨
        </Badge>
      );
    }

    if (isUserSuspended(user)) {
      return (
        <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs px-2 py-1 border font-bold">
          <AlertTriangle className="w-3 h-3 mr-1" />
          정지 중
        </Badge>
      );
    }

    // Model B: strike_count >= 1 = 빨간색 "스트라이크"
    if ((user.strike_count || 0) >= 1) {
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-xs px-2 py-1 border font-bold">
          <AlertTriangle className="w-3 h-3 mr-1" />
          스트라이크
        </Badge>
      );
    }

    // 노쇼 카운트만 있는 경우 (레거시)
    if (user.noshow_count > 0) {
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs px-2 py-1 border font-bold">
          <AlertTriangle className="w-3 h-3 mr-1" />
          노쇼 (레거시)
        </Badge>
      );
    }

    return (
      <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs px-2 py-1 border font-bold">
        <CheckCircle className="w-3 h-3 mr-1" />
        정상
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <Input
            placeholder="이름, 전화번호, 카카오ID 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[#1C1C1E] border-neutral-800 text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-[#1C1C1E] border-neutral-800 text-white">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="new_24h">신규 (24시간)</SelectItem>
            <SelectItem value="new_7d">신규 (7일)</SelectItem>
            <SelectItem value="normal">정상</SelectItem>
            <SelectItem value="warning">경고 대상</SelectItem>
            <SelectItem value="suspended">정지 중</SelectItem>
            <SelectItem value="blocked">차단됨</SelectItem>
            <SelectItem value="md">MD만</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
          <SelectTrigger className="w-[140px] bg-[#1C1C1E] border-neutral-800 text-white">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="oldest">오래된순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 유저 목록 */}
      <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="text-left p-4 text-sm font-bold text-neutral-400">이름</th>
                <th className="text-left p-4 text-sm font-bold text-neutral-400">연락처</th>
                <th className="text-center p-4 text-sm font-bold text-neutral-400">상태</th>
                <th className="text-center p-4 text-sm font-bold text-neutral-400">스트라이크</th>
                <th className="text-center p-4 text-sm font-bold text-neutral-400">레거시</th>
                <th className="text-left p-4 text-sm font-bold text-neutral-400">가입일</th>
                <th className="text-center p-4 text-sm font-bold text-neutral-400">액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-neutral-500">
                    유저가 없습니다
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="relative w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-neutral-500 uppercase">{user.name?.substring(0, 1)}</span>
                            {user.profile_image && (
                              <img
                                src={normalizeProfileImage(user.profile_image)!}
                                alt={user.name || "프로필"}
                                className="relative w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white flex items-center gap-1.5">
                              {user.display_name || user.name}
                              {user.role === "md" && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">MD</span>
                              )}
                            </p>
                            <p className="text-[10px] text-neutral-500 font-mono">{user.kakao_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-neutral-400">{user.phone || "-"}</p>
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(user)}
                      </td>
                      {/* Model B 스트라이크 (주요) */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-lg font-black ${(user.strike_count || 0) > 0 ? "text-red-500" : "text-neutral-600"}`}>
                            {user.strike_count || 0}S
                          </span>
                          {(user.strike_count || 0) > 0 && (
                            <span className="text-[9px] text-red-400 font-medium uppercase">Active</span>
                          )}
                        </div>
                      </td>
                      {/* 레거시 노쇼 */}
                      <td className="p-4 text-center">
                        <div className="text-xs text-neutral-500">
                          <span className={`font-bold ${user.noshow_count > 0 ? "text-amber-500" : ""}`}>
                            {user.noshow_count}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-xs text-neutral-400">
                          {dayjs(user.created_at).format("YYYY-MM-DD")}
                        </p>
                        {isUserSuspended(user) && (
                          <p className="text-[10px] text-orange-500 mt-0.5">
                            정지 해제: {dayjs(user.blocked_until).format("MM-DD HH:mm")}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {user.is_blocked ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBlock(user.id, false);
                              }}
                              disabled={loading}
                              className="text-xs bg-transparent border-green-500/30 text-green-500 hover:bg-green-500/10"
                            >
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              차단 해제
                            </Button>
                          ) : (
                            <>
                              {isUserSuspended(user) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetPenalty(user.id, "strike");
                                  }}
                                  disabled={loading}
                                  className="text-xs bg-transparent border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  정지 해제
                                </Button>
                              )}
                              {!isUserSuspended(user) && (user.strike_count || 0) > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetPenalty(user.id, "strike");
                                  }}
                                  disabled={loading}
                                  className="text-xs bg-transparent border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  초기화
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBlock(user.id, true);
                                }}
                                disabled={loading}
                                className="text-xs bg-transparent border-red-500/30 text-red-500 hover:bg-red-500/10"
                              >
                                <ShieldBan className="w-3 h-3 mr-1" />
                                차단
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(user);
                              setDeleteConfirmText("");
                            }}
                            disabled={loading}
                            className="text-xs bg-transparent border-red-700/40 text-red-400 hover:bg-red-700/20"
                            title="유저 영구 삭제 (auth + DB 완전 제거)"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 유저 상세 Sheet */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent side="right" className="bg-[#1C1C1E] border-neutral-800 w-[500px] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">유저 상세</SheetTitle>
            <SheetDescription className="text-neutral-400">
              {selectedUser?.name}님의 활동 내역 및 관리
            </SheetDescription>
          </SheetHeader>
          {selectedUser && (
            <div className="space-y-6 mt-6">
              {/* 기본 정보 */}
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
                <h3 className="text-sm font-black text-white uppercase tracking-tight">기본 정보</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">이름</span>
                    <span className="font-bold text-white">{selectedUser.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">전화번호</span>
                    <span className="font-bold text-white">{selectedUser.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 text-sm">가입일</span>
                    <span className="text-white text-sm">
                      {dayjs(selectedUser.created_at).format("YYYY-MM-DD HH:mm")}
                    </span>
                  </div>
                </div>
              </div>

              {/* 패널티 정보 */}
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-4 border border-neutral-800/50">
                <h3 className="text-sm font-black text-white uppercase tracking-tight">패널티 현황</h3>

                {/* Model B 스트라이크 (주요 섹션) */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-bold">스트라이크 (Model B 활성)</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        누진 제재: 1회=3일 정지, 2회=14일 정지, 3회=60일 정지, 4회=영구 차단
                      </p>
                    </div>
                    <span className="font-black text-3xl text-red-500">{selectedUser.strike_count || 0}S</span>
                  </div>

                  {(selectedUser.strike_count || 0) > 0 && selectedUser.last_strike_at && (
                    <div className="flex items-center justify-between pt-2 border-t border-red-500/10">
                      <span className="text-xs text-neutral-500">마지막 스트라이크</span>
                      <span className="text-xs text-red-400 font-mono">
                        {dayjs(selectedUser.last_strike_at).format("YYYY-MM-DD HH:mm")}
                      </span>
                    </div>
                  )}

                  {(selectedUser.strike_count || 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResetPenalty(selectedUser.id, "strike")}
                      disabled={loading}
                      className="w-full text-xs bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 mt-2"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      스트라이크 초기화
                    </Button>
                  )}
                </div>

                {/* 레거시 노쇼 (조건부 표시) */}
                {selectedUser.noshow_count > 0 && (
                  <div className="bg-neutral-800/30 border border-neutral-700/30 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-neutral-500 text-xs font-bold uppercase tracking-tight">레거시 노쇼</p>
                        <p className="text-xs text-neutral-600 mt-0.5">Model A 시절 기록 (참고용)</p>
                      </div>
                      <span className="font-black text-2xl text-amber-500">{selectedUser.noshow_count}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResetPenalty(selectedUser.id, "noshow")}
                      disabled={loading}
                      className="w-full text-xs bg-transparent border-neutral-700 text-neutral-400 hover:bg-neutral-800 mt-2"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      노쇼 카운트 초기화
                    </Button>
                  </div>
                )}

                {/* 경고 카운트 (3경고 = 1스트라이크) */}
                {(selectedUser.warning_count || 0) > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-bold">경고 누적</p>
                        <p className="text-xs text-neutral-500 mt-0.5">3경고 = 1스트라이크 자동 전환</p>
                      </div>
                      <span className="font-black text-2xl text-amber-500">{selectedUser.warning_count}/3</span>
                    </div>
                  </div>
                )}

                {/* 차단/정지 상태 경고 */}
                {(selectedUser.is_blocked || isUserSuspended(selectedUser)) && (
                  <div className={`${selectedUser.is_blocked ? "bg-red-500/10 border-red-500/20" : "bg-orange-500/10 border-orange-500/20"} border rounded-xl p-3 space-y-2`}>
                    <p className={`text-sm font-bold ${selectedUser.is_blocked ? "text-red-400" : "text-orange-400"}`}>
                      {selectedUser.is_blocked ? "영구 차단됨" : "이용 정지 중"}
                    </p>
                    {isUserSuspended(selectedUser) && (
                      <>
                        <p className="text-xs text-neutral-400">
                          정지 해제 예정: {dayjs(selectedUser.blocked_until).format("YYYY-MM-DD HH:mm")}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResetPenalty(selectedUser.id, "strike")}
                          disabled={loading}
                          className="w-full text-xs bg-transparent border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          즉시 정지 해제 (스트라이크 초기화)
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 활동 통계 — 건전성 판단 */}
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-4 border border-neutral-800/50">
                <h3 className="text-sm font-black text-white uppercase tracking-tight">활동 내역</h3>

                {statsLoading || !stats ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* 깃발 (Puzzles) */}
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Flag className="w-4 h-4 text-purple-400" />
                        <p className="text-sm font-black text-purple-300">깃발</p>
                      </div>

                      {/* 작성자 활동 */}
                      <div>
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-2">작성자 (방장)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-neutral-500">꽂은 수</p>
                            <p className="text-lg font-black text-white">{stats.puzzlesCreated}</p>
                          </div>
                          <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-neutral-500">선택 (성사)</p>
                            <p className="text-lg font-black text-green-400">
                              {stats.puzzlesAccepted}
                              {stats.puzzlesCreated > 0 && (
                                <span className="text-[10px] text-neutral-500 font-medium ml-1">
                                  ({Math.round((stats.puzzlesAccepted / stats.puzzlesCreated) * 100)}%)
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-neutral-500">스스로 내림</p>
                            <p className="text-lg font-black text-amber-400">{stats.puzzlesCancelled}</p>
                          </div>
                          <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                            <p className="text-[10px] text-neutral-500">만료</p>
                            <p className="text-lg font-black text-neutral-400">{stats.puzzlesExpired}</p>
                          </div>
                        </div>
                      </div>

                      {/* 참여자 활동 */}
                      {stats.puzzleJoinedCount > 0 && (
                        <div>
                          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-2">참여자 (파티원)</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                              <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                                <UsersIcon className="w-3 h-3" /> 참여
                              </p>
                              <p className="text-lg font-black text-white">{stats.puzzleJoinedCount}</p>
                            </div>
                            <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                              <p className="text-[10px] text-neutral-500">노쇼</p>
                              <p className={`text-lg font-black ${stats.puzzleNoshowCount > 0 ? "text-red-400" : "text-neutral-400"}`}>
                                {stats.puzzleNoshowCount}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* MD 후기 (placeholder) */}
                      <div className="border-t border-purple-500/10 pt-2 flex items-center gap-2 text-xs text-neutral-500">
                        <Star className="w-3.5 h-3.5" />
                        <span>MD 후기: <span className="text-neutral-600">추후 개발 예정</span></span>
                      </div>
                    </div>

                    {/* 얼리버드 (Auctions) */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Gavel className="w-4 h-4 text-amber-400" />
                        <p className="text-sm font-black text-amber-300">얼리버드 (경매)</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-neutral-500">입찰</p>
                          <p className="text-lg font-black text-white">{stats.bidsTotal}</p>
                        </div>
                        <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-neutral-500">낙찰</p>
                          <p className="text-lg font-black text-green-400">
                            {stats.bidsWon}
                            {stats.bidsTotal > 0 && (
                              <span className="text-[10px] text-neutral-500 font-medium ml-1">
                                ({Math.round((stats.bidsWon / stats.bidsTotal) * 100)}%)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="bg-neutral-900/60 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> 방문
                          </p>
                          <p className="text-lg font-black text-emerald-400">{stats.auctionsConfirmed}</p>
                        </div>
                      </div>

                      {/* MD 후기 (placeholder) */}
                      <div className="border-t border-amber-500/10 pt-2 flex items-center gap-2 text-xs text-neutral-500">
                        <Star className="w-3.5 h-3.5" />
                        <span>MD 후기: <span className="text-neutral-600">추후 개발 예정</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="grid grid-cols-2 gap-3">
                {selectedUser.is_blocked ? (
                  <Button
                    onClick={() => handleBlock(selectedUser.id, false)}
                    disabled={loading}
                    className="h-12 rounded-2xl font-black bg-green-500 hover:bg-green-400 text-white col-span-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "차단 해제"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleBlock(selectedUser.id, true)}
                    disabled={loading}
                    className="h-12 rounded-2xl font-black bg-red-500 hover:bg-red-400 text-white col-span-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "유저 차단"}
                  </Button>
                )}
                <Button
                  onClick={() => { setDeleteConfirm(selectedUser); setDeleteConfirmText(""); }}
                  disabled={loading}
                  className="h-12 rounded-2xl font-black bg-neutral-900 hover:bg-red-950 text-red-400 hover:text-red-300 border border-red-500/30 col-span-2"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> 유저 영구 삭제
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 영구 삭제 확인 다이얼로그 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { if (!loading) { setDeleteConfirm(null); setDeleteConfirmText(""); } }}
        >
          <div
            className="bg-[#1C1C1E] border border-red-500/30 rounded-3xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-black">유저 영구 삭제</h3>
            </div>
            <div className="space-y-2 text-sm text-neutral-300">
              <p>
                <span className="font-black text-white">{deleteConfirm.display_name || deleteConfirm.name || deleteConfirm.id.slice(0, 8)}</span>
                {" "}유저를 영구 삭제합니다.
              </p>
              <p className="text-red-400 text-xs leading-relaxed">
                ⚠️ 30일 grace period 없이 즉시 삭제됩니다. 본인 명의 클럽·경매·입찰·거래·정산·VIP·찜 등 모든 데이터가 같이 삭제되며 복구할 수 없습니다.
              </p>
              {deleteConfirm.role === "md" && (
                <p className="text-amber-400 text-xs">
                  이 유저는 MD입니다. MD 명의 클럽과 경매 내역도 모두 삭제됩니다.
                </p>
              )}
            </div>
            <label className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-red-500/40 transition-colors">
              <input
                type="checkbox"
                checked={deleteConfirmText === "yes"}
                onChange={(e) => setDeleteConfirmText(e.target.checked ? "yes" : "")}
                className="mt-0.5 w-4 h-4 rounded accent-red-500"
                autoFocus
              />
              <span className="text-[13px] text-neutral-300 leading-relaxed">
                위 내용을 모두 확인했으며, <span className="font-black text-white">복구할 수 없음</span>을 이해합니다.
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                onClick={() => { setDeleteConfirm(null); setDeleteConfirmText(""); }}
                disabled={loading}
                className="flex-1 h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold"
              >
                취소
              </Button>
              <Button
                onClick={() => handleDelete(deleteConfirm.id)}
                disabled={loading || deleteConfirmText !== "yes"}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black disabled:opacity-30"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "영구 삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
