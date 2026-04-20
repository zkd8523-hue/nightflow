"use client";

import { useState } from "react";
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
} from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface UserManagementProps {
  users: User[];
  bidStats: Record<string, unknown>[];
}

export function UserManagement({ users }: UserManagementProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

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
      (statusFilter === "md" && u.role === "md");

    return matchesSearch && matchesStatus;
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
            <SelectItem value="normal">정상</SelectItem>
            <SelectItem value="warning">경고 대상</SelectItem>
            <SelectItem value="suspended">정지 중</SelectItem>
            <SelectItem value="blocked">차단됨</SelectItem>
            <SelectItem value="md">MD만</SelectItem>
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
                          <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                            {user.profile_image ? (
                              <img src={user.profile_image} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-neutral-500 uppercase">{user.name?.substring(0, 1)}</span>
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
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
