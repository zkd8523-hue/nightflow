"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Heart, Lock, Pencil, Trash2, Siren } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSuggestion } from "@/hooks/useSuggestions";
import { SuggestionComments } from "@/components/suggestions/SuggestionComments";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { formatRelativeTime } from "@/lib/utils/format";
import { suggestionCategoryLabel } from "@/lib/suggestions/categories";

export function SuggestionDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { suggestion, loading, toggleLike } = useSuggestion(id, user?.id);

  const isAdmin = user?.role === "admin";
  const isMine = !!user && suggestion?.author_id === user.id;

  function goLogin() {
    router.push(`/login?redirect=${encodeURIComponent(`/suggestions/${id}`)}`);
  }

  async function handleReport() {
    if (!user) return goLogin();
    const reason = window.prompt("신고 사유를 적어주세요 (관리자 검토용)");
    if (reason === null) return;
    const { data, error } = await createClient().rpc("report_suggestion", {
      p_suggestion_id: id,
      p_reason: reason,
    });
    if (error || !(data as { success?: boolean })?.success) {
      toast.error(error?.message || (data as { error?: string })?.error || "신고 실패");
      return;
    }
    toast.success("신고 접수됐어요. 관리자가 검토합니다");
  }

  async function handleDelete() {
    if (!confirm("이 건의를 삭제할까요?")) return;
    const supabase = createClient();
    // admin의 남의 글 삭제가 UPDATE 정책 WITH CHECK에 걸리므로 SECURITY DEFINER RPC 사용 (502)
    const { data, error } = await supabase.rpc("soft_delete_suggestion", { p_id: id });
    if (error || !(data as { success?: boolean })?.success) {
      toast.error(error?.message || (data as { error?: string })?.error || "삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
    router.replace("/suggestions");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-[13px] text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  // 삭제됐거나, 비공개글인데 열람 권한이 없는 경우 (RLS가 걸러 null)
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
              볼 수 없는 건의예요
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              삭제됐거나 관리자에게만 공개된 글입니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6 pb-24">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-[16px] font-black text-foreground">건의</h1>
          <div className="ml-auto flex items-center gap-1">
            {isMine && (
              <Link
                href={`/suggestions/${id}/edit`}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="수정"
              >
                <Pencil className="w-4 h-4" />
              </Link>
            )}
            {(isMine || isAdmin) && (
              <button
                onClick={handleDelete}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-red-400 hover:bg-muted transition-colors"
                aria-label="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {!isMine && (
              <button
                onClick={handleReport}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-red-400 hover:bg-muted transition-colors"
                aria-label="신고"
              >
                <Siren className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <article className="bg-card border border-border rounded-2xl p-4">
          {suggestion.is_private && (
            <div className="mb-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-bold w-fit">
              <Lock className="w-3 h-3" />
              관리자만 보기
            </div>
          )}

          {suggestionCategoryLabel(suggestion.category) && (
            <span className="inline-block mb-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25">
              {suggestionCategoryLabel(suggestion.category)}
            </span>
          )}
          <h2 className="text-[17px] font-black text-foreground leading-snug break-words">
            {suggestion.title}
          </h2>

          <div className="mt-2.5 flex items-center gap-2">
            <Link
              href={`/u/${suggestion.author_id}`}
              className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
            >
              <div className="relative w-6 h-6 rounded-full overflow-hidden bg-muted shrink-0">
                {suggestion.author?.profile_image ? (
                  <Image
                    src={suggestion.author.profile_image}
                    alt=""
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/50 text-[10px] font-black">
                    {(suggestion.author?.display_name ?? "익").charAt(0)}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-bold text-foreground/80 truncate">
                {suggestion.author?.display_name ?? "익명"}
              </span>
            </Link>
            <span className="text-[11px] text-muted-foreground shrink-0">
              · {formatRelativeTime(suggestion.created_at)}
              {suggestion.updated_at !== suggestion.created_at && " · 수정됨"}
            </span>
          </div>

          <p className="mt-4 text-[15px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {suggestion.content}
          </p>

          {suggestion.media.length > 0 && <ChatMediaGrid items={suggestion.media} />}

          {/* 공감 */}
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-center">
            <button
              type="button"
              onClick={() => (user ? toggleLike() : goLogin())}
              disabled={isMine}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[14px] font-bold transition-colors ${
                suggestion.liked_by_me
                  ? "bg-red-500/10 text-red-400"
                  : "bg-muted text-muted-foreground hover:text-foreground/80"
              } ${isMine ? "cursor-default" : ""}`}
            >
              <Heart
                className={`w-4 h-4 ${suggestion.liked_by_me ? "fill-current" : ""}`}
              />
              공감 {suggestion.like_count}
            </button>
          </div>
          {isMine && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              내가 쓴 건의에는 공감할 수 없어요
            </p>
          )}
        </article>

        {/* 댓글 */}
        <SuggestionComments
          suggestionId={suggestion.id}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          onRequireLogin={goLogin}
        />
      </div>
    </div>
  );
}
