"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Star, StarOff, Search, Shield, TrendingUp, Award } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MDVipUser, UserTrustScore } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface VIPDashboardProps {
    mdId: string;
    initialVipList: any[];
    trustScores: any[];
}

export function VIPDashboard({ mdId, initialVipList, trustScores }: VIPDashboardProps) {
    const [vipList, setVipList] = useState(initialVipList);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"vip" | "bidders">("vip");
    const supabase = createClient();

    const handleAddVip = async (userId: string, userName: string) => {
        const note = prompt(`${userName}을 VIP로 등록합니다.\n메모 (선택):`, "");
        if (note === null) return; // 취소

        try {
            const { data, error } = await supabase
                .from("md_vip_users")
                .insert({ md_id: mdId, user_id: userId, notes: note })
                .select("*, user:users(id, name)")
                .single();

            if (error) {
                if (error.code === "23505") {
                    toast.info("이미 VIP로 등록된 유저입니다.");
                } else {
                    throw error;
                }
            } else {
                setVipList([data, ...vipList]);
                toast.success(`${userName}을 VIP로 등록했습니다! ⭐`);
            }
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'VIPDashboard.handleAddVip');
            toast.error(msg || "VIP 등록 실패");
        }
    };

    const handleRemoveVip = async (vipId: string, userName: string) => {
        if (!confirm(`${userName}의 VIP를 해제하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from("md_vip_users")
                .delete()
                .eq("id", vipId);

            if (error) throw error;

            setVipList(vipList.filter(v => v.id !== vipId));
            toast.success("VIP가 해제되었습니다.");
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'VIPDashboard.handleRemoveVip');
            toast.error(msg || "VIP 해제 실패");
        }
    };

    const getTrustLevelColor = (level: string) => {
        switch (level) {
            case "vip": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
            case "normal": return "text-neutral-300 bg-neutral-500/10 border-neutral-500/30";
            case "caution": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
            case "blocked": return "text-red-400 bg-red-500/10 border-red-500/30";
            default: return "text-neutral-500 bg-neutral-800/50 border-neutral-700";
        }
    };

    const getTrustLevelLabel = (level: string) => {
        switch (level) {
            case "vip": return "⭐ VIP";
            case "normal": return "일반";
            case "caution": return "⚠️ 주의";
            case "blocked": return "🚫 차단";
            default: return "브론즈";
        }
    };

    const vipUserIds = new Set(vipList.map(v => v.user_id));

    const filteredVips = vipList.filter(v =>
        !searchQuery || v.user?.name?.includes(searchQuery)
    );

    const filteredBidders = trustScores.filter(s =>
        !searchQuery || s.bidder_name?.includes(searchQuery)
    );

    return (
        <div className="space-y-4 pb-20">
            {/* 탭 */}
            <div className="flex gap-2 bg-neutral-900 border border-neutral-800/50 rounded-xl p-1">
                <button
                    onClick={() => setActiveTab("vip")}
                    className={`flex-1 h-10 rounded-lg text-sm font-bold transition-colors ${activeTab === "vip" ? "bg-[#1C1C1E] text-white" : "text-neutral-500"}`}
                >
                    ⭐ VIP ({vipList.length}명)
                </button>
                <button
                    onClick={() => setActiveTab("bidders")}
                    className={`flex-1 h-10 rounded-lg text-sm font-bold transition-colors ${activeTab === "bidders" ? "bg-[#1C1C1E] text-white" : "text-neutral-500"}`}
                >
                    🏆 입찰자 랭킹
                </button>
            </div>

            {/* 검색 */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="이름으로 검색..."
                    className="pl-9 bg-[#1C1C1E] border-neutral-800 h-11 text-white"
                />
            </div>

            {activeTab === "vip" ? (
                <div className="space-y-3">
                    {filteredVips.length === 0 ? (
                        <div className="py-16 text-center space-y-3 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
                            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
                                <Star className="w-8 h-8 text-neutral-700" />
                            </div>
                            <p className="text-neutral-500 text-sm font-medium">
                                {searchQuery ? "검색 결과가 없습니다" : "VIP 고객이 없습니다"}
                            </p>
                            <p className="text-neutral-600 text-xs px-8">
                                입찰자 랭킹 탭에서 단골 고객을 VIP로 지정하세요
                            </p>
                        </div>
                    ) : (
                        filteredVips.map((vip) => (
                            <Card key={vip.id} className="bg-[#1C1C1E] border-neutral-800/50 p-4 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-black text-amber-500">
                                        {vip.user?.name?.substring(0, 1) || "?"}
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">{vip.user?.name || "알 수 없음"}</p>
                                        {vip.notes && (
                                            <p className="text-xs text-neutral-500 mt-0.5">{vip.notes}</p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveVip(vip.id, vip.user?.name)}
                                    className="text-amber-500 hover:text-neutral-400 hover:bg-neutral-800"
                                >
                                    <StarOff className="w-4 h-4" />
                                </Button>
                            </Card>
                        ))
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredBidders.length === 0 ? (
                        <div className="py-16 text-center space-y-3 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
                            <TrendingUp className="w-8 h-8 text-neutral-700 mx-auto" />
                            <p className="text-neutral-500 text-sm">경매 입찰 데이터가 없습니다</p>
                        </div>
                    ) : (
                        filteredBidders.map((score, idx) => (
                            <Card key={score.bidder_id} className="bg-[#1C1C1E] border-neutral-800/50 p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-black text-neutral-400">
                                            #{idx + 1}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-white font-bold text-sm">{score.bidder_name}</p>
                                                <Badge className={`text-[10px] px-1.5 py-0 border ${getTrustLevelColor(score.trust_level)}`}>
                                                    {getTrustLevelLabel(score.trust_level)}
                                                </Badge>
                                            </div>
                                            <div className="flex gap-3 mt-1">
                                                <span className="text-[11px] text-neutral-500">
                                                    입찰 {score.total_bids}회
                                                </span>
                                                <span className="text-[11px] text-green-500">
                                                    낙찰 {score.won_auctions}건
                                                </span>
                                                <span className="text-[11px] text-neutral-500">
                                                    결제율 {Math.round(score.payment_rate * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleAddVip(score.bidder_id, score.bidder_name)}
                                        disabled={vipUserIds.has(score.bidder_id)}
                                        className={vipUserIds.has(score.bidder_id)
                                            ? "text-amber-500"
                                            : "text-neutral-500 hover:text-amber-500 hover:bg-amber-500/10"
                                        }
                                    >
                                        <Star className={`w-4 h-4 ${vipUserIds.has(score.bidder_id) ? "fill-amber-500" : ""}`} />
                                    </Button>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
