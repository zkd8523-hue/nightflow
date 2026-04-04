"use client";

import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ChevronRight,
  Gavel,
  Trophy,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function ProfilePage() {
  const { user, isLoading, refetch } = useCurrentUser();
  const router = useRouter();
  const supabase = createClient();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityStats, setActivityStats] = useState<{
    total_bids: number;
    won_bids: number;
    win_rate: number;
    confirmed_visits: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_trust_scores")
      .select("total_bids, won_bids, win_rate, confirmed_visits")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setActivityStats(data);
      });
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  const handleEdit = () => {
    setName(user.name || "");
    setPhone(user.phone || "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("이름을 입력해주세요");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ name: name.trim(), phone: phone.trim() })
      .eq("id", user.id);

    if (error) {
      toast.error("저장에 실패했습니다");
    } else {
      toast.success("프로필이 수정되었습니다");
      setIsEditing(false);
      refetch();
    }
    setSaving(false);
  };

  const isBanned = user.banned_until && new Date(user.banned_until) > new Date();
  const isBlocked = user.is_blocked;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">내 프로필</h1>
        </div>

        {/* 제재 상태 배너 */}
        {(isBlocked || isBanned) && (
          <div className={`rounded-2xl p-4 mb-4 ${isBlocked ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`w-4 h-4 ${isBlocked ? "text-red-400" : "text-amber-400"}`} />
              <span className={`text-[13px] font-bold ${isBlocked ? "text-red-400" : "text-amber-400"}`}>
                {isBlocked ? "계정이 영구 정지되었습니다" : "이용이 일시 정지되었습니다"}
              </span>
            </div>
            {isBanned && !isBlocked && (
              <p className="text-[12px] text-neutral-400 ml-6">
                정지 해제: {dayjs(user.banned_until).format("YYYY년 M월 D일 HH:mm")}
              </p>
            )}
          </div>
        )}

        {/* 프로필 정보 카드 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-white">기본 정보</h2>
            {!isEditing ? (
              <button
                onClick={handleEdit}
                className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
              >
                수정
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-neutral-500">이름</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white mt-1 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <p className="text-[14px] text-white font-bold">{user.name || "미설정"}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-neutral-500">전화번호</p>
                {isEditing ? (
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white mt-1 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <p className="text-[14px] text-white font-bold">{user.phone || "미설정"}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-neutral-500 shrink-0" />
              <div>
                <p className="text-[11px] text-neutral-500">가입일</p>
                <p className="text-[14px] text-white font-bold">
                  {dayjs(user.created_at).format("YYYY년 M월 D일")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 나의 경매 활동 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <h2 className="text-[15px] font-bold text-white mb-4">나의 경매 활동</h2>

          {activityStats && activityStats.total_bids > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-neutral-800/50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Gavel className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-[11px] text-neutral-400">총 입찰</span>
                </div>
                <p className="text-xl font-black text-white">{activityStats.total_bids}<span className="text-[11px] text-neutral-500 font-normal">회</span></p>
              </div>

              <div className="bg-neutral-800/50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Trophy className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-[11px] text-neutral-400">낙찰 성공</span>
                </div>
                <p className="text-xl font-black text-green-400">{activityStats.won_bids}<span className="text-[11px] text-neutral-500 font-normal">회</span></p>
              </div>

              <div className="bg-neutral-800/50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-[11px] text-neutral-400">방문 완료</span>
                </div>
                <p className="text-xl font-black text-green-400">{activityStats.confirmed_visits}<span className="text-[11px] text-neutral-500 font-normal">회</span></p>
              </div>

              <div className="bg-neutral-800/50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px] text-neutral-400">낙찰률</span>
                </div>
                <p className="text-xl font-black text-amber-400">{activityStats.win_rate || 0}<span className="text-[11px] text-neutral-500 font-normal">%</span></p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[13px] text-neutral-500 mb-3">아직 경매에 참여한 기록이 없습니다</p>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
              >
                진행 중인 경매 보기
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* 제재 정보: 경고 또는 스트라이크 > 0일 때만 표시 */}
          {((user.warning_count || 0) > 0 || (user.strike_count || 0) > 0) && (
            <div className="flex items-center gap-2 mt-3 p-2.5 bg-neutral-800/50 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[12px] text-neutral-400">
                경고 <span className="text-amber-400 font-bold">{user.warning_count || 0}</span>/3
                {(user.strike_count || 0) > 0 && (
                  <span className="ml-2">
                    스트라이크 <span className="text-red-400 font-bold">{user.strike_count}</span>
                  </span>
                )}
              </p>
            </div>
          )}

          {isBanned && !isBlocked && (
            <div className="flex items-center gap-2 mt-2 p-2.5 bg-amber-500/5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-400">
                정지 해제: {dayjs(user.banned_until).format("YYYY.MM.DD HH:mm")}
              </p>
            </div>
          )}
        </div>

        {/* 바로가기 */}
        <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
          <Link
            href="/faq"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">자주 묻는 질문</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/contact"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">고객 문의</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/terms"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">이용약관</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors"
          >
            <span className="text-[14px] text-neutral-300">개인정보처리방침</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
        </div>

        {/* 탈퇴 */}
        <Link
          href="/profile/delete"
          className="block text-center text-[12px] text-neutral-600 mt-6 hover:text-red-400 transition-colors"
        >
          회원탈퇴
        </Link>
      </div>
    </div>
  );
}
