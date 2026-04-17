"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Star, StarOff, Shield, TrendingUp, Eye, AlertTriangle } from "lucide-react";
import type { UserTrustScore, TrustLevel } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface BidderProfileProps {
    isOpen: boolean;
    onClose: () => void;
    userScore: UserTrustScore | null;
    mdId: string;
    isVip: boolean;
    vipId?: string;
    onVipChange: (userId: string, isVip: boolean, vipId?: string) => void;
}

function TrustBadge({ level }: { level: TrustLevel }) {
    const config: Record<TrustLevel, { label: string; className: string }> = {
        vip: { label: "VIP", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
        normal: { label: "Normal", className: "bg-neutral-800/50 text-neutral-400 border-neutral-700" },
        caution: { label: "Caution", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
        blocked: { label: "Blocked", className: "bg-red-500/10 text-red-500 border-red-500/30" },
    };
    const { label, className } = config[level] || config.normal;

    return (
        <Badge className={`text-[10px] px-2 py-0.5 border font-bold ${className}`}>
            {level === "blocked" && <AlertTriangle className="w-3 h-3 mr-1" />}
            {level === "vip" && <Star className="w-3 h-3 mr-1 fill-amber-500" />}
            {label}
        </Badge>
    );
}

export function BidderProfile({ isOpen, onClose, userScore, mdId, isVip, vipId, onVipChange }: BidderProfileProps) {
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const supabase = createClient();

    if (!userScore) return null;

    const handleToggleVip = async () => {
        setSaving(true);
        try {
            if (isVip && vipId) {
                const { error } = await supabase
                    .from("md_vip_users")
                    .delete()
                    .eq("id", vipId);
                if (error) throw error;
                onVipChange(userScore.id, false);
                toast.success("VIP가 해제되었습니다.");
            } else {
                const { data, error } = await supabase
                    .from("md_vip_users")
                    .insert({ md_id: mdId, user_id: userScore.id, note: note || null })
                    .select("id")
                    .single();
                if (error) {
                    if (error.code === "23505") {
                        toast.info("이미 VIP로 등록된 유저입니다.");
                    } else {
                        throw error;
                    }
                } else {
                    onVipChange(userScore.id, true, data.id);
                    toast.success(`${userScore.display_name}을 VIP로 등록했습니다!`);
                }
            }
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'BidderProfile.handleToggleVip');
            toast.error(msg || "처리에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNote = async () => {
        if (!vipId) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from("md_vip_users")
                .update({ note })
                .eq("id", vipId);
            if (error) throw error;
            toast.success("메모가 저장되었습니다.");
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'BidderProfile.handleSaveNote');
            toast.error(msg || "메모 저장 실패");
        } finally {
            setSaving(false);
        }
    };

    const stats = [
        { label: "낙찰률", value: `${userScore.win_rate}%`, icon: TrendingUp, color: "text-green-500" },
        { label: "평균 입찰", value: `${formatNumber(userScore.avg_bid_amount)}원`, icon: TrendingUp, color: "text-blue-500" },
        { label: "방문 완료", value: `${userScore.confirmed_visits}회`, icon: Eye, color: "text-amber-500" },
        { label: "노쇼", value: `${userScore.noshow_count}회`, icon: AlertTriangle, color: userScore.noshow_count > 0 ? "text-red-500" : "text-neutral-500" },
    ];

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="bottom" className="h-[75vh] bg-[#1C1C1E] border-neutral-800 rounded-t-3xl sm:max-w-lg sm:mx-auto">
                <SheetHeader className="mb-6 text-left">
                    <SheetTitle className="text-white font-black text-xl">
                        입찰자 프로필
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-5 overflow-y-auto max-h-[calc(75vh-100px)] pb-6">
                    {/* Profile Header */}
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                            {userScore.profile_image ? (
                                <img src={userScore.profile_image} alt={userScore.display_name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lg font-black text-neutral-500">
                                    {userScore.display_name?.substring(0, 1) || "?"}
                                </span>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-white font-black text-lg">{userScore.display_name}</h3>
                                <TrustBadge level={userScore.trust_level} />
                            </div>
                            <p className="text-neutral-500 text-xs mt-0.5">
                                총 {userScore.total_bids}회 입찰 / {userScore.won_bids}회 낙찰
                            </p>
                        </div>
                    </div>

                    {/* Trust Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {stats.map((stat) => (
                            <div key={stat.label} className="bg-neutral-900 border border-neutral-800/50 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{stat.label}</p>
                                </div>
                                <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* VIP Toggle */}
                    <Button
                        onClick={handleToggleVip}
                        disabled={saving || userScore.trust_level === "blocked"}
                        className={`w-full h-12 rounded-2xl font-black text-base ${
                            isVip
                                ? "bg-neutral-800 text-amber-500 hover:bg-neutral-700 border border-amber-500/30"
                                : "bg-amber-500 text-black hover:bg-amber-400"
                        }`}
                    >
                        {isVip ? (
                            <><StarOff className="w-5 h-5 mr-2" />VIP 해제</>
                        ) : (
                            <><Star className="w-5 h-5 mr-2 fill-black" />VIP 등록</>
                        )}
                    </Button>

                    {/* MD Note */}
                    {isVip && (
                        <div className="space-y-2">
                            <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">MD 메모</p>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="이 고객에 대한 메모를 남겨주세요..."
                                className="w-full h-24 bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-sm text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-amber-500/50"
                            />
                            <Button
                                onClick={handleSaveNote}
                                disabled={saving}
                                variant="outline"
                                className="w-full h-10 rounded-xl bg-neutral-900 border-neutral-800 text-white font-bold hover:bg-neutral-800"
                            >
                                메모 저장
                            </Button>
                        </div>
                    )}

                    {/* Warning for blocked users */}
                    {userScore.trust_level === "blocked" && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-red-500 font-bold text-sm">차단된 유저</p>
                                <p className="text-red-400/70 text-xs mt-0.5">
                                    노쇼 {userScore.noshow_count}회로 자동 차단되었습니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
