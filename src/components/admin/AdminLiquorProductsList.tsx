"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { LIQUOR_CATEGORIES } from "@/lib/constants/liquor";
import { formatPriceBucket } from "@/lib/utils/format";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { LiquorProduct } from "@/types/database";

interface AdminLiquorProductsListProps {
  initialProducts: LiquorProduct[];
}

const emptyForm = {
  name: "",
  category: LIQUOR_CATEGORIES[0].key as string,
  aliases: "",
  description: "",
  origin: "",
  abv: "",
  accolade: "",
  price_min: "",
  price_max: "",
  is_active: true,
  source: "manual" as LiquorProduct["source"],
};

export function AdminLiquorProductsList({ initialProducts }: AdminLiquorProductsListProps) {
  const supabase = createClient();
  const [products, setProducts] = useState<LiquorProduct[]>(initialProducts);
  const [editing, setEditing] = useState<LiquorProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setOpen(true);
  };

  const openEdit = (p: LiquorProduct) => {
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category,
      aliases: p.aliases.join(", "),
      description: p.description ?? "",
      origin: p.origin ?? "",
      abv: p.abv?.toString() ?? "",
      accolade: p.accolade ?? "",
      price_min: p.price_min?.toString() ?? "",
      price_max: p.price_max?.toString() ?? "",
      is_active: p.is_active,
      source: p.source,
    });
    setImageFile(null);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("이름을 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      let imageUrl = editing?.image_url ?? null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const path = `${editing?.id ?? crypto.randomUUID()}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("liquor-products")
          .upload(path, imageFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("liquor-products").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }

      const payload = {
        name: form.name.trim(),
        category: form.category,
        aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
        description: form.description.trim() || null,
        origin: form.origin.trim() || null,
        abv: form.abv ? Number(form.abv) : null,
        accolade: form.accolade.trim() || null,
        price_min: form.price_min ? Number(form.price_min) : null,
        price_max: form.price_max ? Number(form.price_max) : null,
        is_active: form.is_active,
        source: form.source,
        image_url: imageUrl,
      };

      if (editing) {
        const { data, error } = await supabase
          .from("liquor_products")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (error) throw error;
        setProducts((prev) => prev.map((p) => (p.id === editing.id ? (data as LiquorProduct) : p)));
        toast.success("수정되었습니다");
      } else {
        const { data, error } = await supabase
          .from("liquor_products")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setProducts((prev) => [...prev, data as LiquorProduct]);
        toast.success("등록되었습니다");
      }
      setOpen(false);
    } catch (error: unknown) {
      logError(error, "AdminLiquorProductsList.handleSave");
      toast.error(getErrorMessage(error) || "저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: LiquorProduct) => {
    if (!confirm(`"${p.name}" 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("liquor_products").delete().eq("id", p.id);
    if (error) {
      toast.error("삭제에 실패했습니다");
      return;
    }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("삭제되었습니다");
  };

  return (
    <div className="space-y-4">
      <Button onClick={openCreate} className="w-full bg-inverse text-inverse-foreground font-black rounded-full">
        <Plus className="w-4 h-4 mr-1" /> 주류 추가
      </Button>

      <div className="space-y-2">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            {p.image_url ? (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-card shrink-0">
                <Image src={p.image_url} alt={p.name} fill className="object-cover" sizes="48px" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-card shrink-0 flex items-center justify-center text-lg">
                🍾
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-foreground truncate">
                {p.name} {!p.is_active && <span className="text-muted-foreground">(비활성)</span>}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {LIQUOR_CATEGORIES.find((c) => c.key === p.category)?.label ?? p.category}
                {formatPriceBucket(p.price_min, p.price_max) && ` · ${formatPriceBucket(p.price_min, p.price_max)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openEdit(p)}
              className="w-8 h-8 rounded-full bg-card flex items-center justify-center shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(p)}
              className="w-8 h-8 rounded-full bg-card flex items-center justify-center shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        ))}
        {products.length === 0 && (
          <p className="text-center text-[13px] text-muted-foreground py-8">등록된 주류가 없습니다</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editing ? "주류 수정" : "주류 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="이름 (예: 돔 페리뇽)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIQUOR_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.emoji} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="추가 매칭 문자열 (콤마로 구분, 예: 돔페, dom)"
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            />
            <Textarea
              placeholder="한줄 설명 (매력적으로, 맛/향 위주)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                placeholder="원산지 (예: 프랑스)"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
              />
              <Input
                type="number"
                step="0.1"
                placeholder="도수 (%)"
                value={form.abv}
                onChange={(e) => setForm({ ...form, abv: e.target.value })}
              />
            </div>
            <Textarea
              placeholder="역사/평판 한 줄 (근거 있을 때만, 없으면 비워두기)"
              value={form.accolade}
              onChange={(e) => setForm({ ...form, accolade: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="최저가 (원)"
                value={form.price_min}
                onChange={(e) => setForm({ ...form, price_min: e.target.value })}
              />
              <Input
                type="number"
                placeholder="최고가 (원, 비우면 오픈구간)"
                value={form.price_max}
                onChange={(e) => setForm({ ...form, price_max: e.target.value })}
              />
            </div>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as LiquorProduct["source"] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="club_menu">클럽 가격표 확인</SelectItem>
                <SelectItem value="external">외부 조사</SelectItem>
                <SelectItem value="manual">수동 입력</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="text-[12px] text-muted-foreground"
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              활성화 (오퍼 화면에 노출)
            </label>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
