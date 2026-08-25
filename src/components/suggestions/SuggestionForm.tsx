"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ImagePlus, Loader2, Lock, Play, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  uploadSuggestionMedia,
  SUGGESTION_MEDIA_MAX_COUNT,
} from "@/lib/utils/uploadSuggestionMedia";
import { type SuggestionCategory } from "@/lib/suggestions/categories";
import type { ChatMediaItem, Suggestion } from "@/types/database";

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

  // 카테고리 선택 제거 — 게시판이 "건의" 하나로 좁혀졌다. 새 글은 nightflow(건의)로
  // 고정하고, 기존 글을 수정할 때는 원래 값을 그대로 보존한다(분류 데이터는 남겨둔다).
  const category: SuggestionCategory =
    (suggestion?.category as SuggestionCategory) ?? "nightflow";

  const [title, setTitle] = useState(suggestion?.title ?? "");
  const [content, setContent] = useState(suggestion?.content ?? "");
  const [isPrivate, setIsPrivate] = useState(suggestion?.is_private ?? false);
  const [media, setMedia] = useState<ChatMediaItem[]>(suggestion?.media ?? []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    !submitted &&
    !uploading;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    const slotsLeft = SUGGESTION_MEDIA_MAX_COUNT - media.length;
    if (slotsLeft <= 0) {
      toast.error(`사진/동영상은 최대 ${SUGGESTION_MEDIA_MAX_COUNT}개까지 첨부할 수 있어요`);
      return;
    }
    const toUpload = Array.from(files).slice(0, slotsLeft);
    if (files.length > toUpload.length) {
      toast.error(`최대 ${SUGGESTION_MEDIA_MAX_COUNT}개까지만 첨부돼요`);
    }

    setUploading(true);
    const uploaded = await Promise.all(
      toUpload.map((f) => uploadSuggestionMedia(f, user.id))
    );
    const ok = uploaded.filter((m): m is ChatMediaItem => m !== null);
    setMedia((prev) => [...prev, ...ok].slice(0, SUGGESTION_MEDIA_MAX_COUNT));
    setUploading(false);
  }

  function removeMedia(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!user || !canSubmit) return;
    setSubmitting(true);

    const supabase = createClient();
    const payload = {
      title: title.trim(),
      content: content.trim(),
      category,
      // 관리자만 보기는 나플 건의에만 — 클럽 문화·문제 제보는 항상 공개
      is_private: isPrivate,
      media,
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
          placeholder=""
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

        {/* 사진/동영상 첨부 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-card border border-border shrink-0"
            >
              {m.type === "video" ? (
                <div className="relative w-full h-full bg-black">
                  {/* 첫 프레임을 썸네일로 (#t=0.1로 프레임 강제 로드) */}
                  <video
                    src={`${m.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white drop-shadow" fill="currentColor" />
                  </span>
                </div>
              ) : (
                <Image src={m.url} alt="" fill sizes="64px" className="object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeMedia(i)}
                disabled={submitted}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white"
                aria-label="첨부 삭제"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* 업로드 중 스켈레톤 타일 — 정적 대신 스피너+펄스로 진행 중임을 명확히 */}
          {uploading && (
            <div className="w-16 h-16 rounded-xl border border-border bg-muted flex flex-col items-center justify-center gap-1 shrink-0 animate-pulse">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              <span className="text-[9px] font-bold text-muted-foreground">업로드중</span>
            </div>
          )}
          {media.length < SUGGESTION_MEDIA_MAX_COUNT && !uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitted}
              className="w-16 h-16 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground disabled:opacity-60 shrink-0"
            >
              <ImagePlus className="w-5 h-5" />
              <span className="text-[10px] font-bold">{media.length}/{SUGGESTION_MEDIA_MAX_COUNT}</span>
            </button>
          )}
        </div>
        {uploading && (
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            업로드 중이에요. 동영상은 크기에 따라 시간이 걸릴 수 있어요.
          </p>
        )}

        {/* 관리자만 보기 — 게시판 전체가 건의로 좁혀져 카테고리 조건 없이 항상 노출 */}
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
