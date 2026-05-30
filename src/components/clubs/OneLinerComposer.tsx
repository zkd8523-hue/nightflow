"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  ONE_LINER_TAGS,
  ONE_LINER_TAG_CATEGORIES,
  ONE_LINER_TAG_MAP,
  matchTagsFromText,
} from "@/lib/clubs/oneLinerTags";
import type { ClubOneLiner } from "@/types/database";

const MAX_LEN = 100;

interface Props {
  clubId: string;
  clubName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: ClubOneLiner | null;
  /** 신규 작성 시 인라인에서 받아온 초기 텍스트 */
  initialContent?: string;
  onSuccess?: () => void;
}

export function OneLinerComposer({
  clubId,
  clubName,
  open,
  onOpenChange,
  existing,
  initialContent,
  onSuccess,
}: Props) {
  const isEditMode = !!existing;
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setContent(existing?.content ?? initialContent ?? "");
      setSelectedTags(existing?.tags ?? []);
    }
  }, [open, existing, initialContent]);

  const trimmed = content.trim();
  const len = trimmed.length;
  const overLimit = content.length > MAX_LEN;
  // 텍스트 1자 이상이거나 태그 1개 이상이면 저장 가능
  const canSubmit =
    (len >= 1 || selectedTags.length >= 1) && !overLimit && !submitting;

  const counterColor = overLimit
    ? "text-red-500"
    : content.length >= 80
      ? "text-amber-400"
      : "text-neutral-500";

  // 자유 텍스트 → 추천 태그 (선택되지 않은 것 우선 노출)
  const recommended = useMemo(() => {
    if (len < 2) return [];
    return matchTagsFromText(content, 8);
  }, [content, len]);

  function toggleTag(code: string) {
    setSelectedTags((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const supabase = createClient();

    const finalContent = trimmed || ""; // 빈 문자열 허용 안 됨 → 텍스트 없으면 태그만 저장하는 경우 placeholder 처리 필요

    // 텍스트 없이 태그만인 경우, 선택 태그를 텍스트로 자동 생성
    const autoContent =
      finalContent ||
      selectedTags
        .slice(0, 3)
        .map((c) => ONE_LINER_TAG_MAP[c]?.label)
        .filter(Boolean)
        .join(", ");

    try {
      if (existing) {
        const { error } = await supabase
          .from("club_one_liners")
          .update({ content: autoContent, tags: selectedTags })
          .eq("id", existing.id);
        if (error) throw error;
        toast.success("한 줄 리뷰가 수정되었습니다");
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("로그인이 필요합니다");
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.from("club_one_liners").insert({
          club_id: clubId,
          author_id: user.id,
          content: autoContent,
          tags: selectedTags,
        });
        if (error) {
          console.error("[OneLinerComposer] insert error", error);
          if (error.code === "23505") {
            toast.error("이미 한 줄 리뷰를 작성하셨습니다. 수정해주세요.");
          } else if (
            error.code === "42P01" ||
            error.message?.includes("club_one_liners")
          ) {
            toast.error("DB 마이그레이션이 적용되지 않았습니다 (275/278)");
          } else if (
            error.code === "42501" ||
            error.message?.includes("row-level security")
          ) {
            toast.error(
              "작성 권한이 없습니다 (이 클럽 담당 MD이거나 차단 계정일 수 있습니다)"
            );
          } else {
            toast.error(`등록 실패: ${error.message ?? "알 수 없는 오류"}`);
          }
          setSubmitting(false);
          return;
        }
        toast.success("한 줄 리뷰가 등록되었습니다");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      console.error("[OneLinerComposer] error", e);
      toast.error(`처리 중 오류: ${err.message ?? "알 수 없음"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl p-0 max-h-[90vh] flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-neutral-800 shrink-0">
          <SheetTitle className="text-white text-[16px] text-left">
            {isEditMode ? "한 줄 리뷰 수정" : "이런 점이 마음에 드셨나요?"}
          </SheetTitle>
          {clubName && (
            <p className="text-[12px] text-neutral-400 text-left">{clubName}</p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 자유 텍스트 — 수정 모드에서만 노출 (신규는 인라인에서 이미 받음) */}
          {isEditMode && (
            <div className="space-y-1.5">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="예: 음악 좋고 분위기 미친 곳"
                rows={3}
                className="w-full bg-[#0A0A0A] border border-neutral-800 rounded-2xl px-4 py-3 text-white text-[15px] placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
              />
              <div className="text-right">
                <span className={`text-[11px] ${counterColor}`}>
                  {content.length}/{MAX_LEN}
                </span>
              </div>
            </div>
          )}

          {/* 추천 태그 */}
          {recommended.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[12px] font-bold text-amber-400">
                  추천 태그
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recommended.map((code) => {
                  const tag = ONE_LINER_TAG_MAP[code];
                  if (!tag) return null;
                  const selected = selectedTags.includes(code);
                  return (
                    <TagChip
                      key={code}
                      label={tag.label}
                      emoji={tag.emoji}
                      selected={selected}
                      onClick={() => toggleTag(code)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 선택된 태그 요약 (전체에서 골라 추가한 것 포함) */}
          {selectedTags.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-bold text-white">
                선택된 태그 {selectedTags.length}개
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((code) => {
                  const tag = ONE_LINER_TAG_MAP[code];
                  if (!tag) return null;
                  return (
                    <TagChip
                      key={code}
                      label={tag.label}
                      emoji={tag.emoji}
                      selected
                      onClick={() => toggleTag(code)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 전체 태그 (카테고리별 항상 노출) */}
          <div className="space-y-3">
            {ONE_LINER_TAG_CATEGORIES.map((cat) => {
              const tagsInCat = ONE_LINER_TAGS.filter(
                (t) => t.category === cat.key
              );
              if (tagsInCat.length === 0) return null;
              return (
                <div key={cat.key} className="space-y-1.5">
                  <div className="text-[11px] font-bold text-neutral-500">
                    {cat.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsInCat.map((t) => {
                      const selected = selectedTags.includes(t.code);
                      return (
                        <TagChip
                          key={t.code}
                          label={t.label}
                          emoji={t.emoji}
                          selected={selected}
                          onClick={() => toggleTag(t.code)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단 고정 CTA */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-[#1C1C1E] shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-full text-[14px] font-black bg-white text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
          >
            {submitting ? "처리 중..." : existing ? "수정" : "등록"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TagChip({
  label,
  emoji,
  selected,
  onClick,
}: {
  label: string;
  emoji: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
        selected
          ? "bg-amber-500/15 border-amber-500 text-amber-300"
          : "bg-[#0A0A0A] border-neutral-800 text-neutral-300 hover:border-neutral-600"
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}
