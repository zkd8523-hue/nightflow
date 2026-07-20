"use client";

import type { PriceRecommendation } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { BarChart3, Target, TrendingUp, Zap } from "lucide-react";

interface SmartPricingCardProps {
    recommendation: PriceRecommendation | null;
    loading: boolean;
    onApply: (price: number) => void;
}

export function SmartPricingCard({ recommendation, loading, onApply }: SmartPricingCardProps) {
    if (loading) {
        return (
            <div className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 bg-muted rounded" />
                    <div className="h-4 w-32 bg-muted rounded" />
                </div>
                <div className="h-8 w-40 bg-muted rounded mb-4" />
                <div className="grid grid-cols-2 gap-3">
                    <div className="h-16 bg-muted rounded-xl" />
                    <div className="h-16 bg-muted rounded-xl" />
                </div>
            </div>
        );
    }

    if (!recommendation) return null;

    if (!recommendation.sufficient_data) {
        return (
            <div className="bg-card border border-border/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[12px] font-bold text-muted-foreground">AI 추천 시작가</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                    과거 데이터가 부족합니다 ({recommendation.total_auctions}건 / 최소 3건 필요)
                </p>
            </div>
        );
    }

    const successRate = recommendation.success_rate || 0;
    const successColor = successRate >= 80
        ? "text-money"
        : successRate >= 50
            ? "text-brand-amber"
            : "text-red-500";

    return (
        <div className="bg-card border border-green-500/20 rounded-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-money" />
                    <span className="text-[13px] font-bold text-foreground">AI 추천 시작가</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">
                    최근 {recommendation.total_auctions}건 분석
                    {recommendation.fallback && " (전체 테이블)"}
                </span>
            </div>

            {/* Suggested Price */}
            <div className="text-center py-1">
                <p className="text-[28px] font-black text-money leading-none">
                    {formatNumber(recommendation.suggested_start_price || 0)}원
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-card rounded-xl border border-border p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-bold">예상 낙찰 범위</span>
                    </div>
                    <p className="text-[13px] text-foreground font-bold">
                        {formatNumber(recommendation.p25_winning_price || 0)} ~ {formatNumber(recommendation.p75_winning_price || 0)}원
                    </p>
                </div>
                <div className="bg-card rounded-xl border border-border p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Target className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-bold">낙찰 성공률</span>
                    </div>
                    <p className={`text-[13px] font-bold ${successColor}`}>
                        {successRate}%
                        <span className="text-muted-foreground text-[10px] ml-1">
                            ({recommendation.successful_auctions}/{recommendation.total_auctions})
                        </span>
                    </p>
                </div>
            </div>

            {/* Apply Button */}
            {recommendation.suggested_start_price && recommendation.suggested_start_price > 0 && (
                <button
                    type="button"
                    onClick={() => onApply(recommendation.suggested_start_price!)}
                    className="w-full h-10 rounded-xl bg-green-500/10 border border-green-500/30 text-money font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-green-500/20 transition-colors active:scale-[0.98]"
                >
                    <Zap className="w-4 h-4" />
                    추천가 적용하기
                </button>
            )}
        </div>
    );
}
