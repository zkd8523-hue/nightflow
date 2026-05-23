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
  initialName: string;
  initialAddress: string;
  initialOperatingHours: string;
  initialEntryFeeDetail: string;
  initialInstagram: string;
  onSaved: (next: {
    tags: string[];
    name: string;
    address: string;
    operatingHours: string;
    entryFeeDetail: string;
    instagram: string;
  }) => void;
}

export function ClubProfileEditor({ clubId, initialTags, initialName, initialAddress, initialOperatingHours, initialEntryFeeDetail, initialInstagram, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [operatingHours, setOperatingHours] = useState(initialOperatingHours);
  const [entryFeeDetail, setEntryFeeDetail] = useState(initialEntryFeeDetail);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [saving, setSaving] = useState(false);

  // URL/@ 제거하고 핸들만 추출
  const normalizeInstagramHandle = (raw: string): string => {
    let v = raw.trim();
    if (!v) return "";
    v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
    v = v.replace(/^@/, "");
    v = v.split(/[/?#]/)[0];
    return v.trim();
  };

  const reset = () => {
    setTags(initialTags);
    setName(initialName);
    setAddress(initialAddress);
    setOperatingHours(initialOperatingHours);
    setEntryFeeDetail(initialEntryFeeDetail);
    setInstagram(initialInstagram);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error("클럽명을 입력해주세요"); return; }
    setSaving(true);
    try {
      // 기본 정보 변경 (name + address + operating_hours + entry_fee_detail + instagram)
      const trimmedAddress = address.trim();
      const trimmedHours = operatingHours.trim();
      const trimmedFee = entryFeeDetail.trim();
      const trimmedInstagram = normalizeInstagramHandle(instagram);
      const baseChanged = trimmedName !== initialName
        || trimmedAddress !== initialAddress
        || trimmedHours !== initialOperatingHours
        || trimmedFee !== initialEntryFeeDetail
        || trimmedInstagram !== initialInstagram;
      if (baseChanged) {
        const res = await fetch(`/api/admin/clubs/update-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clubId,
            name: trimmedName,
            address: trimmedAddress,
            operating_hours: trimmedHours,
            entry_fee_detail: trimmedFee,
            instagram: trimmedInstagram,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.error(j.error || "기본 정보 변경 실패"); return;
        }
      }
      // 주소가 변경됐다면 geocoding → 좌표 저장 (실패해도 다음 단계 진행)
      if (trimmedAddress && trimmedAddress !== initialAddress) {
        try {
          const geoRes = await fetch("/api/admin/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: trimmedAddress }),
          });
          if (geoRes.ok) {
            const geo = await geoRes.json() as { lat: number; lng: number };
            await fetch("/api/admin/clubs/update-coords", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clubId, lat: geo.lat, lng: geo.lng }),
            });
          } else {
            toast.warning("좌표 변환 실패 (주소만 저장됨)");
          }
        } catch (geoErr) {
          console.warn("[geocode]", geoErr);
        }
      }

      // 태그 변경
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
      onSaved({
        tags: json.tags ?? tags,
        name: trimmedName,
        address: trimmedAddress,
        operatingHours: trimmedHours,
        entryFeeDetail: trimmedFee,
        instagram: trimmedInstagram,
      });
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
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">클럽명</div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">주소</div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 강남구 도산대로 539 B1"
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">영업시간</div>
              <input
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                placeholder="예: 금/토 22:00-05:00"
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">입장료 상세</div>
              <input
                type="text"
                value={entryFeeDetail}
                onChange={(e) => setEntryFeeDetail(e.target.value)}
                placeholder="예: 남 15,000 / 여 10,000"
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-[10px] text-neutral-600 mt-1">남녀별·요일별 차등 있으면 자유롭게 입력</p>
            </div>
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">공식 인스타그램</div>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="핸들 또는 URL (예: coreseoul)"
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-[10px] text-neutral-600 mt-1">@, URL 입력해도 자동으로 핸들만 추출됨</p>
            </div>
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
