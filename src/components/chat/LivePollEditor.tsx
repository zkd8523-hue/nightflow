"use client";

import { useState } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import type { ShotPoll, PollOption } from "@/types/database";

interface Props {
  initial: ShotPoll | null;
  onDone: (poll: ShotPoll) => void;
  onCancel: () => void;
  onDelete: () => void;
}

let optSeq = 0;
function newOptionId() {
  optSeq += 1;
  return `opt_${optSeq}_${performance.now().toFixed(0)}`;
}

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;

/**
 * LIVE 설문 편집 모달 (Migration 422)
 * - 질문 + 2~4개 옵션. 게시 시 chat_shots.poll에 저장.
 */
export function LivePollEditor({ initial, onDone, onCancel, onDelete }: Props) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState<PollOption[]>(
    initial?.options ?? [
      { id: newOptionId(), text: "" },
      { id: newOptionId(), text: "" },
    ]
  );

  function setOptionText(id: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, { id: newOptionId(), text: "" }]);
  }
  function removeOption(id: string) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  const filled = options.filter((o) => o.text.trim().length > 0);
  const canSave = question.trim().length > 0 && filled.length >= MIN_OPTIONS;

  function handleDone() {
    if (!canSave) return;
    onDone({
      id: initial?.id ?? `poll_${performance.now().toFixed(0)}`,
      question: question.trim(),
      // 빈 옵션 제거
      options: options
        .filter((o) => o.text.trim().length > 0)
        .map((o) => ({ id: o.id, text: o.text.trim() })),
    });
  }

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-[16px] font-black">설문 만들기</h3>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 질문 */}
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="질문을 입력하세요 (예: 오늘 여기 어때요?)"
          maxLength={60}
          className="w-full bg-card border border-border rounded-xl px-3 py-3 text-foreground text-[15px] font-bold placeholder:text-muted-foreground focus:outline-none focus:border-border"
        />

        {/* 옵션 */}
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="w-6 text-center text-[13px] font-black text-muted-foreground">
                {i + 1}
              </span>
              <input
                type="text"
                value={o.text}
                onChange={(e) => setOptionText(o.id, e.target.value)}
                placeholder={`선택지 ${i + 1}`}
                maxLength={30}
                className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-foreground text-[14px] placeholder:text-muted-foreground focus:outline-none focus:border-border"
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(o.id)}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label="선택지 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground px-2 py-1.5"
            >
              <Plus className="w-4 h-4" />
              선택지 추가
            </button>
          )}
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDone}
            disabled={!canSave}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full bg-inverse text-inverse-foreground text-[15px] font-black disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            {initial ? "수정" : "추가"}
          </button>
          {initial && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-3 rounded-full bg-red-500/15 text-red-400 text-[14px] font-bold"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
