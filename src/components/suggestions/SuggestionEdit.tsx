"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSuggestion } from "@/hooks/useSuggestions";
import { SuggestionForm } from "@/components/suggestions/SuggestionForm";

/** 수정은 작성자 본인만. (RLS는 admin도 허용하지만 남의 글 본문을 고치진 않는다) */
export function SuggestionEdit({ id }: { id: string }) {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const { suggestion, loading } = useSuggestion(id, user?.id);

  const notMine = !!suggestion && !!user && suggestion.author_id !== user.id;

  useEffect(() => {
    if (!loading && !isLoading && notMine) {
      router.replace(`/suggestions/${id}`);
    }
  }, [loading, isLoading, notMine, router, id]);

  if (loading || isLoading || notMine) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-[13px] text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  if (!suggestion) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-lg px-4 py-6">
          <button
            onClick={() => router.replace("/suggestions")}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="py-20 text-center">
            <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-[14px] font-bold text-foreground">
              수정할 수 없는 건의예요
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              삭제됐거나 열람 권한이 없는 글입니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <SuggestionForm suggestion={suggestion} />;
}
