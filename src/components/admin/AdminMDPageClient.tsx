"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MDManagement } from "@/components/admin/MDManagement";
import { DjClaimManagement } from "@/components/admin/DjClaimManagement";
import { Card } from "@/components/ui/card";
import { Users, UserPlus, ShieldAlert, ChevronLeft, AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { computeHealthStatus } from "@/lib/utils/mdHealth";
import type { User, Club, MDHealthScore, DjClaim } from "@/types/database";

interface UserWithClub extends User {
    default_club: Club | null;
    owned_clubs?: Club[];
}

interface AdminMDPageClientProps {
    initialUsers: UserWithClub[];
    healthScores?: MDHealthScore[];
    initialDjClaims?: DjClaim[];
}

export function AdminMDPageClient({ initialUsers, healthScores, initialDjClaims }: AdminMDPageClientProps) {
    const [users, setUsers] = useState<UserWithClub[]>(initialUsers);
    const [djClaims, setDjClaims] = useState<DjClaim[]>(initialDjClaims ?? []);

    const router = useRouter();
    const searchParams = useSearchParams();
    // 탭 상태는 URL 쿼리로 — 승인/거절 처리 후 새로고침해도 보던 탭이 유지돼야 한다.
    const tab = searchParams.get("tab") === "dj" ? "dj" : "md";
    const setTab = useCallback((next: "md" | "dj") => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === "dj") params.set("tab", "dj");
        else params.delete("tab");
        const qs = params.toString();
        router.replace(qs ? `/admin/mds?${qs}` : "/admin/mds", { scroll: false });
    }, [router, searchParams]);

    // 실시간으로 count 계산
    const pendingCount = useMemo(() =>
        users.filter(u => u.md_status === "pending").length,
        [users]
    );
    const djPendingCount = useMemo(() =>
        djClaims.filter(c => c.status === "pending").length,
        [djClaims]
    );

    const approvedCount = useMemo(() =>
        users.filter(u => u.md_status === "approved").length,
        [users]
    );

    // 알림 수 계산
    const alertCount = useMemo(() =>
        healthScores?.filter(md => {
            const status = computeHealthStatus(md);
            return status === "critical" || status === "attention";
        }).length || 0,
        [healthScores]
    );

    // 평균 낙찰률
    const avgWinRate = useMemo(() =>
        healthScores && healthScores.length > 0
            ? Math.round(healthScores.reduce((sum, md) => sum + md.sell_through_rate, 0) / healthScores.length)
            : 0,
        [healthScores]
    );

    return (
        <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
            <div className="max-w-5xl mx-auto px-6 space-y-10">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <Link href="/" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors">
                                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                            </Link>
                            <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Admin Operations
                            </div>
                        </div>
                        <h1 className="text-4xl font-black tracking-tighter">파트너 관리</h1>
                        <p className="text-muted-foreground font-medium">파트너 심사 및 운영 품질 모니터링</p>
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[100px]">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-tight">파트너</span>
                            </div>
                            <p className="text-2xl font-black text-foreground">{approvedCount}</p>
                        </Card>
                        <Card className={`bg-card border-border p-4 flex flex-col gap-1 min-w-[100px] ${pendingCount > 0 ? "shadow-[0_0_20px_rgba(234,179,8,0.1)]" : ""}`}>
                            <div className="flex items-center gap-2 text-brand-amber">
                                <UserPlus className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-tight">심사 대기</span>
                            </div>
                            <p className="text-2xl font-black text-foreground">{pendingCount}</p>
                        </Card>
                        <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[100px]">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-tight">평균 낙찰률</span>
                            </div>
                            <p className="text-2xl font-black text-foreground">{avgWinRate}%</p>
                        </Card>
                        {alertCount > 0 && (
                            <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[100px] ring-2 ring-amber-500/20">
                                <div className="flex items-center gap-2 text-brand-amber">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">알림</span>
                                </div>
                                <p className="text-2xl font-black text-brand-amber">{alertCount}건</p>
                            </Card>
                        )}
                    </div>
                </header>

                {/* 탭 — 신청 검토는 성격이 같은 운영자 업무라 한 화면에서 처리한다.
                    상단 통계 카드는 MD 기준 그대로 둔다(DJ 건수는 여기 탭 라벨에만 표시). */}
                <div className="flex gap-1 border-b border-border">
                    <button
                        onClick={() => setTab("md")}
                        className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                            tab === "md" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/70"
                        }`}
                    >
                        관리자 신청{pendingCount > 0 ? ` (${pendingCount})` : ""}
                    </button>
                    <button
                        onClick={() => setTab("dj")}
                        className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                            tab === "dj" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/70"
                        }`}
                    >
                        DJ 인증{djPendingCount > 0 ? ` (${djPendingCount})` : ""}
                    </button>
                </div>

                {/* Content Section */}
                {tab === "md" ? (
                    <MDManagement
                        initialUsers={users}
                        healthScores={healthScores}
                        users={users}
                        setUsers={setUsers}
                    />
                ) : (
                    <DjClaimManagement claims={djClaims} setClaims={setDjClaims} />
                )}
            </div>
        </div>
    );
}
