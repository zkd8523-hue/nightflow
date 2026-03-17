"use client";

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bookmark, Trash2, Pencil, Check, X } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import type { AuctionTemplate } from "@/types/database";
import { logger } from "@/lib/utils/logger";

interface TemplateDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (template: AuctionTemplate) => void;
}

export function TemplateDrawer({ isOpen, onOpenChange, onApply }: TemplateDrawerProps) {
  const [templates, setTemplates] = useState<(AuctionTemplate & { club?: { name: string; area: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 인라인 이름 편집
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTemplates(data);
    } catch {
      toast.error("템플릿 불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen, fetchTemplates]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success("템플릿이 삭제되었습니다.");
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleApply = (template: AuctionTemplate) => {
    onApply(template);
    onOpenChange(false);

    // last_used_at 업데이트 (fire-and-forget)
    fetch("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: template.id }),
    }).catch(logger.error);
  };

  const startEditing = (template: AuctionTemplate & { club?: { name: string; area: string } | null }) => {
    setEditingId(template.id);
    setEditingName(template.name);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEditingName = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    const original = templates.find(t => t.id === editingId)?.name;

    if (!trimmed || trimmed === original) {
      cancelEditing();
      return;
    }

    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: trimmed }),
      });
      if (!res.ok) throw new Error();
      setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, name: trimmed } : t));
      toast.success("이름이 변경되었습니다.");
    } catch {
      toast.error("이름 변경에 실패했습니다.");
    } finally {
      cancelEditing();
    }
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditingName();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1C1C1E] border-neutral-800 outline-none px-4 pb-8 max-h-[80svh]">
        <DrawerHeader className="text-left px-2">
          <DrawerTitle className="text-white font-black text-lg">
            내 템플릿
          </DrawerTitle>
          <DrawerDescription className="text-neutral-500 text-[12px]">
            저장된 설정을 선택하면 폼에 자동 적용됩니다
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto space-y-2 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <Bookmark className="w-10 h-10 text-neutral-700 mx-auto" />
              <div className="space-y-1">
                <p className="text-neutral-400 font-bold text-sm">저장된 템플릿이 없어요.</p>
                <p className="text-neutral-600 text-[12px] leading-relaxed">
                  경매를 등록하면<br />
                  &quot;템플릿으로 저장&quot; 버튼이 나타나요.
                </p>
                <p className="text-neutral-600 text-[12px] leading-relaxed mt-2">
                  자주 쓰는 설정을 저장하고<br />
                  다음엔 한 번에 불러오세요!
                </p>
              </div>
            </div>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="bg-neutral-900/80 border border-neutral-800/50 rounded-xl p-4 space-y-3"
              >
                {/* 상단: 이름 + 액션 아이콘 */}
                <div className="flex items-center gap-2">
                  {editingId === template.id ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        ref={editInputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={saveEditingName}
                        onKeyDown={handleEditKeyDown}
                        className="flex-1 min-w-0 bg-neutral-800 text-white font-bold text-[14px] rounded-lg px-3 py-1.5 outline-none ring-1 ring-neutral-600 focus:ring-green-500"
                        maxLength={30}
                      />
                      <button
                        type="button"
                        onClick={saveEditingName}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-white font-bold text-[14px] truncate flex-1 min-w-0">
                        {template.name}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startEditing(template); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-600 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
                        aria-label="이름 수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(template.id)}
                        disabled={deletingId === template.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 disabled:opacity-50"
                        aria-label="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* 하단: 메타 정보 + 적용 버튼 */}
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-medium">
                      {template.club?.name && <span>{template.club.name}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      {template.start_price ? (
                        <span>{formatPrice(template.start_price)}</span>
                      ) : null}
                      {template.start_price && template.includes?.length > 0 && (
                        <span className="text-neutral-700">·</span>
                      )}
                      {template.includes?.length > 0 && (
                        <span className="truncate">
                          {template.includes.slice(0, 2).join(", ")}
                          {template.includes.length > 2 ? ` +${template.includes.length - 2}` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleApply(template)}
                    className="h-9 px-5 bg-white text-black font-black text-[12px] rounded-full hover:bg-neutral-200 shrink-0"
                  >
                    적용
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
