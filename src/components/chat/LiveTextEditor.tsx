"use client";

import { useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { TextOverlay } from "@/types/database";

const COLORS = ["#ffffff", "#000000", "#EF4444", "#F59E0B", "#22C55E", "#3B82F6", "#A855F7", "#EC4899"];

interface Props {
  /** 편집할 오버레이 (신규면 빈 text) */
  initial: TextOverlay;
  onDone: (overlay: TextOverlay) => void;
  onCancel: () => void;
  onDelete: () => void;
}

/**
 * 인스타식 텍스트 오버레이 편집 모달.
 * - 중앙 텍스트 입력 (자동 포커스)
 * - 색상 팔레트 + 크기 슬라이더
 * - 완료하면 오버레이 반환 (위치는 LiveEditView에서 드래그로 조정)
 */
export function LiveTextEditor({ initial, onDone, onCancel, onDelete }: Props) {
  const [text, setText] = useState(initial.text);
  const [color, setColor] = useState(initial.color);
  const [fontScale, setFontScale] = useState(initial.fontScale);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleDone() {
    const trimmed = text.trim();
    if (!trimmed) {
      onDelete();
      return;
    }
    onDone({ ...initial, text: trimmed, color, fontScale });
  }

  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex flex-col">
      {/* 상단 바 */}
      <div className="flex items-center justify-between p-4 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="text-foreground/80 text-[15px] font-bold"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleDone}
          className="flex items-center gap-1 text-foreground text-[15px] font-black"
        >
          <Check className="w-5 h-5" />
          완료
        </button>
      </div>

      {/* 중앙 텍스트 입력 */}
      <div className="flex-1 flex items-center justify-center px-8">
        <textarea
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="텍스트 입력"
          rows={2}
          maxLength={100}
          className="w-full bg-transparent text-center resize-none focus:outline-none placeholder:text-foreground/40 font-black leading-tight"
          style={{
            color,
            fontSize: `${28 * fontScale}px`,
            textShadow: color === "#000000" ? "0 1px 4px rgba(255,255,255,0.4)" : "0 1px 6px rgba(0,0,0,0.5)",
          }}
        />
      </div>

      {/* 하단: 크기 슬라이더 + 색상 팔레트 */}
      <div className="p-4 pb-8 space-y-4">
        {/* 크기 */}
        <div className="flex items-center gap-3">
          <span className="text-foreground/60 text-[11px] w-8">작게</span>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={fontScale}
            onChange={(e) => setFontScale(parseFloat(e.target.value))}
            className="flex-1 accent-white"
          />
          <span className="text-foreground/60 text-[11px] w-8 text-right">크게</span>
        </div>

        {/* 색상 */}
        <div className="flex items-center justify-center gap-2.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${
                color === c ? "ring-2 ring-white scale-110" : ""
              }`}
              style={{ backgroundColor: c, border: c === "#ffffff" ? "1px solid #666" : "none" }}
              aria-label={`색상 ${c}`}
            />
          ))}
        </div>

        {/* 삭제 (기존 오버레이 편집 시) */}
        {initial.text && (
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-1.5 text-red-400 text-[13px] font-bold py-2"
          >
            <Trash2 className="w-4 h-4" />
            텍스트 삭제
          </button>
        )}
      </div>
    </div>
  );
}
