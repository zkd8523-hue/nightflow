"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import type { MdOfferPreset } from "@/types/database";
import { Bookmark, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OfferPresetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 템플릿 적용 콜백 — OfferSheet 폼을 채운다 */
  onApply: (preset: MdOfferPreset) => void;
}

// 저장한 오퍼 템플릿을 불러오는 시트 (저장은 제안서 전송 직후 프롬프트에서 처리)
export function OfferPresetSheet({ open, onOpenChange, onApply }: OfferPresetSheetProps) {
  const supabase = createClient();
  const [presets, setPresets] = useState<MdOfferPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPresets = async () => {
    setLoading(true);
    // RLS가 md_id = auth.uid()로 이미 제한 → 별도 필터 불필요
    const { data } = await supabase
      .from("md_offer_presets")
      .select("*, club:clubs(name, area)")
      .order("created_at", { ascending: false });
    setPresets((data ?? []) as MdOfferPreset[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("md_offer_presets").delete().eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요");
    } else {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      toast.success("템플릿을 삭제했어요");
    }
    setDeleting(null);
  };

  const presetSummary = (p: MdOfferPreset) => {
    const parts: string[] = [];
    if (p.club?.name) parts.push(p.club.name);
    if (p.includes.length > 0) parts.push(`구성 ${p.includes.length}개`);
    if (p.comment) parts.push("코멘트");
    return parts.join(" · ") || "구성 없음";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl px-5 pb-10 max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader className="text-left pb-3 p-0">
          <SheetTitle className="text-white text-[17px] font-black flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-400" />
            템플릿 불러오기
          </SheetTitle>
          <p className="text-[12px] text-neutral-500">저장한 구성을 탭 한 번으로 채워요. (저장은 제안서 보낼 때 물어봐요)</p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : presets.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">저장된 템플릿이 없어요.</p>
            <p className="text-neutral-600 text-xs mt-1">제안서를 보낼 때 &lsquo;템플릿으로 저장&rsquo;을 누르면 여기에 쌓여요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between bg-neutral-900 rounded-xl px-4 py-3"
              >
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => {
                    onApply(preset);
                    onOpenChange(false);
                  }}
                >
                  <p className="text-white font-bold text-[14px] truncate">{preset.name}</p>
                  <p className="text-neutral-500 text-[12px] mt-0.5 truncate">{presetSummary(preset)}</p>
                </button>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => handleDelete(preset.id)}
                    className="text-neutral-600 hover:text-red-400 transition-colors p-1"
                    disabled={deleting === preset.id}
                    aria-label="템플릿 삭제"
                  >
                    {deleting === preset.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  <ChevronRight className="w-4 h-4 text-neutral-600" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
