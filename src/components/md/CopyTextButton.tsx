"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// 정산 화면 "계좌 복사" — 누르면 계좌번호만 복사한다(은행 앱 붙여넣기용).
export function CopyTextButton({ text, label, doneLabel = "복사됨" }: { text: string; label: string; doneLabel?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-inverse text-inverse-foreground text-[13px] font-black active:scale-95 transition-transform"
    >
      {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {done ? doneLabel : label}
    </button>
  );
}
