"use client";

import { useState, useMemo } from "react";
import { MDManagement } from "@/components/admin/MDManagement";
import { Card } from "@/components/ui/card";
import { Users, UserPlus, ShieldAlert, ChevronLeft, AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { computeHealthStatus } from "@/lib/utils/mdHealth";
import type { User, Club, MDHealthScore } from "@/types/database";

interface UserWithClub extends User {
    default_club: Club | null;
    owned_clubs?: Club[];
}

interface AdminMDPageClientProps {
    initialUsers: UserWithClub[];
    healthScores?: MDHealthScore[];
}

export function AdminMDPageClient({ initialUsers, healthScores }: AdminMDPageClientProps) {
    const [users, setUsers] = useState<UserWithClub[]>(initialUsers);

    // 실시간으로 count 계산
    const pendingCount = useMemo(() =>
        users.filter(u => u.md_status === "pending").length,
        [users]
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

                {/* Content Section */}
                <MDManagement
                    initialUsers={users}
                    healthScores={healthScores}
                    users={users}
                    setUsers={setUsers}
                />
            </div>
        </div>
    );
}
