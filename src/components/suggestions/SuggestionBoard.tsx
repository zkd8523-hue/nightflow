"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Lightbulb, Pencil } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSuggestions } from "@/hooks/useSuggestions";
import { SuggestionCard } from "@/components/suggestions/SuggestionCard";

export function SuggestionBoard() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { suggestions, loading, toggleLike } = useSuggestions(user?.id);

  function goLogin(next: string) {
    router.push(`/login?redirect=${encodeURIComponent(next)}`);
  }

  function handleWrite() {
    if (!user) {
      goLogin("/suggestions/new");
      return;
    }
    router.push("/suggestions/new");
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
          <h1 className="text-xl font-black text-foreground">건의 게시판</h1>
        </div>
        <p className="text-[12px] text-muted-foreground mb-5 pl-12">
          나플에 바라는 점을 남겨주세요.
        </p>

        {/* 목록 (항상 최신순) */}
        {loading ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">
            불러오는 중...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="py-16 text-center">
            <Lightbulb className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-[14px] font-bold text-foreground">아직 건의가 없어요</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              첫 건의를 남겨보세요
            </p>
            <button
              onClick={handleWrite}
              className="mt-5 px-5 py-2.5 rounded-full text-[14px] font-black bg-inverse text-inverse-foreground"
            >
              건의 남기기
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
