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
import { ArrowRight, Building2, Smartphone, MapPin, MessageCircle, Instagram, Phone, Plus, X } from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
// 휴대폰 본인인증은 로그인/가입 단계에서 이미 완료되므로 MD 신청에서는 생략
// Phone은 연락 수단 토글에서 사용
import type { User, ContactMethodType } from "@/types/database";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
    club_info_consent: z.literal(true, { message: "클럽 정보 사용 동의가 필요합니다" }),
});

type FormValues = z.infer<typeof formSchema>;

export function MDApplyForm({ initialUser }: { initialUser: User }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>([]);
    // 추가 소속 클럽 (이름만 — 주소 등 상세는 관리자가 등록). 최대 4개.
    const [extraClubs, setExtraClubs] = useState<string[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as unknown as Parameters<typeof useForm<FormValues>>[0]["resolver"],
        mode: "onBlur",
        defaultValues: {
            display_name: initialUser.display_name || "",
            phone: initialUser.phone || "",
            instagram: initialUser.instagram || "",
            area: [],
            club_name: initialUser.verification_club_name || "",
            club_info_consent: false as unknown as true,
        },
    });

    const [submitted, setSubmitted] = useState(false);
    const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(
        form.formState.isDirty && !loading && !submitted
    );

    async function onSubmit(values: FormValues) {
        setLoading(true);
        try {
            const res = await fetch("/api/md/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...values,
                    extra_club_names: extraClubs.map(s => s.trim()).filter(Boolean),
                    preferred_contact_methods: preferredMethods,
                }),
            });
            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || "신청 중 오류가 발생했습니다.");
            }
            toast.success("MD · 파트너 신청이 완료되었습니다!");
            setSubmitted(true);
            router.replace('/md/apply');
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

                        {/* 휴대폰 번호 (본인인증은 로그인/가입 단계에서 완료) */}
                        <div className="space-y-2">
                            <Label className="text-neutral-500 text-xs font-bold uppercase">휴대폰 번호</Label>
                            <Input
                                value={form.watch("phone")}
                                onChange={(e) => {
                                    const next = e.target.value.replace(/[^0-9]/g, "");
                                    form.setValue("phone", next, { shouldValidate: true });
                                }}
                                inputMode="numeric"
                                maxLength={11}
                                placeholder="01012345678"
                                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
                            />
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
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => {
                                                if (isSelected) {
                                                    setPreferredMethods(prev => prev.filter(m => m !== value));
                                                    if (value === "kakao") form.setValue("kakao_open_chat_url", "");
                                                } else {
                                                    setPreferredMethods(prev => [...prev, value]);
                                                }
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                                                isSelected
                                                    ? "bg-white text-black"
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
                            {preferredMethods.includes("kakao") && (
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-neutral-500 text-xs font-bold uppercase flex items-center gap-1.5">
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            오픈채팅 URL
                                        </Label>
                                        <KakaoOpenChatGuide />
                                    </div>
                                    <Input
                                        {...form.register("kakao_open_chat_url")}
                                        placeholder="https://open.kakao.com/o/..."
                                        className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono text-sm focus:ring-white"
                                    />
                                    {form.formState.errors.kakao_open_chat_url && (
                                        <p className="text-red-500 text-[10px] font-bold">{form.formState.errors.kakao_open_chat_url?.message?.toString()}</p>
                                    )}
                                </div>
                            )}
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
                        <div className="flex items-center justify-between">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-neutral-500" />
                                소속 클럽
                            </h3>
                            <span className="text-neutral-500 text-[10px]">여러 개 등록 가능</span>
                        </div>

                        {/* 대표 클럽명 */}
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

                        {/* 추가 클럽 (이름만) */}
                        {extraClubs.map((name, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <Input
                                    value={name}
                                    onChange={(e) => setExtraClubs(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                                    placeholder={`추가 클럽 ${idx + 1}`}
                                    className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={() => setExtraClubs(prev => prev.filter((_, i) => i !== idx))}
                                    className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center justify-center shrink-0"
                                    aria-label="클럽 삭제"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}

                        {extraClubs.length < 4 && (
                            <button
                                type="button"
                                onClick={() => setExtraClubs(prev => [...prev, ""])}
                                className="w-full h-11 rounded-xl border border-dashed border-neutral-700 text-neutral-400 font-bold text-sm hover:border-neutral-500 hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> 클럽 추가
                            </button>
                        )}
                        <p className="text-neutral-600 text-[10px] leading-relaxed">
                            여러 클럽을 운영하면 클럽명을 추가하세요. 주소 등 상세 정보는 관리자가 등록합니다.
                        </p>
                    </div>

                </div>

                {/* 클럽 정보 사용 동의 */}
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            {...form.register("club_info_consent")}
                            className="mt-1 w-5 h-5 rounded border-neutral-700 bg-neutral-950 accent-green-500 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 space-y-1.5">
                            <p className="text-[13px] text-white font-bold leading-snug">
                                클럽 정보 사용에 동의합니다 <span className="text-red-500">*</span>
                            </p>
                            <p className="text-[11.5px] text-neutral-400 leading-relaxed break-keep">
                                회원이 등록한 클럽의 상호·로고·이미지·매장 사진을 NightFlow 서비스
                                운영 및 홍보 목적(앱 내 노출, SNS, 광고)에 사용하는 것에 동의합니다.
                                회원은 언제든지 사용 중단을 요청할 수 있으며, 회사는 즉시 조치합니다.
                            </p>
                        </div>
                    </label>
                    {form.formState.errors.club_info_consent && (
                        <p className="text-red-500 text-[11px] font-bold mt-2 pl-8">
                            {form.formState.errors.club_info_consent?.message?.toString()}
                        </p>
                    )}
                </div>

                <Button
                    type="submit"
                    disabled={loading || !form.watch("club_info_consent")}
                    className="w-full h-14 bg-white text-black font-black text-lg hover:bg-neutral-200 rounded-2xl flex items-center justify-center gap-2 group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "신청 정보를 전송 중..." : (
                        <>
                            파트너 신청 완료하기
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </Button>
            </form>

            <ConfirmDialog
                isOpen={showConfirm}
                onOpenChange={setShowConfirm}
                onConfirm={confirmLeave}
                onCancel={cancelLeave}
                title="정말요?"
                description="작성 중인 내용이 사라집니다."
                confirmText="나가기"
                cancelText="계속 작성"
                variant="danger"
            />
        </>
    );
}
