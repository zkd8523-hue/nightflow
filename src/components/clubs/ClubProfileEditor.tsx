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
import { CLUB_TAG_GROUPS, makeTag, parseTag } from "@/lib/clubs/tags";
import { updateClubPartnerFields } from "@/lib/clubs/update";

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
  }) => void;
}

export function ClubProfileEditor({ clubId, initialTags, initialName, initialAddress, initialOperatingHours, initialEntryFeeDetail, initialInstagram, initialAliases = [], initialDresscode = "", mode = "admin", externalOpen, onExternalOpenChange, hideTrigger = false, onSaved }: Props) {
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
  const [saving, setSaving] = useState(false);

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
      const baseChanged = trimmedName !== initialName
        || trimmedAddress !== initialAddress
        || trimmedHours !== initialOperatingHours
        || trimmedFee !== initialEntryFeeDetail
        || trimmedInstagram !== initialInstagram
        || aliasesChanged;
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
    </>
  );
}
