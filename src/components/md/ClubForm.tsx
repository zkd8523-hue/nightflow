"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import type { Club, Area } from "@/types/database";

const AddressSearchModal = dynamic(() => import("./AddressSearchModal").then(m => ({ default: m.AddressSearchModal })), { ssr: false });
const FloorPlanEditor = dynamic(() => import("./FloorPlanEditor").then(m => ({ default: m.FloorPlanEditor })), { ssr: false });
import { MapPin, Store, Image as ImageIcon, ArrowRight, Map, Upload, Trash2 } from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { uploadImage } from "@/lib/utils/upload";

const formSchema = z.object({
  name: z.string().min(2, "클럽 이름을 입력해주세요 (2자 이상)"),
  area: z.enum(["강남", "홍대", "이태원", "건대", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]),
  address: z.string().min(5, "주소를 입력해주세요"),
  address_detail: z.string().optional().default(""),
  postal_code: z.string().optional().default(""),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  phone: z.string().optional().default(""),
  thumbnail_url: z.string().optional().default(""),
});

type FormValues = z.infer<typeof formSchema>;

interface ClubFormProps {
  mdId: string;
  initialData?: Club;
  /** Migration 216: 같은 클럽이라도 MD 각자 본인 대표 이미지 (club_partners.thumbnail_url) */
  initialPartnerThumbnailUrl?: string | null;
}

export function ClubForm({ mdId, initialData, initialPartnerThumbnailUrl }: ClubFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(initialPartnerThumbnailUrl ?? null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const mainAreas = ["강남", "홍대", "이태원", "건대"] as const;
  const otherCities = ["부산", "대구", "인천", "광주", "대전", "울산", "세종"] as const;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Parameters<typeof useForm<FormValues>>[0]["resolver"],
    defaultValues: {
      name: initialData?.name || "",
      area: (initialData?.area as Area) || "강남",
      address: initialData?.address || "",
      address_detail: initialData?.address_detail || "",
      postal_code: initialData?.postal_code || "",
      latitude: initialData?.latitude || null,
      longitude: initialData?.longitude || null,
      phone: initialData?.phone || "",
      thumbnail_url: initialPartnerThumbnailUrl || "",
    },
  });

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setThumbnailUploading(true);
    try {
      const publicUrl = await uploadImage(file, `club-thumbnails/${mdId}`, {
        maxWidth: 800,
      });

      if (publicUrl) {
        setThumbnailPreview(publicUrl);
        setValue("thumbnail_url", publicUrl);
        toast.success("썸네일이 업로드되었습니다.");
      }
    } finally {
      setThumbnailUploading(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  const removeThumbnail = () => {
    setThumbnailPreview(null);
    setValue("thumbnail_url", "");
  };

  const selectedArea = watch("area");
  const currentAddress = watch("address");
  const hasCoordinates = watch("latitude") !== null && watch("longitude") !== null;

  const isApproved = initialData?.status === "approved";

  const onSubmit = async (values: FormValues) => {
    try {
      // Validation: Coordinates required for new clubs
      if (!initialData && (!values.latitude || !values.longitude)) {
        toast.error("주소 검색을 통해 정확한 위치를 설정해주세요.");
        return;
      }

      // Migration 216: clubs.thumbnail_url은 admin 전용. MD 본인 이미지는 club_partners.thumbnail_url
      const clubData = {
        name: values.name,
        area: values.area,
        address: values.address,
        address_detail: values.address_detail || null,
        postal_code: values.postal_code || null,
        latitude: values.latitude,
        longitude: values.longitude,
        phone: values.phone || null,
      };
      const partnerThumbnail = values.thumbnail_url || null;

      // 신규 등록 시: 이름/좌표가 닮은 기존 클럽이 있으면 새로 만들지 말고 합류 제안.
      // (중복 클럽 재발 방지 — 전면 신청제 1단계: find_similar_clubs, Migration 439)
      if (!initialData) {
        const { data: similar } = await supabase.rpc("find_similar_clubs", {
          p_name: values.name,
          p_lat: values.latitude,
          p_lng: values.longitude,
          p_exclude: null,
        });
        const strongMatch = (similar ?? []).find(
          (c: { reason: string }) => c.reason === "이름+위치 일치" || c.reason === "이름 일치"
        ) as { id: string; name: string; area: string } | undefined;

        if (strongMatch) {
          const join = window.confirm(
            `이미 등록된 클럽 같아요: "${strongMatch.name}" (${strongMatch.area}).\n` +
              `새로 만들지 않고 이 클럽에 파트너로 합류할까요?\n\n` +
              `[확인] = 합류 신청 / [취소] = 정말 다른 클럽이라 새로 등록`
          );
          if (join) {
            const { error: joinErr } = await supabase.from("club_partners").insert({
              club_id: strongMatch.id,
              md_id: mdId,
              role: "partner",
              thumbnail_url: partnerThumbnail,
            });
            if (joinErr) throw joinErr;
            toast.success(`"${strongMatch.name}"에 파트너로 연결되었습니다!`);
            router.push("/md/clubs");
            router.refresh();
            return;
          }
        }
      }

      // Phase 4(Migration 182): clubs.md_id 제거 — 신규 INSERT 시 club_partners 명시 등록.
      let targetClubId: string | undefined = initialData?.id;
      if (initialData) {
        const { error } = await supabase.from("clubs").update(clubData).eq("id", initialData.id);
        if (error) throw error;
      } else {
        // 전면 신청제: 신규 클럽은 관리자 승인 전까지 pending (유저 화면 비노출).
        const { data: inserted, error } = await supabase
          .from("clubs")
          .insert({ ...clubData, status: "pending" })
          .select("id")
          .single();
        if (error) throw error;
        if (inserted) {
          targetClubId = inserted.id;
          const { error: partnerError } = await supabase
            .from("club_partners")
            .insert({
              club_id: inserted.id,
              md_id: mdId,
              role: "owner",
              thumbnail_url: partnerThumbnail,
            });
          if (partnerError) {
            // 롤백
            await supabase.from("clubs").delete().eq("id", inserted.id);
            throw partnerError;
          }
        }
      }

      // 수정 모드: MD 본인의 partner thumbnail 업데이트 (API 경유)
      if (initialData && targetClubId) {
        const res = await fetch("/api/md/clubs/update-partner-thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clubId: targetClubId,
            thumbnailUrl: partnerThumbnail,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[ClubForm] partner thumbnail update failed:", body);
          toast.error("대표이미지 저장 실패 — 다른 정보는 저장됨");
        }
      }

      toast.success(
        initialData
          ? "클럽 정보가 수정되었습니다!"
          : "클럽 추가 신청이 접수되었습니다. 관리자 승인 후 노출됩니다."
      );
      router.push("/md/clubs");
      router.refresh();
    } catch (error: unknown) {
      logError(error, "ClubForm.onSubmit");
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-32">
        {/* Approved 안내 배너 */}
        {isApproved && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
            <p className="text-sm font-bold text-blue-400">클럽 정보 수정</p>
            <p className="text-xs text-blue-400/70 mt-1">
              수정 후 저장하면 즉시 반영됩니다.
            </p>
          </div>
        )}

        {/* 1. Basic Info */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold mb-2">
            <Store className="w-4 h-4 text-purple-500" />
            <span>기본 정보</span>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-bold uppercase">클럽 이름 *</Label>
            <Input
              {...register("name")}
              placeholder="예: OCTAGON"
              className="bg-card border-border h-12 text-foreground placeholder-neutral-600 rounded-xl"
            />
            {errors.name && <p className="text-red-500 text-xs">{String(errors.name?.message || "")}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-bold uppercase">지역 *</Label>
            <div className="flex flex-wrap gap-2">
              {mainAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => { setValue("area", area); setShowOtherCities(false); }}
                  className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${selectedArea === area
                      ? "bg-inverse text-inverse-foreground border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                      : "bg-card text-muted-foreground border-border hover:border-border"
                    }`}
                >
                  {area}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowOtherCities(!showOtherCities)}
                className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${(otherCities as readonly string[]).includes(selectedArea) || showOtherCities
                    ? "bg-inverse text-inverse-foreground border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    : "bg-card text-muted-foreground border-border hover:border-border"
                  }`}
              >
                다른 지역 {(otherCities as readonly string[]).includes(selectedArea) && `(${selectedArea})`}
              </button>
            </div>
            {showOtherCities && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {otherCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => { setValue("area", city); setShowOtherCities(false); }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${selectedArea === city
                        ? "bg-inverse text-inverse-foreground border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        : "bg-card text-muted-foreground border-border hover:border-border"
                      }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
            {errors.area && <p className="text-red-500 text-xs">{String(errors.area?.message || "")}</p>}
          </div>

        </section>

        {/* 2. Location */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold mb-2">
            <MapPin className="w-4 h-4 text-money" />
            <span>위치 정보 *</span>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            {currentAddress ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-foreground text-sm font-bold break-words">{currentAddress}</p>
                    {hasCoordinates && (
                      <div className="flex items-center gap-1.5">
                        <Map className="w-3.5 h-3.5 text-money flex-shrink-0" />
                        <span className="text-money text-xs font-bold">위치 확인됨</span>
                        <span className="text-money dark:text-money/50 text-[10px]">
                          {watch("latitude")?.toFixed(4)}, {watch("longitude")?.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddressModalOpen(true)}
                    className="text-money text-xs font-bold hover:text-money transition-colors flex-shrink-0 pt-0.5"
                  >
                    변경
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddressModalOpen(true)}
                className="w-full h-12 rounded-xl bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                주소 검색하기
              </button>
            )}

            {errors.address && <p className="text-red-500 text-xs">{String(errors.address?.message || "")}</p>}

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs font-bold uppercase">상세 주소</Label>
              <Input
                {...register("address_detail")}
                placeholder="동, 층, 호수 등 (예: B2층)"
                className="bg-card border-border h-11 text-foreground placeholder-neutral-600 rounded-lg text-sm"
              />
            </div>
          </div>
        </section>

        {/* 3. Image (MD 본인의 대표이미지) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-foreground font-bold mb-1">
            <ImageIcon className="w-4 h-4 text-blue-500" />
            <span>내 대표이미지</span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1 leading-relaxed">
            같은 클럽이라도 파트너마다 자유롭게 설정할 수 있어요. 경매·조각 등록 시 기본 이미지로 사용됩니다.
          </p>

          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleThumbnailUpload}
          />

          {!thumbnailPreview ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-5">
              <button
                type="button"
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={thumbnailUploading}
                className="w-full flex flex-col items-center gap-3 py-3 hover:opacity-80 transition-opacity"
              >
                {thumbnailUploading ? (
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-11 h-11 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <Upload className="w-5 h-5 text-blue-500" />
                  </div>
                )}
                <div className="text-center">
                  <p className="text-sm text-foreground font-bold">
                    {thumbnailUploading ? "업로드 중..." : "대표이미지 업로드"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    5MB 이하 · JPG, PNG, WebP · 선택사항
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border-2 border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailPreview}
                  alt="파트너 대표이미지"
                  className="w-full h-48 object-cover"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  className="flex-1 h-9 rounded-lg text-xs font-bold bg-card text-muted-foreground border border-border hover:border-border hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  이미지 변경
                </button>
                <button
                  type="button"
                  onClick={removeThumbnail}
                  className="h-9 px-4 rounded-lg text-xs font-bold bg-card text-red-400 border border-border hover:border-red-500/50 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  삭제
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 4. Floor Plan (only for existing clubs) */}
        {initialData && (
          <FloorPlanEditor
            targetId={initialData.id}
            targetType="club"
            initialFloorPlanUrl={initialData.floor_plan_url}
            onSave={async (url) => {
              // Migration 182 이후 clubs.md_id 컬럼 제거 → 옛 update_club_image RPC가
              // 정책/함수 내 md_id 참조로 실패. club_partners 기반 API로 라우팅.
              const res = await fetch("/api/md/clubs/update-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  clubId: initialData.id,
                  field: "floor_plan_url",
                  value: url,
                }),
              });

              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg = body?.error || body?.detail || "알 수 없는 오류";
                logError(new Error(msg), "ClubForm.floorPlanSave");
                toast.error(`플로어맵 저장 실패: ${msg}`);
                throw new Error(msg);
              }
            }}
          />
        )}

      </form>

      {/* Floating Submit Button */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/80 to-transparent z-40"
        style={{ paddingBottom: "calc(1rem + 3.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-lg mx-auto">
          <button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || (!isApproved && currentAddress && !hasCoordinates)}
            className="w-full h-14 rounded-2xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {initialData ? "수정 중..." : "신청 중..."}
              </>
            ) : (
              <>
                {initialData ? "클럽 정보 수정하기" : "클럽 신청하기"}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Address Search Modal */}
      <AddressSearchModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        onSelectAddress={(result) => {
          setValue("address", result.address);
          setValue("postal_code", result.postalCode);
          setValue("latitude", result.latitude);
          setValue("longitude", result.longitude);
        }}
      />
    </>
  );
}
