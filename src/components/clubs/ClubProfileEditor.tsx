"use client";

import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CLUB_TAG_GROUPS, makeTag } from "@/lib/clubs/tags";

interface Props {
  clubId: string;
  initialTags: string[];
  onSaved: (newTags: string[]) => void;
}

export function ClubProfileEditor({ clubId, initialTags, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [saving, setSaving] = useState(false);

  const reset = () => setTags(initialTags);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clubs/update-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, tags }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "저장 실패");
        return;
      }
      onSaved(json.tags ?? tags);
      toast.success("클럽 프로필이 저장됐어요");
      setOpen(false);
    } catch (err) {
      console.error("[ClubProfileEditor]", err);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#1C1C1E] hover:bg-neutral-900 border border-dashed border-neutral-700 rounded-xl text-[12px] font-bold text-neutral-300 hover:text-white transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        클럽 프로필 편집 (admin)
      </button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl max-w-lg mx-auto p-0 max-h-[90vh] flex flex-col"
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-neutral-800">
            <SheetTitle className="text-white text-[16px] font-black flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-400" />
              클럽 프로필 편집
            </SheetTitle>
            <p className="text-[11px] text-neutral-500 text-left">
              체크한 태그는 클럽 상세 페이지·카드에 노출돼요. 여러 개 선택 가능.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {CLUB_TAG_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="text-[12px] text-neutral-400 font-bold mb-2 flex items-center gap-1.5">
                  {g.emoji} {g.label}
                  {g.isFilter && (
                    <span className="text-[10px] text-blue-400 font-medium">
                      (필터)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((opt) => {
                    const tag = makeTag(g.group, opt.key);
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        disabled={saving}
                        className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors ${
                          active
                            ? "bg-white text-black"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 pt-3 pb-5 border-t border-neutral-800 flex gap-2 bg-[#0A0A0A]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="flex-1 h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[14px]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
