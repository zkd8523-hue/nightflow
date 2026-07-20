"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import type { HotdealTemplate } from "@/types/database";
import { Bookmark, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  mdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: HotdealTemplate) => void;
}

export function HotdealTemplateSelector({ mdId, open, onOpenChange, onSelect }: Props) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<HotdealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("hotdeal_templates")
      .select("*, club:clubs(id, name, area)")
      .eq("md_id", mdId)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setTemplates((data ?? []) as HotdealTemplate[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("hotdeal_templates").delete().eq("id", id);
    if (error) {
      toast.error("삭제에 실패했어요");
    } else {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("템플릿이 삭제됐어요");
    }
    setDeleting(null);
  };

  const formatTemplateName = (t: HotdealTemplate) => {
    const price = t.price ? `${Math.round(t.price / 10000)}만원` : "";
    const liquor = t.liquor_includes?.[0] || "";
    const table = t.table_info || "";
    return [price, liquor, table].filter(Boolean).join(" / ") || t.name;
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
            <p className="text-muted-foreground text-sm">저장된 템플릿이 없어요</p>
            <p className="text-muted-foreground text-xs mt-1">핫딜 등록 후 &quot;템플릿으로 저장?&quot; 에서 추가할 수 있어요</p>
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
                    {template.original_price && template.price
                      ? ` · ${Math.round((1 - template.price / template.original_price) * 100)}% 할인`
                      : ""}
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
