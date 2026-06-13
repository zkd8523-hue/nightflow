"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Pencil, Loader2, Wine, Trash2, GripVertical, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CLUB_TAG_GROUPS, makeTag, parseTag } from "@/lib/clubs/tags";
import { updateClubPartnerFields } from "@/lib/clubs/update";
import { createClient } from "@/lib/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  clubId: string;
  initialTags: string[];
  initialName: string;
  initialAddress: string;
  initialOperatingHours: string;
  initialEntryFeeDetail: string;
  initialInstagram: string;
  initialAliases?: string[];
  initialDresscode?: string;
  initialDrinkMenuUrl?: string | null;
  initialDrinkMenuUrls?: string[];
  /** "admin": 모든 필드 편집 (기존). "partner": tags + operating_hours + dresscode만 즉시 저장. */
  mode?: "admin" | "partner";
  /** 외부에서 트리거된 open 상태 (트리거 버튼 안 쓰고 인라인/배너에서 열 때) */
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  /** mode="partner" 일 때 자체 트리거 버튼 숨김 */
  hideTrigger?: boolean;
  onSaved: (next: {
    tags: string[];
    name: string;
    address: string;
    operatingHours: string;
    entryFeeDetail: string;
    instagram: string;
    aliases: string[];
    dresscode: string;
    drinkMenuUrl: string | null;
    drinkMenuUrls: string[];
  }) => void;
}

export function ClubProfileEditor({ clubId, initialTags, initialName, initialAddress, initialOperatingHours, initialEntryFeeDetail, initialInstagram, initialAliases = [], initialDresscode = "", initialDrinkMenuUrl = null, initialDrinkMenuUrls, mode = "admin", externalOpen, onExternalOpenChange, hideTrigger = false, onSaved }: Props) {
  const isPartnerMode = mode === "partner";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onExternalOpenChange) onExternalOpenChange(v);
    if (externalOpen === undefined) setInternalOpen(v);
  };
  const [tags, setTags] = useState<string[]>(initialTags);
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [operatingHours, setOperatingHours] = useState(initialOperatingHours);
  const [entryFeeDetail, setEntryFeeDetail] = useState(initialEntryFeeDetail);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [aliasInput, setAliasInput] = useState("");
  const [dresscode, setDresscode] = useState(initialDresscode);
  // 다중 사진 우선. 없으면 단일 URL에서 폴백.
  const [drinkMenuUrls, setDrinkMenuUrls] = useState<string[]>(
    () => (initialDrinkMenuUrls && initialDrinkMenuUrls.length > 0)
      ? initialDrinkMenuUrls
      : (initialDrinkMenuUrl ? [initialDrinkMenuUrl] : [])
  );
  const [drinkMenuUploading, setDrinkMenuUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 라이트박스: 미리보기에서 클릭하면 확대해서 보기
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // 하위 호환: 첫 번째 url을 단일 슬롯으로도 노출
  const drinkMenuUrl = drinkMenuUrls[0] ?? null;

  const MAX_DRINK_MENUS = 8;

  const handleDrinkMenuUpload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (drinkMenuUrls.length + list.length > MAX_DRINK_MENUS) {
      toast.error(`최대 ${MAX_DRINK_MENUS}장까지 등록할 수 있어요`);
      return;
    }
    for (const f of list) {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name}: 이미지는 5MB 이하만 가능합니다`);
        return;
      }
    }
    setDrinkMenuUploading(true);
    try {
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of list) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${clubId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("club-menus")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("club-menus").getPublicUrl(path);
        uploaded.push(pub.publicUrl);
      }
      setDrinkMenuUrls((prev) => [...prev, ...uploaded]);
      toast.success(`가격표 사진 ${uploaded.length}장 업로드 완료. 저장을 눌러주세요`);
    } catch (err) {
      console.error("[drink menu upload]", err);
      toast.error("업로드 실패");
    } finally {
      setDrinkMenuUploading(false);
    }
  };

  const handleDrinkMenuRemove = (url: string) => {
    setDrinkMenuUrls((prev) => prev.filter((u) => u !== url));
  };

  // dnd-kit 센서: 마우스/터치/키보드 모두 지원
  // PointerSensor: 마우스. TouchSensor: 모바일 (longPress 300ms로 스크롤과 분리)
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 라이트박스 ESC + 좌우 키 + body 스크롤 잠금
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowLeft") {
        setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)));
      }
      if (e.key === "ArrowRight") {
        setLightboxIdx((i) =>
          i === null ? null : Math.min(drinkMenuUrls.length - 1, i + 1)
        );
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightboxIdx, drinkMenuUrls.length]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrinkMenuUrls((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const addAlias = (raw: string) => {
    const v = raw.toLowerCase().trim().replace(/\s+/g, " ");
    if (!v) return;
    setAliases((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setAliasInput("");
  };
  const removeAlias = (v: string) => {
    setAliases((prev) => prev.filter((a) => a !== v));
  };

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
    setAliases(initialAliases);
    setAliasInput("");
    setDresscode(initialDresscode);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      // isSingle 그룹: 같은 그룹의 다른 태그는 자동 제거
      const parsed = parseTag(tag);
      if (parsed) {
        const groupDef = CLUB_TAG_GROUPS.find((g) => g.group === parsed.group);
        if (groupDef?.isSingle) {
          const cleared = prev.filter((t) => {
            const p = parseTag(t);
            return p?.group !== parsed.group;
          });
          return [...cleared, tag];
        }
      }
      return [...prev, tag];
    });
  };

  const handleSave = async () => {
    // 파트너 MD 모드: tags + operating_hours만 RPC로 즉시 저장
    if (isPartnerMode) {
      setSaving(true);
      try {
        const trimmedHours = operatingHours.trim();
        const trimmedDresscode = dresscode.trim();
        const tagsChanged =
          tags.length !== initialTags.length || tags.some((t, i) => t !== initialTags[i]);
        const hoursChanged = trimmedHours !== initialOperatingHours;
        const dresscodeChanged = trimmedDresscode !== (initialDresscode ?? "");
        if (!tagsChanged && !hoursChanged && !dresscodeChanged) {
          toast.info("변경된 내용이 없어요");
          setSaving(false);
          return;
        }
        const result = await updateClubPartnerFields(clubId, {
          tags: tagsChanged ? tags : undefined,
          operating_hours: hoursChanged ? trimmedHours : undefined,
          dresscode: dresscodeChanged ? trimmedDresscode : undefined,
        });
        if (!result.success) {
          toast.error(result.error || "저장 실패");
          return;
        }
        onSaved({
          tags,
          name: initialName,
          address: initialAddress,
          operatingHours: trimmedHours,
          entryFeeDetail: initialEntryFeeDetail,
          instagram: initialInstagram,
          aliases: initialAliases,
          dresscode: trimmedDresscode,
          drinkMenuUrl: initialDrinkMenuUrl,
          drinkMenuUrls: initialDrinkMenuUrls ?? (initialDrinkMenuUrl ? [initialDrinkMenuUrl] : []),
        });
        toast.success("저장됐어요");
        setOpen(false);
      } catch (err) {
        console.error("[ClubProfileEditor:partner]", err);
        toast.error("저장 중 오류가 발생했어요");
      } finally {
        setSaving(false);
      }
      return;
    }
    // admin 모드: 기존 로직 그대로
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error("클럽명을 입력해주세요"); return; }
    setSaving(true);
    try {
      // 기본 정보 변경 (name + address + operating_hours + entry_fee_detail + instagram)
      const trimmedAddress = address.trim();
      const trimmedHours = operatingHours.trim();
      const trimmedFee = entryFeeDetail.trim();
      const trimmedInstagram = normalizeInstagramHandle(instagram);
      const aliasesChanged =
        aliases.length !== initialAliases.length ||
        aliases.some((a, i) => a !== initialAliases[i]);
      const baseInitialUrls = (initialDrinkMenuUrls && initialDrinkMenuUrls.length > 0)
        ? initialDrinkMenuUrls
        : (initialDrinkMenuUrl ? [initialDrinkMenuUrl] : []);
      const drinkMenuChanged =
        drinkMenuUrls.length !== baseInitialUrls.length
        || drinkMenuUrls.some((u, i) => u !== baseInitialUrls[i]);
      const baseChanged = trimmedName !== initialName
        || trimmedAddress !== initialAddress
        || trimmedHours !== initialOperatingHours
        || trimmedFee !== initialEntryFeeDetail
        || trimmedInstagram !== initialInstagram
        || aliasesChanged
        || drinkMenuChanged;
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
            aliases,
            drink_menu_urls: drinkMenuUrls,
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
        aliases,
        dresscode: initialDresscode,
        drinkMenuUrl,
        drinkMenuUrls,
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
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#1C1C1E] hover:bg-neutral-900 border border-dashed border-neutral-700 rounded-xl text-[12px] font-bold text-neutral-300 hover:text-white transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          {isPartnerMode ? "클럽 정보 편집" : "클럽 프로필 편집 (admin)"}
        </button>
      )}

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
              {isPartnerMode ? "클럽 정보 편집" : "클럽 프로필 편집"}
            </SheetTitle>
            <p className="text-[11px] text-neutral-500 text-left">
              {isPartnerMode
                ? "영업시간·드레스코드와 음악·연령대·입장료·흡연 태그를 직접 수정할 수 있어요. 변경은 즉시 반영돼요."
                : "체크한 태그는 클럽 상세 페이지·카드에 노출돼요. 여러 개 선택 가능."}
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {!isPartnerMode && (
            <>
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
            </>
            )}

            {/* 영업시간 — admin & partner 모두 편집 가능 */}
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

            {/* 드레스코드 — admin & partner 모두 자유 텍스트 */}
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">드레스코드</div>
              <input
                type="text"
                value={dresscode}
                onChange={(e) => setDresscode(e.target.value)}
                placeholder="예: 캐주얼 OK, 슬리퍼 X"
                disabled={saving}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-[10px] text-neutral-600 mt-1">자유롭게 한 줄로 작성해주세요</p>
            </div>

            {!isPartnerMode && (
            <>
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
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2">검색 별칭</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {aliases.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 bg-neutral-800 text-white text-[11px] font-bold px-2 py-1 rounded-full"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => removeAlias(a)}
                      disabled={saving}
                      className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-neutral-700 text-neutral-400 hover:text-white"
                      aria-label={`${a} 제거`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {aliases.length === 0 && (
                  <span className="text-[11px] text-neutral-600">등록된 별칭이 없어요</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addAlias(aliasInput);
                    }
                  }}
                  placeholder="예: 에이스, ace, club ace"
                  disabled={saving}
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => addAlias(aliasInput)}
                  disabled={saving || !aliasInput.trim()}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-black disabled:opacity-50"
                >
                  추가
                </button>
              </div>
              <p className="text-[10px] text-neutral-600 mt-1">
                자주 잘못 검색되는 표기를 등록해두면 그 검색어로도 노출돼요 (Enter·쉼표로 추가)
              </p>
            </div>

            {/* 가격표 사진 (여러 장) — 클럽 상세에서 슬라이드로 노출됨 */}
            <div>
              <div className="text-[12px] text-neutral-400 font-bold mb-2 flex items-center gap-1.5">
                <Wine className="w-3.5 h-3.5 text-amber-400" /> 가격표 사진
                <span className="text-[10px] text-neutral-600 font-medium">
                  ({drinkMenuUrls.length}/{MAX_DRINK_MENUS})
                </span>
              </div>
              {drinkMenuUrls.length > 0 && (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={drinkMenuUrls} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {drinkMenuUrls.map((url, idx) => (
                        <SortableDrinkMenuItem
                          key={url}
                          url={url}
                          index={idx}
                          onRemove={handleDrinkMenuRemove}
                          onClick={() => setLightboxIdx(idx)}
                          disabled={saving || drinkMenuUploading}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {drinkMenuUrls.length < MAX_DRINK_MENUS && (
                <label className={`flex items-center justify-center gap-2 w-full h-20 border border-dashed border-neutral-700 rounded-xl text-[12px] font-bold text-neutral-400 hover:border-amber-500/50 hover:text-amber-300 hover:bg-amber-500/5 transition-colors ${(saving || drinkMenuUploading) ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                  {drinkMenuUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> 업로드 중…
                    </>
                  ) : (
                    <>
                      <Wine className="w-4 h-4 text-amber-400" />
                      {drinkMenuUrls.length === 0 ? "가격표 사진 업로드" : "사진 추가"}
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={saving || drinkMenuUploading}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleDrinkMenuUpload(e.target.files);
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
              <p className="text-[10px] text-neutral-600 mt-1">메뉴판·가격표 사진을 여러 장 등록할 수 있어요 (최대 {MAX_DRINK_MENUS}장). 드래그로 순서 변경</p>
            </div>
            </>
            )}

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

      {/* 가격표 사진 라이트박스 — 편집 sheet 위로 떠서 큰 사이즈로 미리보기 */}
      {lightboxIdx !== null && drinkMenuUrls[lightboxIdx] && (
        <div
          className="fixed inset-0 z-[400] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label="가격표 확대 보기"
        >
          {/* 닫기 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIdx(null);
            }}
            aria-label="닫기"
            className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>

          {/* 좌 */}
          {drinkMenuUrls.length > 1 && lightboxIdx > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx(Math.max(0, lightboxIdx - 1));
              }}
              aria-label="이전 사진"
              className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* 우 */}
          {drinkMenuUrls.length > 1 && lightboxIdx < drinkMenuUrls.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx(Math.min(drinkMenuUrls.length - 1, lightboxIdx + 1));
              }}
              aria-label="다음 사진"
              className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* 카운터 */}
          {drinkMenuUrls.length > 1 && (
            <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-neutral-900/80 backdrop-blur-sm text-white text-[12px] font-bold">
              {lightboxIdx + 1} / {drinkMenuUrls.length}
            </div>
          )}

          <div
            className="relative w-full h-full max-w-5xl p-4 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={drinkMenuUrls[lightboxIdx]}
              alt={`가격표 ${lightboxIdx + 1}`}
              width={1600}
              height={2400}
              className="h-auto w-full mx-auto select-none object-contain"
              draggable={false}
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 가격표 사진 한 장: dnd-kit Sortable 아이템.
 * - 카드 전체가 드래그 가능 (PointerSensor 5px / TouchSensor 250ms long-press)
 * - 삭제 버튼은 stopPropagation으로 드래그와 분리
 * - 좌상단 grip 아이콘으로 드래그 어포던스
 */
function SortableDrinkMenuItem({
  url,
  index,
  onRemove,
  onClick,
  disabled,
}: {
  url: string;
  index: number;
  onRemove: (url: string) => void;
  onClick: () => void;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  // dnd-kit activation constraint(5px / 250ms) 안에서는 클릭으로 인식.
  // 드래그가 트리거되지 않았을 때만 라이트박스 열기.
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    // 삭제 버튼 클릭 시 stopPropagation 했지만 안전망
    if ((e.target as HTMLElement).closest("button")) return;
    onClick();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      className={`relative aspect-square bg-neutral-900 border border-amber-500/30 rounded-lg overflow-hidden group ${
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } touch-none`}
    >
      <Image
        src={url}
        alt={`가격표 ${index + 1}`}
        fill
        sizes="(max-width: 640px) 33vw, 160px"
        className="object-cover pointer-events-none"
        draggable={false}
      />
      {/* 순서 + grip 핸들 (좌상단) */}
      <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-black/70 text-white text-[10px] font-black rounded px-1.5 py-0.5">
        <GripVertical className="w-2.5 h-2.5 text-neutral-400" />
        {index + 1}
      </div>
      {/* 삭제 (드래그·클릭과 분리) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(url);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={disabled}
        aria-label="삭제"
        className="absolute top-1 right-1 w-6 h-6 inline-flex items-center justify-center rounded-full bg-black/70 text-red-400 hover:bg-red-500/30 hover:text-red-300"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
