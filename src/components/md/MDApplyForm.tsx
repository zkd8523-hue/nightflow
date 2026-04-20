"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { MAIN_AREAS, OTHER_CITIES } from "@/lib/constants/areas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Building2, Smartphone, MapPin, Map, MessageCircle, Instagram, Phone } from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
// Phone은 연락 수단 토글에서 사용
import type { User, ContactMethodType } from "@/types/database";
import dynamic from "next/dynamic";

const AddressSearchModal = dynamic(() => import("./AddressSearchModal").then(m => ({ default: m.AddressSearchModal })), { ssr: false });

const formSchema = z.object({
    display_name: z.string().min(2, "닉네임을 입력해주세요").max(16, "닉네임은 최대 16자"),
    phone: z.string()
        .min(10, "전화번호를 입력해주세요")
        .regex(/^01[016789]\d{7,8}$/, "올바른 휴대폰 번호를 입력해주세요 (예: 01012345678)"),
    instagram: z.string()
        .min(1, "인스타그램 아이디를 입력해주세요")
        .max(30, "인스타그램 아이디는 30자 이하입니다")
        .regex(/^[a-zA-Z0-9._]+$/, "영문, 숫자, 마침표(.), 밑줄(_)만 가능합니다"),
    kakao_open_chat_url: z.string()
        .url("올바른 URL을 입력해주세요")
        .regex(/^https:\/\/open\.kakao\.com\//, "카카오톡 오픈채팅 URL만 가능합니다")
        .or(z.literal(""))
        .optional(),
    area: z.array(z.string()).min(1, "활동 지역을 선택해주세요"),
    club_name: z.string().min(2, "클럽명을 입력해주세요"),
    club_address: z.string().min(5, "클럽 주소를 검색해주세요"),
    club_address_detail: z.string().optional().default(""),
    club_postal_code: z.string().optional().default(""),
    club_latitude: z.number({ error: "주소 검색으로 위치를 설정해주세요" }),
    club_longitude: z.number({ error: "주소 검색으로 위치를 설정해주세요" }),
});

type FormValues = z.infer<typeof formSchema>;

export function MDApplyForm({ initialUser }: { initialUser: User }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as unknown as Parameters<typeof useForm<FormValues>>[0]["resolver"],
        mode: "onBlur",
        defaultValues: {
            display_name: initialUser.display_name || "",
            phone: initialUser.phone || "",
            instagram: initialUser.instagram || "",
            area: [],
            club_name: initialUser.verification_club_name || "",
            club_address: "",
            club_address_detail: "",
            club_postal_code: "",
            club_latitude: null,
            club_longitude: null,
        },
    });

    async function onSubmit(values: FormValues) {
        if (!values.club_latitude || !values.club_longitude) {
            toast.error("클럽 주소를 검색하여 정확한 위치를 설정해주세요.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/md/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...values, preferred_contact_methods: preferredMethods }),
            });
            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || "신청 중 오류가 발생했습니다.");
            }
            toast.success("MD 파트너 신청이 완료되었습니다!");
            router.push('/md/apply');
        } catch (error: unknown) {
            logError(error, "MD Apply Form");
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    const [showOtherCities, setShowOtherCities] = useState(false);
    const selectedAreas = form.watch("area");
    const hasOtherCity = selectedAreas.some(a => (OTHER_CITIES as readonly string[]).includes(a));

    const currentClubAddress = form.watch("club_address");
    const hasClubCoordinates = form.watch("club_latitude") != null && form.watch("club_longitude") != null;

    return (
        <>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-6">
                    {/* 1. 연락처 정보 */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-neutral-500" />
                            연락처 정보
                        </h3>
                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">닉네임 (활동명)</Label>
                            <Input
                                {...form.register("display_name")}
                                placeholder="경매에 표시될 활동명"
                                maxLength={16}
                                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                            />
                            {form.formState.errors.display_name && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.display_name?.message?.toString()}</p>
                            )}
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">휴대폰 번호 *</Label>
                            <Input
                                {...form.register("phone", {
                                    onChange: (e) => {
                                        e.target.value = e.target.value.replace(/[^0-9]/g, "");
                                    },
                                })}
                                type="tel"
                                placeholder="01012345678"
                                maxLength={11}
                                className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono focus:ring-white"
                            />
                            <p className="text-neutral-600 text-[10px]">고객 연락 및 본인 확인에 사용됩니다 (하이픈 없이 입력)</p>
                            {form.formState.errors.phone && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.phone?.message?.toString()}</p>
                            )}
                        </div>

                        {/* Instagram ID (Required) */}
                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">인스타그램 아이디 *</Label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 font-bold">@</span>
                                <Input
                                    {...form.register("instagram", {
                                        onChange: (e) => {
                                            e.target.value = e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
                                        },
                                    })}
                                    placeholder="your_instagram_id"
                                    className="bg-neutral-900 border-neutral-800 text-white h-12 pl-8 font-mono focus:ring-white"
                                />
                            </div>
                            <p className="text-neutral-600 text-[10px]">MD 브랜딩 채널로 사용됩니다 (필수)</p>
                            {form.formState.errors.instagram && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.instagram?.message?.toString()}</p>
                            )}
                        </div>

                        {/* Kakao Open Chat (Optional) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-neutral-500 text-xs font-bold uppercase flex items-center gap-1.5">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    카카오톡 오픈채팅 (선택)
                                </Label>
                                <KakaoOpenChatGuide />
                            </div>
                            <Input
                                {...form.register("kakao_open_chat_url")}
                                placeholder="https://open.kakao.com/o/..."
                                className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono text-sm focus:ring-white"
                            />
                            <p className="text-neutral-600 text-[10px]">고객에게 추가 연락 수단으로 표시됩니다</p>
                            {form.formState.errors.kakao_open_chat_url && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.kakao_open_chat_url?.message?.toString()}</p>
                            )}
                        </div>

                        {/* 연락 수단 선택 */}
                        <div className="space-y-3">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">고객에게 표시할 연락 수단을 선택해주세요</Label>
                            <div className="flex flex-wrap gap-2">
                                {([
                                    { value: "dm" as ContactMethodType, label: "인스타 DM", icon: Instagram },
                                    { value: "phone" as ContactMethodType, label: "전화", icon: Phone },
                                    { value: "kakao" as ContactMethodType, label: "오픈채팅", icon: MessageCircle },
                                ]).map(({ value, label, icon: Icon }) => {
                                    const isSelected = preferredMethods.includes(value);
                                    const isDisabled = value === "kakao" && !form.watch("kakao_open_chat_url");
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            disabled={isDisabled}
                                            onClick={() => setPreferredMethods(prev =>
                                                isSelected ? prev.filter(m => m !== value) : [...prev, value]
                                            )}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                                                isSelected
                                                    ? "bg-white text-black"
                                                    : isDisabled
                                                        ? "bg-neutral-900 text-neutral-700 cursor-not-allowed"
                                                        : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                                            }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-neutral-600 text-[10px]">
                                {preferredMethods.length === 0 ? "미선택 시 모든 수단이 표시됩니다" : "선택한 수단만 표시됩니다"}
                            </p>
                        </div>

                    </div>

                    {/* 2. 활동 지역 */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-neutral-500" />
                                주력 활동 지역
                            </h3>
                            <span className="text-neutral-500 text-[10px]">복수 선택 가능</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {MAIN_AREAS.map((a) => {
                                const isSelected = selectedAreas.includes(a);
                                return (
                                    <button
                                        key={a}
                                        type="button"
                                        onClick={() => {
                                            const next = isSelected
                                                ? selectedAreas.filter(v => v !== a)
                                                : [...selectedAreas, a];
                                            form.setValue("area", next, { shouldValidate: true });
                                        }}
                                        className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${isSelected
                                            ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                            : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                                            }`}
                                    >
                                        {a}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setShowOtherCities(!showOtherCities)}
                                className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${hasOtherCity || showOtherCities
                                    ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                    : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                                    }`}
                            >
                                다른 지역
                            </button>
                        </div>
                        {showOtherCities && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {OTHER_CITIES.map((city) => {
                                    const isSelected = selectedAreas.includes(city);
                                    return (
                                        <button
                                            key={city}
                                            type="button"
                                            onClick={() => {
                                                const next = isSelected
                                                    ? selectedAreas.filter(v => v !== city)
                                                    : [...selectedAreas, city];
                                                form.setValue("area", next, { shouldValidate: true });
                                            }}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${isSelected
                                                ? "bg-white text-black border-white"
                                                : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                                                }`}
                                        >
                                            {city}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {form.formState.errors.area && (
                            <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.area?.message?.toString()}</p>
                        )}
                    </div>

                    {/* 3. 소속 클럽 */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-neutral-500" />
                            소속 클럽
                        </h3>

                        {/* 클럽명 */}
                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">클럽명 *</Label>
                            <Input
                                {...form.register("club_name")}
                                placeholder="예: OCTAGON"
                                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                            />
                            {form.formState.errors.club_name && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.club_name?.message?.toString()}</p>
                            )}
                        </div>

                        {/* 주소 검색 */}
                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 space-y-3">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">클럽 위치 *</Label>
                            {currentClubAddress ? (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <p className="text-white text-sm font-bold break-words">{currentClubAddress}</p>
                                            {hasClubCoordinates && (
                                                <div className="flex items-center gap-1.5">
                                                    <Map className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                                    <span className="text-green-400 text-xs font-bold">위치 확인됨</span>
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
                                    <Input
                                        {...form.register("club_address_detail")}
                                        placeholder="동, 층, 호수 등 (예: B2층)"
                                        className="bg-neutral-950 border-neutral-800 h-11 text-white placeholder-neutral-600 rounded-lg text-sm"
                                    />
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
                            {form.formState.errors.club_address && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.club_address?.message?.toString()}</p>
                            )}
                        </div>
                    </div>

                </div>

                <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 bg-white text-black font-black text-lg hover:bg-neutral-200 rounded-2xl flex items-center justify-center gap-2 group transition-all"
                >
                    {loading ? "신청 정보를 전송 중..." : (
                        <>
                            파트너 신청 완료하기
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </Button>
            </form>


            <AddressSearchModal
                isOpen={isAddressModalOpen}
                onClose={() => setIsAddressModalOpen(false)}
                onSelectAddress={(result) => {
                    form.setValue("club_address", result.address);
                    form.setValue("club_postal_code", result.postalCode);
                    form.setValue("club_latitude", result.latitude);
                    form.setValue("club_longitude", result.longitude);
                }}
            />
        </>
    );
}
