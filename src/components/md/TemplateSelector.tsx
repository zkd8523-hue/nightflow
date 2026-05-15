"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import type { AuctionTemplate } from "@/types/database";
import { formatNumber } from "@/lib/utils/format";
import { Bookmark, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TemplateSelectorProps {
  mdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: AuctionTemplate) => void;
}

export function TemplateSelector({ mdId, open, onOpenChange, onSelect }: TemplateSelectorProps) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<AuctionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("auction_templates")
      .select("*, club:clubs(name, area)")
      .eq("md_id", mdId)
      .order("created_at", { ascending: false });
    setTemplates((data ?? []) as AuctionTemplate[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("auction_templates").delete().eq("id", id);
    if (error) {
      toast.error("삭제에 실패했습니다.");
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("템플릿이 삭제되었습니다.");
    }
    setDeleting(null);
  };

  const formatTemplateName = (t: AuctionTemplate) => {
    const price = t.price_per_seat ? `${Math.round(t.price_per_seat / 10000)}만원` : "";
    const alcohol = t.main_alcohol || "";
    const seats = t.total_seats ? `조각${t.total_seats}` : "";
    return [price, alcohol, seats].filter(Boolean).join("/") || t.name;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-10 max-h-[80vh]">
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-white text-lg flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-400" />
            템플릿에서 생성
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">저장된 템플릿이 없습니다.</p>
            <p className="text-neutral-600 text-xs mt-1">등록 후 "템플릿으로 저장?"을 선택하면 추가됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-[60vh]">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between bg-neutral-900 rounded-xl px-4 py-3"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    onSelect(template);
                    onOpenChange(false);
                  }}
                >
                  <p className="text-white font-semibold text-sm">{formatTemplateName(template)}</p>
                  <p className="text-neutral-500 text-xs mt-0.5">
                    {template.club?.name || "클럽 미지정"}
                    {template.total_seats ? ` · ${template.total_seats}인` : ""}
                    {template.price_per_seat ? ` · 인당 ${formatNumber(template.price_per_seat)}원` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="text-neutral-600 hover:text-red-400 transition-colors p-1"
                    disabled={deleting === template.id}
                  >
                    {deleting === template.id ? (
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
