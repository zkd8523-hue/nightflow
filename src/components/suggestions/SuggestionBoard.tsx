"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSuggestions } from "@/hooks/useSuggestions";
import { SuggestionCard } from "@/components/suggestions/SuggestionCard";
import { SUGGESTION_CATEGORIES, type SuggestionCategory } from "@/lib/suggestions/categories";

export function SuggestionBoard() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [filter, setFilter] = useState<SuggestionCategory | "all">("all");
  const { suggestions, loading, toggleLike } = useSuggestions(
    user?.id,
    filter === "all" ? undefined : filter
  );

  function goLogin(next: string) {
    router.push(`/login?redirect=${encodeURIComponent(next)}`);
  }

  function handleWrite() {
    // 지금 보고 있는 카테고리 필터를 새 글 폼에 그대로 이어준다
    const q = filter === "all" ? "" : `?category=${filter}`;
    const next = `/suggestions/new${q}`;
    if (!user) {
      goLogin(next);
      return;
    }
    router.push(next);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6 pb-28">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-black text-foreground">이야기 게시판</h1>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-2 mt-3 mb-5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          <FilterChip label="전체" active={filter === "all"} onClick={() => setFilter("all")} />
          {SUGGESTION_CATEGORIES.map((c) => (
            <FilterChip
              key={c.value}
              label={`${c.emoji} ${c.label}`}
              active={filter === c.value}
              onClick={() => setFilter(c.value)}
            />
          ))}
        </div>

        {/* 목록 (항상 최신순) */}
        {loading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">
            불러오는 중...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-[32px] leading-none mb-3">
              {filter === "all"
                ? "💬"
                : SUGGESTION_CATEGORIES.find((c) => c.value === filter)?.emoji}
            </div>
            <p className="text-[14px] font-bold text-foreground">아직 글이 없어요</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {filter === "all"
                ? "첫 이야기를 남겨보세요"
                : `${SUGGESTION_CATEGORIES.find((c) => c.value === filter)?.label}에 첫 글을 남겨보세요`}
            </p>
            <button
              onClick={handleWrite}
              className="mt-5 px-5 py-2.5 rounded-full text-[14px] font-black bg-inverse text-inverse-foreground"
            >
              글 남기기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                currentUserId={user?.id}
                onLike={toggleLike}
                onRequireLogin={() => goLogin("/suggestions")}
              />
            ))}
          </div>
        )}
      </div>

      {/* 작성 FAB — 하단 네비(56px) 위 */}
      <button
        onClick={handleWrite}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-inverse text-inverse-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        style={{ bottom: "calc(56px + 16px + env(safe-area-inset-bottom))" }}
        aria-label="건의 작성"
      >
        <Pencil className="w-5 h-5" />
      </button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold whitespace-nowrap transition-colors active:scale-95 ${
        active
          ? "bg-amber-500 text-black"
          : "bg-card text-muted-foreground border border-border hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
