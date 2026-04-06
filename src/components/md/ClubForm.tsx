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
}

export function ClubForm({ mdId, initialData }: ClubFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(initialData?.thumbnail_url || null);
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
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      area: (initialData?.area as Area) || "강남",
      address: initialData?.address || "",
      address_detail: initialData?.address_detail || "",
      postal_code: initialData?.postal_code || "",
      latitude: initialData?.latitude || null,
      longitude: initialData?.longitude || null,
      phone: initialData?.phone || "",
      thumbnail_url: initialData?.thumbnail_url || "",
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
      // approved 클럽은 이미지 필드만 수정 가능
      if (isApproved && initialData) {
        const { error } = await supabase.rpc("update_club_image", {
          p_club_id: initialData.id,
          p_field: "thumbnail_url",
          p_value: values.thumbnail_url || null,
        });

        if (error) throw error;

        toast.success("클럽 이미지가 수정되었습니다!");
        router.push("/md/clubs");
        router.refresh();
        return;
      }

      // Validation: Coordinates required for new clubs
      if (!initialData && (!values.latitude || !values.longitude)) {
        toast.error("주소 검색을 통해 정확한 위치를 설정해주세요.");
        return;
      }

      const clubData = {
        md_id: mdId,
        name: values.name,
        area: values.area,
        address: values.address,
        address_detail: values.address_detail || null,
        postal_code: values.postal_code || null,
        latitude: values.latitude,
        longitude: values.longitude,
        phone: values.phone || null,
        thumbnail_url: values.thumbnail_url || null,
      };

      const { error } = initialData
        ? await supabase.from("clubs").update(clubData).eq("id", initialData.id)
        : await supabase.from("clubs").insert({ ...clubData, status: "approved" });

      if (error) throw error;

      toast.success(initialData ? "클럽 정보가 수정되었습니다!" : "클럽이 등록되었습니다!");
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
            <p className="text-sm font-bold text-blue-400">이미지만 수정 가능</p>
            <p className="text-xs text-blue-400/70 mt-1">
              승인된 클럽은 대표이미지와 플로어맵만 변경할 수 있습니다.
              기본 정보 수정은{" "}
              <a href="http://pf.kakao.com/_ilSqX" target="_blank" rel="noopener noreferrer"
                 className="underline text-blue-400 hover:text-blue-300">
                카카오톡으로 문의
              </a>해주세요.
            </p>
          </div>
        )}

        {/* 1. Basic Info */}
        <section className={`space-y-4 ${isApproved ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2 text-white font-bold mb-2">
            <Store className="w-4 h-4 text-purple-500" />
            <span>기본 정보</span>
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-400 text-xs font-bold uppercase">클럽 이름 *</Label>
            <Input
              {...register("name")}
              placeholder="예: OCTAGON"
              className="bg-[#1C1C1E] border-neutral-800 h-12 text-white placeholder-neutral-600 rounded-xl"
            />
            {errors.name && <p className="text-red-500 text-xs">{String(errors.name?.message || "")}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-400 text-xs font-bold uppercase">지역 *</Label>
            <div className="flex flex-wrap gap-2">
              {mainAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => { setValue("area", area); setShowOtherCities(false); }}
                  className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${selectedArea === area
                      ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                      : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                    }`}
                >
                  {area}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowOtherCities(!showOtherCities)}
                className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${(otherCities as readonly string[]).includes(selectedArea) || showOtherCities
                    ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                    : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
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
                        ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                      }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
            {errors.area && <p className="text-red-500 text-xs">{String(errors.area?.message || "")}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-400 text-xs font-bold uppercase">연락처</Label>
            <Input
              {...register("phone")}
              type="tel"
              placeholder="예: 02-1234-5678"
              className="bg-[#1C1C1E] border-neutral-800 h-12 text-white placeholder-neutral-600 rounded-xl"
            />
            <p className="text-neutral-600 text-[11px]">클럽 대표 연락처입니다.</p>
          </div>
        </section>

        {/* 2. Location */}
        <section className={`space-y-4 ${isApproved ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2 text-white font-bold mb-2">
            <MapPin className="w-4 h-4 text-green-500" />
            <span>위치 정보 *</span>
          </div>

          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
            {currentAddress ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-white text-sm font-bold break-words">{currentAddress}</p>
                    {hasCoordinates && (
                      <div className="flex items-center gap-1.5">
                        <Map className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <span className="text-green-400 text-xs font-bold">위치 확인됨</span>
                        <span className="text-green-500/50 text-[10px]">
                          {watch("latitude")?.toFixed(4)}, {watch("longitude")?.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddressModalOpen(true)}
                    className="text-green-500 text-xs font-bold hover:text-green-400 transition-colors flex-shrink-0 pt-0.5"
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
              <Label className="text-neutral-400 text-xs font-bold uppercase">상세 주소</Label>
              <Input
                {...register("address_detail")}
                placeholder="동, 층, 호수 등 (예: B2층)"
                className="bg-neutral-900 border-neutral-800 h-11 text-white placeholder-neutral-600 rounded-lg text-sm"
              />
            </div>
          </div>
        </section>

        {/* 3. Image */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold mb-2">
            <ImageIcon className="w-4 h-4 text-blue-500" />
            <span>클럽 대표이미지</span>
          </div>

          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleThumbnailUpload}
          />

          {!thumbnailPreview ? (
            <div className="bg-[#1C1C1E] border border-dashed border-neutral-700 rounded-2xl p-5">
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
                  <p className="text-sm text-white font-bold">
                    {thumbnailUploading ? "업로드 중..." : "클럽 썸네일 업로드"}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    5MB 이하 · JPG, PNG, WebP · 선택사항
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border-2 border-neutral-800">
                <img
                  src={thumbnailPreview}
                  alt="클럽 썸네일"
                  className="w-full h-48 object-cover"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#1C1C1E] text-neutral-400 border border-neutral-800 hover:border-neutral-600 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  이미지 변경
                </button>
                <button
                  type="button"
                  onClick={removeThumbnail}
                  className="h-9 px-4 rounded-lg text-xs font-bold bg-[#1C1C1E] text-red-400 border border-neutral-800 hover:border-red-500/50 flex items-center gap-1.5 transition-colors"
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
              const { error } = await supabase.rpc("update_club_image", {
                p_club_id: initialData.id,
                p_field: "floor_plan_url",
                p_value: url,
              });

              if (error) {
                logError(error, "ClubForm.floorPlanSave");
                toast.error(`플로어맵 저장 실패: ${error.message || error.code || JSON.stringify(error)}`);
                throw error;
              }
            }}
          />
        )}

      </form>

      {/* Floating Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-40">
        <div className="max-w-lg mx-auto">
          <button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting || (!isApproved && currentAddress && !hasCoordinates)}
            className="w-full h-14 rounded-2xl bg-white text-black font-black text-base hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {initialData ? "수정 중..." : "신청 중..."}
              </>
            ) : (
              <>
                {initialData ? (isApproved ? "이미지 저장하기" : "클럽 정보 수정하기") : "클럽 신청하기"}
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
