"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Flag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface Props {
  clubId: string;
  clubName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "operating_hours", label: "영업시간" },
  { key: "tags", label: "음악·연령대·흡연 등 태그" },
  { key: "dresscode", label: "드레스코드" },
  { key: "address", label: "주소·위치" },
  { key: "other", label: "기타" },
];

export function ClubInfoReportSheet({ clubId, clubName, open, onOpenChange }: Props) {
  const { user } = useCurrentUser();
  const [category, setCategory] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCategory("");
    setMessage("");
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("로그인 후 이용해주세요");
      return;
    }
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      toast.error("어떤 정보가 틀린지 5자 이상 적어주세요");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("club_info_reports").insert({
        club_id: clubId,
        reporter_id: user.id,
        category: category || "other",
        message: trimmed,
      });
      if (error) {
        toast.error(error.message || "신고 접수 실패");
        return;
      }
      toast.success("신고 접수됐어요. 검토 후 반영됩니다");
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl max-w-lg mx-auto p-0 max-h-[80vh] flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-foreground text-[16px] font-black flex items-center gap-2">
            <Flag className="w-4 h-4 text-brand-amber" />
            틀린 정보 신고
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground text-left">
            {clubName} 정보 중 잘못된 부분을 알려주세요. 검토 후 반영됩니다.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <div className="text-[12px] text-muted-foreground font-bold mb-2">
              어떤 정보가 잘못됐나요? <span className="text-muted-foreground font-normal">(선택)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(category === c.key ? "" : c.key)}
                  disabled={submitting}
                  className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors ${
                    category === c.key
                      ? "bg-inverse text-inverse-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[12px] text-muted-foreground font-bold mb-2">
              자세한 내용 <span className="text-red-400">*</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예: 영업시간이 실제로는 22:00부터 시작해요"
              rows={4}
              maxLength={500}
              disabled={submitting}
              className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{message.length}/500</p>
          </div>
        </div>

        <div className="px-5 pt-3 pb-5 border-t border-border flex gap-2 bg-background">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="flex-1 h-11 rounded-full bg-muted hover:bg-muted text-foreground font-bold text-[14px]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || message.trim().length < 5}
            className="flex-1 h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            신고 보내기
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
