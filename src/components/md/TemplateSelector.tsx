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
    // 저장 시 지정한 이름이 있으면 그대로 사용, 없을 때만 자동 조합으로 대체
    if (t.name && t.name.trim()) return t.name;
    const price = t.price_per_seat ? `${Math.round(t.price_per_seat / 10000)}만원` : "";
    const alcohol = t.main_alcohol || "";
    const seats = t.total_seats ? `파티${t.total_seats}` : "";
    return [price, alcohol, seats].filter(Boolean).join("/") || "템플릿";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-10 max-h-[80vh]">
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-foreground text-lg flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-brand-amber" />
            템플릿에서 생성
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-amber" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">저장된 템플릿이 없습니다.</p>
            <p className="text-muted-foreground text-xs mt-1">등록 후 "템플릿으로 저장?"을 선택하면 추가됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-[60vh]">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    onSelect(template);
                    onOpenChange(false);
                  }}
                >
                  <p className="text-foreground font-semibold text-sm">{formatTemplateName(template)}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {template.club?.name || "클럽 미지정"}
                    {template.total_seats ? ` · ${template.total_seats}인` : ""}
                    {template.price_per_seat ? ` · 인당 ${formatNumber(template.price_per_seat)}원` : ""}
                  </p>
                </button>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                    disabled={deleting === template.id}
                  >
                    {deleting === template.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
