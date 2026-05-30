"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareQuote, Plus, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsClubPartner } from "@/hooks/useIsClubPartner";
import { OneLinerCard } from "./OneLinerCard";
import { OneLinerComposer } from "./OneLinerComposer";
import { ONE_LINER_TAG_MAP } from "@/lib/clubs/oneLinerTags";
import { toast } from "sonner";
import type { ClubOneLiner } from "@/types/database";

type SortMode = "popular" | "recent";
const VISIBLE_DEFAULT = 5;

interface Props {
  clubId: string;
  clubName?: string;
}

export function OneLinerSection({ clubId, clubName }: Props) {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isPartner, isAdmin } = useIsClubPartner(clubId);
  // 파트너 MD는 자기 클럽에 작성 불가 (admin은 예외 두지 않음 — admin도 셀프 칭찬 방지)
  const blockedFromWriting = isPartner && !isAdmin;

  const [oneLiners, setOneLiners] = useState<ClubOneLiner[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("popular");
  const [expanded, setExpanded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClubOneLiner | null>(null);
  // 인라인 텍스트 입력
  const [inlineMode, setInlineMode] = useState(false);
  const [inlineText, setInlineText] = useState("");
  const [draftText, setDraftText] = useState("");

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);

    const { data, error } = await supabase
      .from("club_one_liners")
      .select(
        `
        id, club_id, author_id, content, tags, like_count, is_deleted,
        created_at, updated_at,
        author:public_user_profiles!club_one_liners_author_id_fkey(id, display_name, profile_image)
      `
      )
      .eq("club_id", clubId)
      .eq("is_deleted", false);

    if (error) {
      console.error("[OneLinerSection] fetch error", error);
      setOneLiners([]);
      setLoading(false);
      return;
    }

    let likedSet = new Set<string>();
    if (user && data && data.length > 0) {
      const ids = data.map((d) => d.id);
      const { data: likes } = await supabase
        .from("one_liner_likes")
        .select("one_liner_id")
        .eq("user_id", user.id)
        .in("one_liner_id", ids);
      likedSet = new Set((likes ?? []).map((l) => l.one_liner_id));
    }

    const enriched: ClubOneLiner[] = (data ?? []).map((d) => {
      const rawAuthor = (d as { author?: unknown }).author;
      const authorObj = Array.isArray(rawAuthor)
        ? (rawAuthor[0] as ClubOneLiner["author"])
        : (rawAuthor as ClubOneLiner["author"]);
      return {
        id: d.id,
        club_id: d.club_id,
        author_id: d.author_id,
        content: d.content,
        tags: (d as { tags?: string[] }).tags ?? [],
        like_count: d.like_count,
        is_deleted: d.is_deleted,
        created_at: d.created_at,
        updated_at: d.updated_at,
        author: authorObj,
        liked_by_me: likedSet.has(d.id),
      };
    });

    setOneLiners(enriched);
    setLoading(false);
  }, [clubId, user]);

  useEffect(() => {
    if (userLoading) return;
    fetchData();
  }, [fetchData, userLoading]);

  const mineFromList = useMemo(
    () => oneLiners.find((o) => o.author_id === user?.id) ?? null,
    [oneLiners, user]
  );

  const sorted = useMemo(() => {
    const others = oneLiners.filter((o) => o.author_id !== user?.id);
    if (sort === "popular") {
      others.sort((a, b) => {
        if (b.like_count !== a.like_count) return b.like_count - a.like_count;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    } else {
      others.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    // 내 글이 있으면 항상 최상단 고정
    return mineFromList ? [mineFromList, ...others] : others;
  }, [oneLiners, sort, user, mineFromList]);

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_DEFAULT);
  const hasMore = sorted.length > VISIBLE_DEFAULT;

  // 클럽 전체 태그 TOP 집계 (인기순)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ol of oneLiners) {
      for (const code of ol.tags ?? []) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [oneLiners]);

  function handleWriteClick() {
    if (!user) {
      router.push(`/login?next=/clubs/${clubId}`);
      return;
    }
    setEditTarget(null);
    setInlineMode(true);
    setInlineText("");
  }

  function handleInlineNext() {
    const trimmed = inlineText.trim();
    if (trimmed.length < 1) return;
    if (trimmed.length > 100) return;
    setDraftText(trimmed);
    setEditTarget(null);
    setComposerOpen(true);
  }

  function handleInlineCancel() {
    setInlineMode(false);
    setInlineText("");
  }

  function handleEditMine() {
    if (!mineFromList) return;
    setDraftText("");
    setEditTarget(mineFromList);
    setComposerOpen(true);
  }

  function handleEditFromCard(ol: ClubOneLiner) {
    setDraftText("");
    setEditTarget(ol);
    setComposerOpen(true);
  }

  function handleRequireLogin() {
    toast.message("로그인 후 좋아요를 누를 수 있어요", {
      action: {
        label: "로그인",
        onClick: () => router.push(`/login?next=/clubs/${clubId}`),
      },
    });
  }

  return (
    <section className="bg-[#1C1C1E] rounded-2xl p-4 mb-6">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <MessageSquareQuote className="w-4 h-4 text-amber-400" />
          <h2 className="text-[15px] font-black text-white">
            한 줄 리뷰
            <span className="ml-1.5 text-neutral-500 text-[13px] font-bold">
              {oneLiners.length}
            </span>
          </h2>
        </div>

        {sorted.length > 1 && (
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setSort("popular")}
              className={`px-2 py-0.5 rounded-full font-bold transition-colors ${
                sort === "popular"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-white"
              }`}
            >
              인기순
            </button>
            <button
              onClick={() => setSort("recent")}
              className={`px-2 py-0.5 rounded-full font-bold transition-colors ${
                sort === "recent"
                  ? "bg-white text-black"
                  : "text-neutral-500 hover:text-white"
              }`}
            >
              최신순
            </button>
          </div>
        )}
      </header>

      {/* 클럽 태그 TOP 집계 */}
      {tagCounts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tagCounts.map(([code, cnt]) => {
            const tag = ONE_LINER_TAG_MAP[code];
            if (!tag) return null;
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold bg-neutral-900 text-neutral-200"
              >
                <span>{tag.emoji}</span>
                <span>{tag.label}</span>
                <span className="text-amber-400">{cnt}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* 작성 트리거 / 안내 */}
      {blockedFromWriting ? (
        <div className="w-full px-3 py-2.5 mb-2 rounded-xl bg-neutral-900 text-[12px] text-neutral-500">
          이 클럽의 담당 MD는 한 줄 리뷰를 작성할 수 없어요
        </div>
      ) : !mineFromList ? (
        inlineMode ? (
          <div className="mb-3 rounded-2xl border border-neutral-700 bg-[#0A0A0A] p-3">
            <textarea
              autoFocus
              value={inlineText}
              onChange={(e) => setInlineText(e.target.value)}
              placeholder="이 클럽을 한 문장으로 표현해주세요!"
              rows={2}
              maxLength={100}
              className="w-full bg-transparent text-white text-[14px] placeholder:text-neutral-500 focus:outline-none resize-none"
            />
            <div className="mt-1 flex items-center justify-between">
              <span
                className={`text-[11px] ${
                  inlineText.length > 100
                    ? "text-red-500"
                    : inlineText.length >= 80
                      ? "text-amber-400"
                      : "text-neutral-500"
                }`}
              >
                {inlineText.length}/100
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleInlineCancel}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold text-neutral-400 hover:text-white"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleInlineNext}
                  disabled={
                    inlineText.trim().length < 1 || inlineText.length > 100
                  }
                  className="px-3 py-1.5 rounded-full text-[12px] font-black bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleWriteClick}
            className="w-full flex items-center gap-2 px-3 py-3 mb-2 rounded-xl border border-dashed border-neutral-700 hover:border-neutral-500 text-left text-[13px] text-neutral-400 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">이 클럽을 한 문장으로 표현해주세요!</span>
          </button>
        )
      ) : (
        <button
          onClick={handleEditMine}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-xl bg-neutral-900 text-[12px] text-neutral-400 hover:text-white transition-colors"
        >
          <span>내 한 줄 리뷰가 등록되어 있어요</span>
          <span className="text-amber-400 font-bold">수정</span>
        </button>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="py-8 text-center text-[13px] text-neutral-500">
          불러오는 중...
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[13px] text-neutral-400">
            아직 한 줄 리뷰가 없어요
          </p>
          <p className="text-[12px] text-neutral-600 mt-1">
            첫 한 줄 리뷰의 주인공이 되어보세요!
          </p>
        </div>
      ) : (
        <div>
          {visible.map((ol) => (
            <OneLinerCard
              key={ol.id}
              oneLiner={ol}
              currentUserId={user?.id}
              isLoggedIn={!!user}
              isAdmin={isAdmin}
              onEdit={handleEditFromCard}
              onChange={fetchData}
              onRequireLogin={handleRequireLogin}
            />
          ))}

          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full mt-3 py-2 flex items-center justify-center gap-1 text-[13px] text-neutral-400 hover:text-white transition-colors"
            >
              더보기
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <OneLinerComposer
        clubId={clubId}
        clubName={clubName}
        open={composerOpen}
        onOpenChange={(v) => {
          setComposerOpen(v);
          if (!v) {
            // 시트 닫히면 인라인도 정리
            setInlineMode(false);
            setInlineText("");
            setDraftText("");
          }
        }}
        existing={editTarget}
        initialContent={draftText || undefined}
        onSuccess={() => {
          setInlineMode(false);
          setInlineText("");
          setDraftText("");
          fetchData();
        }}
      />
    </section>
  );
}
