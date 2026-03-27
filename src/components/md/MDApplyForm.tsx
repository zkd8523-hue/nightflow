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
import { ArrowRight, Building2, Smartphone, MapPin, ChevronDown, Map, Banknote } from "lucide-react";
import type { User } from "@/types/database";
import dynamic from "next/dynamic";

const AddressSearchModal = dynamic(() => import("./AddressSearchModal").then(m => ({ default: m.AddressSearchModal })), { ssr: false });

const formSchema = z.object({
    name: z.string().min(2, "실명을 입력해주세요"),
    phone: z.string().min(10, "올바른 연락처를 입력해주세요"),
    instagram: z.string()
        .min(1, "인스타그램 아이디를 입력해주세요")
        .max(30, "인스타그램 아이디는 30자 이하입니다")
        .regex(/^[a-zA-Z0-9._]+$/, "영문, 숫자, 마침표(.), 밑줄(_)만 가능합니다"),
    area: z.string().min(1, "활동 지역을 선택해주세요"),
    club_name: z.string().min(2, "클럽명을 입력해주세요"),
    club_address: z.string().min(5, "클럽 주소를 검색해주세요"),
    club_address_detail: z.string().optional().default(""),
    club_postal_code: z.string().optional().default(""),
    club_latitude: z.number({ error: "주소 검색으로 위치를 설정해주세요" }),
    club_longitude: z.number({ error: "주소 검색으로 위치를 설정해주세요" }),
    bank_name: z.string().min(1, "정산 은행을 선택해주세요"),
    bank_account: z.string().min(5, "계좌번호를 입력해주세요"),
});

type FormValues = z.infer<typeof formSchema>;

export function MDApplyForm({ initialUser }: { initialUser: User }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as any,
        mode: "onBlur",
        defaultValues: {
            name: initialUser.name || "",
            phone: initialUser.phone || "",
            instagram: initialUser.instagram || "",
            area: "",
            club_name: initialUser.verification_club_name || "",
            club_address: "",
            club_address_detail: "",
            club_postal_code: "",
            club_latitude: null,
            club_longitude: null,
            bank_name: initialUser.bank_name || "",
            bank_account: initialUser.bank_account || "",
        },
    });

    async function onSubmit(values: any) {
        if (!values.club_latitude || !values.club_longitude) {
            toast.error("클럽 주소를 검색하여 정확한 위치를 설정해주세요.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/md/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || "신청 중 오류가 발생했습니다.");
            }
            toast.success("MD 파트너 신청이 완료되었습니다!");
            router.refresh();
        } catch (error: unknown) {
            logError(error, "MD Apply Form");
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    const [showOtherCities, setShowOtherCities] = useState(false);
    const selectedAreaValue = form.watch("area");
    const isOtherCity = (OTHER_CITIES as readonly string[]).includes(selectedAreaValue);

    const currentClubAddress = form.watch("club_address");
    const hasClubCoordinates = form.watch("club_latitude") != null && form.watch("club_longitude") != null;

    return (
        <>
            <form id="md-apply-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-24">
                <div className="space-y-6">
                    {/* 1. 연락처 정보 */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-neutral-500" />
                            연락처 정보
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="text-neutral-500 text-xs font-bold uppercase">이름</Label>
                                <Input
                                    {...form.register("name")}
                                    placeholder="홍길동"
                                    className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                                />
                                {form.formState.errors.name && (
                                    <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.name?.message?.toString()}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-neutral-500 text-xs font-bold uppercase">연락처</Label>
                                <Input
                                    {...form.register("phone", {
                                        onChange: (e) => {
                                            const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                                            if (digits.length <= 3) {
                                                e.target.value = digits;
                                            } else if (digits.length <= 7) {
                                                e.target.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                                            } else {
                                                e.target.value = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                                            }
                                        },
                                    })}
                                    inputMode="tel"
                                    placeholder="010-0000-0000"
                                    className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                                />
                                {form.formState.errors.phone && (
                                    <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.phone?.message?.toString()}</p>
                                )}
                            </div>
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
                            <p className="text-neutral-600 text-[10px]">본인 인증 및 연락 수단으로 사용됩니다 (필수)</p>
                            {form.formState.errors.instagram && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.instagram?.message?.toString()}</p>
                            )}
                        </div>

                    </div>

                    {/* 2. 활동 지역 */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-neutral-500" />
                            주력 활동 지역
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {MAIN_AREAS.map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => { form.setValue("area", a); setShowOtherCities(false); }}
                                    className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${selectedAreaValue === a
                                        ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                        : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                                        }`}
                                >
                                    {a}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setShowOtherCities(!showOtherCities)}
                                className={`px-4 py-2 rounded-full border text-sm font-bold transition-all ${isOtherCity || showOtherCities
                                    ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                    : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-700"
                                    }`}
                            >
                                다른 지역 {isOtherCity && `(${selectedAreaValue})`}
                            </button>
                        </div>
                        {showOtherCities && (
                            <div className="relative mt-2">
                                <select
                                    value={isOtherCity ? selectedAreaValue : ""}
                                    onChange={(e) => { form.setValue("area", e.target.value); setShowOtherCities(false); }}
                                    className="w-full h-12 bg-neutral-900 border border-neutral-800 text-white rounded-md px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-white"
                                >
                                    <option value="" disabled>도시를 선택해주세요</option>
                                    {OTHER_CITIES.map((city) => (
                                        <option key={city} value={city}>{city}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
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

                    {/* 4. 정산 계좌 */}
                    <div className="space-y-4">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-neutral-500" />
                            정산 계좌
                        </h3>
                        <p className="text-neutral-600 text-[10px]">보증금 정산 시 사용됩니다. 본인 명의 계좌만 등록 가능합니다.</p>

                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">은행 *</Label>
                            <div className="relative">
                                <select
                                    {...form.register("bank_name")}
                                    className="w-full h-12 bg-neutral-900 border border-neutral-800 text-white rounded-md px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-white"
                                >
                                    <option value="">선택하세요</option>
                                    <option value="KB국민은행">KB국민은행</option>
                                    <option value="신한은행">신한은행</option>
                                    <option value="우리은행">우리은행</option>
                                    <option value="하나은행">하나은행</option>
                                    <option value="NH농협은행">NH농협은행</option>
                                    <option value="IBK기업은행">IBK기업은행</option>
                                    <option value="SC제일은행">SC제일은행</option>
                                    <option value="카카오뱅크">카카오뱅크</option>
                                    <option value="토스뱅크">토스뱅크</option>
                                    <option value="케이뱅크">케이뱅크</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                            </div>
                            {form.formState.errors.bank_name && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.bank_name?.message?.toString()}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">계좌번호 *</Label>
                            <Input
                                {...form.register("bank_account")}
                                inputMode="numeric"
                                placeholder="'-' 없이 숫자만 입력"
                                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                            />
                            {form.formState.errors.bank_account && (
                                <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.bank_account?.message?.toString()}</p>
                            )}
                        </div>
                    </div>
                </div>
            </form>

            {/* Fixed Bottom CTA */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-40">
                <div className="max-w-lg mx-auto">
                    <Button
                        type="submit"
                        form="md-apply-form"
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
                </div>
            </div>

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
