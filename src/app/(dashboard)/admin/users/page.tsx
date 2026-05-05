import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserManagement } from "@/components/admin/UserManagement";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Users, ShieldBan, AlertTriangle, Clock, UserPlus } from "lucide-react";
import dayjs from "dayjs";

interface PageProps {
  searchParams: Promise<{ focus?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const { focus } = await searchParams;
  const supabase = await createClient();

  // 1. 관리자 권한 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") {
    redirect("/");
  }

  // 2. 유저 목록 조회 (admin 제외)
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  // 통계 집계
  const totalUsers = users?.length || 0;
  const blockedUsers = users?.filter(u => u.is_blocked).length || 0;
  // Model B: strike_count > 0, 레거시 노쇼도 포함
  const problemUsers = users?.filter(u =>
    (u.strike_count || 0) > 0 ||
    u.noshow_count > 0
  ).length || 0;
  const strikeUsers = users?.filter(u => (u.strike_count || 0) > 0).length || 0;
  const suspendedUsers = users?.filter(u =>
    !u.is_blocked && u.blocked_until && dayjs(u.blocked_until).isAfter(dayjs())
  ).length || 0;
  const newUsers24h = users?.filter(u =>
    dayjs(u.created_at).isAfter(dayjs().subtract(1, "day"))
  ).length || 0;
  const newUsers7d = users?.filter(u =>
    dayjs(u.created_at).isAfter(dayjs().subtract(7, "day"))
  ).length || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors">
                <ChevronLeft className="w-5 h-5 text-neutral-400" />
              </Link>
              <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
                <Users className="w-3.5 h-3.5" />
                User Operations
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter">유저 관리</h1>
            <p className="text-neutral-500 font-medium">전체 유저 조회, 차단 및 패널티 관리</p>
          </div>

          <div className="flex gap-4">
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-neutral-500">
                <Users className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">전체 유저</span>
              </div>
              <p className="text-2xl font-black text-white">{totalUsers}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px] shadow-[0_0_20px_rgba(34,197,94,0.1)]">
              <div className="flex items-center gap-2 text-green-500">
                <UserPlus className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">신규 (24h)</span>
              </div>
              <p className="text-2xl font-black text-white">{newUsers24h}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-emerald-500">
                <UserPlus className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">신규 (7d)</span>
              </div>
              <p className="text-2xl font-black text-white">{newUsers7d}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px] shadow-[0_0_20px_rgba(239,68,68,0.1)]">
              <div className="flex items-center gap-2 text-red-500">
                <ShieldBan className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">차단됨</span>
              </div>
              <p className="text-2xl font-black text-white">{blockedUsers}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">경고 대상</span>
              </div>
              <p className="text-2xl font-black text-white">{problemUsers}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-orange-500">
                <Clock className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">정지 중</span>
              </div>
              <p className="text-2xl font-black text-white">{suspendedUsers}</p>
            </Card>
            <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-tight">스트라이크</span>
              </div>
              <p className="text-2xl font-black text-white">{strikeUsers}</p>
            </Card>
          </div>
        </header>

        {/* Content */}
        <UserManagement users={users || []} bidStats={[]} focusId={focus} />
      </div>
    </div>
  );
}
