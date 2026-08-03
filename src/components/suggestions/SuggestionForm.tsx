"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Suggestion } from "@/types/database";

const TITLE_MAX = 60;
const CONTENT_MAX = 2000;

interface Props {
  /** 넘기면 수정 모드 (등록/수정 통합 폼 — AuctionForm 과 동일 규약) */
  suggestion?: Suggestion;
}

export function SuggestionForm({ suggestion }: Props) {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const isEdit = !!suggestion;

  const [title, setTitle] = useState(suggestion?.title ?? "");
  const [content, setContent] = useState(suggestion?.content ?? "");
  const [isPrivate, setIsPrivate] = useState(suggestion?.is_private ?? false);
  const [submitting, setSubmitting] = useState(false);
  // 성공 후 폼을 잠가 중복 제출을 막는다 (조각 등록 중복 제출 이슈와 동일 대응)
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      const next = isEdit ? `/suggestions/${suggestion.id}/edit` : "/suggestions/new";
      router.replace(`/login?redirect=${encodeURIComponent(next)}`);
    }
  }, [isLoading, user, router, isEdit, suggestion?.id]);

  const canSubmit =
    title.trim().length >= 2 &&
    content.trim().length >= 5 &&
    !submitting &&
    !submitted;

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setSubmitting(true);

    const supabase = createClient();
    const payload = {
      title: title.trim(),
      content: content.trim(),
      is_private: isPrivate,
    };

    const { data, error } = isEdit
      ? await supabase
          .from("suggestions")
          .update(payload)
          .eq("id", suggestion.id)
          .select("id")
          .single()
      : await supabase
          .from("suggestions")
          .insert({ author_id: user.id, ...payload })
          .select("id")
          .single();

    if (error || !data) {
      // 도배 방지 트리거는 'RATE_LIMIT_DUPLICATE: ...' 형태로 내려온다
      const raw = error?.message ?? "";
      const msg = raw.startsWith("RATE_LIMIT_DUPLICATE:")
        ? raw.replace("RATE_LIMIT_DUPLICATE:", "").trim()
        : `${isEdit ? "수정" : "등록"} 실패: ${raw}`;
      toast.error(msg);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    toast.success(isEdit ? "건의가 수정되었습니다" : "건의가 등록되었습니다");
    router.replace(`/suggestions/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-black text-foreground">
            {isEdit ? "건의 수정" : "건의 남기기"}
          </h1>
        </div>

        {/* 제목 */}
        <label className="block text-[13px] font-bold text-foreground mb-2">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="한 줄로 요약해주세요"
          disabled={submitted}
          className="w-full bg-card border border-border rounded-xl px-4 h-12 text-foreground text-[15px] placeholder:text-muted-foreground focus:outline-none focus:border-border disabled:opacity-60"
        />
        <div className="mt-1 text-right text-[11px] text-muted-foreground">
          {title.length}/{TITLE_MAX}
        </div>

        {/* 내용 */}
        <label className="block text-[13px] font-bold text-foreground mt-4 mb-2">내용</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={CONTENT_MAX}
          rows={8}
          placeholder="어떤 점이 불편했는지, 어떻게 바뀌면 좋을지 적어주세요"
          disabled={submitted}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground text-[15px] placeholder:text-muted-foreground focus:outline-none focus:border-border resize-none disabled:opacity-60"
        />
        <div className="mt-1 text-right text-[11px] text-muted-foreground">
          {content.length}/{CONTENT_MAX}
        </div>

        {/* 관리자만 보기 */}
        <div className="mt-5 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-bold text-foreground">
              <Lock className="w-4 h-4 text-muted-foreground" />
              관리자만 보기
            </span>
            <button
              type="button"
              onClick={() => setIsPrivate((v) => !v)}
              disabled={submitted}
              role="switch"
              aria-checked={isPrivate}
              aria-label="관리자만 보기"
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
                isPrivate ? "bg-white" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-background transition-all ${
                  isPrivate ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">
            {isPrivate
              ? "다른 회원에게 보이지 않고 관리자만 확인합니다. 공감·댓글도 받지 않습니다."
              : "다른 회원도 볼 수 있고, 공감과 댓글을 남길 수 있습니다."}
          </p>
        </div>

        {/* 제출 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 w-full py-4 rounded-full text-[15px] font-black bg-inverse text-inverse-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors"
        >
          {submitting
            ? isEdit
              ? "수정 중..."
              : "등록 중..."
            : isEdit
              ? "수정하기"
              : "등록하기"}
        </button>
      </div>
    </div>
  );
}
