"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { buildAcceptedFlagMessage } from "@/lib/utils/puzzleMessage";

interface Props {
  puzzle: {
    id: string;
    event_date: string;
    area: string;
    target_count: number;
    current_count: number;
    is_recruiting_party: boolean;
  };
  offer: {
    proposed_price: number;
    includes: string[];
    club?: { name: string } | null;
  } | null | undefined;
}

export function CopyAcceptedMessageButton({ puzzle, offer }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const msg = buildAcceptedFlagMessage(puzzle, offer, window.location.origin);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      toast.success("메시지가 복사됐어요. MD에게 붙여넣으세요!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full h-12 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-black text-[14px] rounded-2xl transition-colors"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "복사됐어요!" : "메세지 복사"}
    </button>
  );
}
