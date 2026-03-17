"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction, PriceRecommendation, AuctionTemplate } from "@/types/database";
import { SmartPricingCard } from "./SmartPricingCard";
import { Calendar, Wine, Check, ArrowRight, ImageIcon, Sparkles, ChevronDown, MapPin, Plus, X, RefreshCw, Building2, Bookmark } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
dayjs.locale("ko");
import { getClubEventDate } from "@/lib/utils/date";
import { getBidIncrement } from "@/lib/utils/auction";
import { shareAuction } from "@/lib/utils/share";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { uploadImage } from "@/lib/utils/upload";
import { ShareSuccessSheet } from "./ShareSuccessSheet";
import { TemplateDrawer } from "./TemplateDrawer";
import { trackEvent } from "@/lib/analytics";

const formSchema = z.object({
    club_id: z.string().min(1, "클럽을 선택해주세요."),
    table_info: z.string().min(1, "테이블 정보를 입력해주세요."),
    start_price: z.number().min(1, "시작가는 0원보다 커야 합니다."),
    entry_time: z.string().nullable(),
    event_date: z.string(),
    auction_start_at: z.string(),
    instant_start: z.boolean().optional(),
    duration_minutes: z.number().refine(v => v === -1 || v >= 1, "지속 시간을 선택해주세요."),
    includes: z.array(z.string()).min(1, "최소 한 개의 포함 내역을 선택해주세요."),
}).superRefine((data, ctx) => {
    if (data.entry_time) {
        // 실제 방문 캘린더 시각 계산 (새벽 4시 이전 = event_date + 1일)
        const [h, m] = data.entry_time.split(":").map(Number);
        const visitDate = h < 4
            ? dayjs(data.event_date).add(1, "day")
            : dayjs(data.event_date);
        const visitDateTime = visitDate.hour(h).minute(m);

        // 입장 시간이 경매 종료 이후인지 체크
        const auctionStart = data.instant_start
            ? dayjs()
            : dayjs(data.auction_start_at);
        const auctionEnd = data.duration_minutes === -1
            ? dayjs(data.event_date).hour(18).minute(0)
            : auctionStart.add(data.duration_minutes, "minute");

        if (visitDateTime.isBefore(auctionEnd)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "입장 시간은 경매 종료 이후여야 합니다.",
                path: ["entry_time"],
            });
        }
    }
    // 경매 시작 일시가 현재보다 과거인지 체크 — 즉시 시작이면 건너뜀
    if (!data.instant_start && data.auction_start_at && dayjs(data.auction_start_at).isBefore(dayjs())) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "경매 시작 일시는 현재 시각 이후여야 합니다.",
            path: ["auction_start_at"],
        });
    }
});

type FormValues = z.infer<typeof formSchema>;

interface AuctionFormProps {
    clubs: Club[];
    mdId: string;
    initialData?: Auction;
    repostFrom?: Auction | null;
    defaultClubId?: string | null;
}

import { LiquorSelector } from "./LiquorSelector";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";
import { getDrinkCategoryImage } from "@/lib/constants/drink-images";



export function AuctionForm({ clubs, mdId, initialData, repostFrom, defaultClubId }: AuctionFormProps) {
    // 재등록 시 원본 데이터를 기본값 소스로 사용 (날짜/시간 제외)
    const prefill = repostFrom || null;
    const router = useRouter();
    const supabase = createClient();
    const [auctionMode, setAuctionMode] = useState<"today" | "advance">(
        initialData ? (dayjs(initialData.event_date).isSame(getClubEventDate(), "day") ? "today" : "advance") : "today"
    );
    const [startPriceDisplay, setStartPriceDisplay] = useState((initialData?.start_price || prefill?.start_price)?.toLocaleString() || "");
    const [instantEntry, setInstantEntry] = useState(
        initialData ? !initialData.entry_time
        : prefill ? !prefill.entry_time
        : false
    );
    const [instantStart, setInstantStart] = useState(true);
    const [customExtra, setCustomExtra] = useState("");
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(initialData?.thumbnail_url || null);
    const [thumbnailUploading, setThumbnailUploading] = useState(false);
    const [isClubImage, setIsClubImage] = useState(false);
    const [localFloorPlanUrls, setLocalFloorPlanUrls] = useState<Record<string, string>>({});
    const [floorPlanUploading, setFloorPlanUploading] = useState(false);
    const [floorPlanExpanded, setFloorPlanExpanded] = useState(false);

    // Dialog States
    const [priceConfirmInfo, setPriceConfirmInfo] = useState<{ isOpen: boolean, title: string, description: string } | null>(null);
    const [pendingSubmission, setPendingSubmission] = useState<{ values: FormValues } | null>(null);

    // Share Success Sheet state
    const [showShareSheet, setShowShareSheet] = useState(false);
    const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);

    // Template Drawer state
    const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
    const [templateCount, setTemplateCount] = useState(0);
    const [recentTemplate, setRecentTemplate] = useState<AuctionTemplate | null>(null);

    const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            club_id: initialData?.club_id || prefill?.club_id || defaultClubId || "",
            table_info: initialData?.table_info || prefill?.table_info || "",
            duration_minutes: initialData?.duration_minutes || prefill?.duration_minutes || 15,
            includes: initialData?.includes || prefill?.includes || ["기본 안주"],
            event_date: initialData?.event_date || getClubEventDate(),
            start_price: initialData?.start_price || prefill?.start_price || 0,
            entry_time: initialData
                ? (initialData.entry_time ?? null)
                : (prefill?.entry_time ?? dayjs().add(1, "hour").format("HH:mm")),
            auction_start_at: initialData?.auction_start_at ? dayjs(initialData.auction_start_at).format("YYYY-MM-DDTHH:mm") : dayjs().format("YYYY-MM-DDTHH:mm"),
            instant_start: true,
        }
    });

    const selectedIncludes = watch("includes");
    const selectedTableInfo = watch("table_info");
    const selectedClubId = watch("club_id");
    const selectedClub = clubs.find(c => c.id === selectedClubId);
    const floorPlanUrl = localFloorPlanUrls[selectedClubId] || selectedClub?.floor_plan_url;
    const hasFloorPlan = !!floorPlanUrl;
    const currentStartPrice = watch("start_price") || 0;

    // 입찰 보호: 입찰이 있으면 경매 조건 수정 불가
    const hasBids = initialData && initialData.bid_count > 0;
    const isTermsEditable = !hasBids;

    // 템플릿 로드 (신규 등록 시에만) — 개수 + 최근 사용 템플릿
    useEffect(() => {
        if (initialData || repostFrom) return;
        fetch("/api/templates")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (!Array.isArray(data)) return;
                setTemplateCount(data.length);
                if (data.length > 0) setRecentTemplate(data[0]); // last_used_at DESC 정렬
            })
            .catch(() => {});
    }, [initialData, repostFrom]);

    // 템플릿/repostFrom 프리셋 적용 공유 함수
    const applyPreset = (source: Partial<{
        club_id: string;
        includes: string[];
        start_price: number;
        duration_minutes: number;
    }>) => {
        if (source.club_id) setValue("club_id", source.club_id);
        if (source.includes) setValue("includes", source.includes);
        if (source.start_price) {
            setValue("start_price", source.start_price);
            setStartPriceDisplay(source.start_price.toLocaleString());
        }
        if (source.duration_minutes) setValue("duration_minutes", source.duration_minutes);
    };

    const handleTemplateApply = (template: AuctionTemplate) => {
        applyPreset(template);
        navigator.vibrate?.(50);
        toast.success(`${template.name} 설정 적용됨`);
    };

    // 플로어맵 즉시 업로드
    const handleFloorPlanUpload = async (file: File) => {
        if (!selectedClub) return;
        setFloorPlanUploading(true);
        try {
            const url = await uploadImage(file, `floor-plans/club/${selectedClub.id}`, {
                maxWidth: 2048, quality: 0.85,
            });
            if (!url) throw new Error("업로드 실패");

            const res = await fetch("/api/md/clubs/update-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clubId: selectedClub.id, field: "floor_plan_url", value: url }),
            });
            if (!res.ok) throw new Error("저장 실패");

            setLocalFloorPlanUrls(prev => ({ ...prev, [selectedClub.id]: url }));
            setFloorPlanExpanded(false);
            toast.success("플로어맵이 등록되었습니다!");
        } catch {
            toast.error("플로어맵 업로드에 실패했습니다.");
        } finally {
            setFloorPlanUploading(false);
        }
    };

    // Smart Pricing
    const [priceRec, setPriceRec] = useState<PriceRecommendation | null>(null);
    const [priceRecLoading, setPriceRecLoading] = useState(false);
    const [showSmartPricing, setShowSmartPricing] = useState(false);

    useEffect(() => {
        if (!selectedClubId) {
            setPriceRec(null);
            return;
        }
        setPriceRecLoading(true);
        const timer = setTimeout(async () => {
            try {
                const { data, error } = await supabase.rpc("get_price_recommendation", {
                    p_club_id: selectedClubId,
                    p_table_info: selectedTableInfo || null,
                });
                if (error) throw error;
                setPriceRec(data as PriceRecommendation);
            } catch {
                setPriceRec(null);
            } finally {
                setPriceRecLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedClubId, selectedTableInfo]);

    // 클럽 전환 시 table_info 리셋
    useEffect(() => {
        if (!initialData) {
            setValue("table_info", "");
        }
    }, [selectedClubId]); // eslint-disable-line react-hooks/exhaustive-deps

    // 클럽 전환 시 프리뷰 초기화 (클럽 이미지 자동 적용 제거)
    useEffect(() => {
        if (initialData) return;
        if (thumbnailFile) return;
        setThumbnailPreview(null);
        setIsClubImage(false);
    }, [selectedClubId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Watch auction mode to auto-reset duration minutes and prevent invalid states
    useEffect(() => {
        const isToday = auctionMode === "today";
        const currentDuration = watch("duration_minutes");

        if (isToday) {
            // If they switched back to today and the current selection is a "future" option (or vice versa), reset to 15m.
            if (![15, 30, 60].includes(currentDuration)) {
                setValue("duration_minutes", 15);
            }
        } else {
            // If they switched to a future date, and had a short duration selected, reset to 24h
            if (![24 * 60, 48 * 60, -1].includes(currentDuration)) {
                setValue("duration_minutes", 24 * 60);
            }
            // 얼리버드에서는 즉시 입장 불가 — 해제
            if (instantEntry) {
                setInstantEntry(false);
                setValue("entry_time", "22:00");
            }
        }
    }, [auctionMode, setValue]);

    const handleApplyRecommendation = (price: number) => {
        setValue("start_price", price);
        setStartPriceDisplay(price.toLocaleString());
        toast.success("추천 시작가가 적용되었습니다!");
    };

    const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error("이미지는 5MB 이하만 가능합니다");
            return;
        }
        setThumbnailFile(file);
        setThumbnailPreview(URL.createObjectURL(file));
        setIsClubImage(false);
    };

    const uploadThumbnail = async (): Promise<string | null> => {
        if (!thumbnailFile) {
            if (isClubImage) return null; // 클럽 이미지는 저장 안 함 (폴백으로 표시)
            return thumbnailPreview; // 기존 URL 유지 (수정 시)
        }
        setThumbnailUploading(true);
        try {
            const publicUrl = await uploadImage(thumbnailFile, `auctions/${mdId}`, {
                upsert: true,
                maxWidth: 1920,
            });
            return publicUrl;
        } finally {
            setThumbnailUploading(false);
        }
    };

    const onSubmit = async (values: FormValues) => {
        // 가격 확인 (신규 등록 OR 수정 시 입찰 없으면)
        if (!initialData || (initialData && initialData.bid_count === 0)) {
            const ABSOLUTE_MIN = 50000;
            const hasSmartPricing = priceRec?.sufficient_data && priceRec?.suggested_start_price;
            const recommendedPrice = priceRec?.suggested_start_price || 0;
            const isTooLow = hasSmartPricing
                ? values.start_price < recommendedPrice * 0.7
                : values.start_price < ABSOLUTE_MIN;

            if (isTooLow) {
                const title = "시작가 확인";
                const description = hasSmartPricing
                    ? `입력하신 금액(₩${values.start_price.toLocaleString()})이 추천가(₩${recommendedPrice.toLocaleString()})보다 매우 낮습니다. 0을 빠뜨리지 않았는지 확인해주세요. 이대로 진행하시겠습니까?`
                    : `입력하신 금액(₩${values.start_price.toLocaleString()})이 권장 최소가(₩${ABSOLUTE_MIN.toLocaleString()})보다 매우 낮습니다. 0을 빠뜨리지 않았는지 확인해주세요. 이대로 진행하시겠습니까?`;

                setPendingSubmission({ values });
                setPriceConfirmInfo({ isOpen: true, title, description });
                return; // Wait for confirm
            }
        }
        await performSubmit(values);
    };

    const performSubmit = async (values: FormValues) => {
        try {
            // 세션 확인
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error("세션이 만료되었습니다. 다시 로그인해주세요.");
                router.push("/login");
                return;
            }

            // 이미지 업로드 (선택사항)
            const thumbnailUrl = await uploadThumbnail();

            // 경매 시작 시간 결정
            let auction_start_at: string;
            if (initialData) {
                // 수정 모드: 원본 시작 시간 유지
                auction_start_at = initialData.auction_start_at;
            } else if (instantStart) {
                // 즉시 시작: 제출 시점의 시각 사용
                auction_start_at = new Date().toISOString();
            } else {
                auction_start_at = new Date(values.auction_start_at).toISOString();
                // 안전 폴백: Zod에서 차단하지만 방어적으로 유지
                if (dayjs(auction_start_at).isBefore(dayjs())) {
                    auction_start_at = new Date().toISOString();
                }
            }

            let auction_end_at;
            let finalDurationMinutes = values.duration_minutes;

            if (values.duration_minutes === -1) {
                // 당일 18:00 마감
                const targetEndDate = dayjs(values.event_date).hour(18).minute(0).second(0);
                auction_end_at = targetEndDate.toISOString();

                // 역으로 실제 duration_minutes 계산 (통계용)
                finalDurationMinutes = targetEndDate.diff(dayjs(auction_start_at), 'minute');
                if (finalDurationMinutes <= 0) {
                    toast.error("마감 시간이 시작 시간보다 빠를 수 없습니다.");
                    return;
                }
            } else {
                auction_end_at = dayjs(auction_start_at).add(values.duration_minutes, "minute").toISOString();
            }

            const auctionData: Record<string, any> = {
                md_id: mdId,
                club_id: values.club_id,
                title: `${clubs.find(c => c.id === values.club_id)?.name} ${values.table_info}`,
                table_info: values.table_info,
                table_type: "Standard",
                event_date: values.event_date,
                entry_time: instantEntry ? null : values.entry_time,
                min_people: 1,
                max_people: 10,
                includes: values.includes,
                original_price: values.start_price,
                start_price: values.start_price,
                reserve_price: Math.floor(values.start_price * 0.6),
                current_bid: 0,
                bid_count: 0,
                bidder_count: 0,
                auction_start_at,
                auction_end_at,
                duration_minutes: finalDurationMinutes,
                auto_extend_min: 3,
                status: initialData?.status || "scheduled",
                bid_increment: getBidIncrement(values.start_price),
            };

            // 썸네일 처리: 있으면 저장, 수정 모드에서 제거했으면 명시적 null
            if (thumbnailUrl) {
                auctionData.thumbnail_url = thumbnailUrl;
                // 새로 업로드한 이미지면 클럽 대표 이미지도 영구 업데이트
                if (thumbnailFile) {
                    const supabase = createClient();
                    await supabase
                        .from("clubs")
                        .update({ thumbnail_url: thumbnailUrl })
                        .eq("id", values.club_id);
                }
            } else if (initialData) {
                auctionData.thumbnail_url = null;
            }

            // 경매 등록/수정 (API Route 경유 — RLS 우회)
            const res = await fetch("/api/auctions/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    auctionData,
                    isUpdate: !!initialData,
                    auctionId: initialData?.id || null,
                }),
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || "경매 등록에 실패했습니다.");
            }

            trackEvent("auction_created", {
                auction_id: result.id,
                club_id: values.club_id,
                start_price: values.start_price,
                duration_minutes: finalDurationMinutes,
                is_update: !!initialData,
            });

            if (initialData) {
                // 수정: 기존 동작 유지
                toast.success("경매 정보가 수정되었습니다!");
                setTimeout(() => {
                    router.push("/md/dashboard");
                }, 300);
            } else {
                // 신규 등록: 공유 시트 표시
                setCreatedAuctionId(result.id);
                setShowShareSheet(true);
            }
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'AuctionForm.performSubmit');
            toast.error(msg);
        }
    };

    const toggleInclude = (item: string) => {
        const current = selectedIncludes;
        if (current.includes(item)) {
            setValue("includes", current.filter((i: string) => i !== item));
        } else {
            setValue("includes", [...current, item]);
        }
    };

    return (
        <div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">
            {/* 템플릿 버튼 (신규 등록 + 재등록이 아닐 때만) */}
            {!initialData && !repostFrom && (
                recentTemplate ? (
                    <div className="space-y-1.5">
                        <button
                            type="button"
                            onClick={() => {
                                handleTemplateApply(recentTemplate);
                            }}
                            className="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-neutral-800/50 border border-neutral-700/50 hover:border-green-500/30 transition-colors"
                        >
                            <Bookmark className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="text-sm font-bold text-white truncate">{recentTemplate.name}</span>
                            <span className="ml-auto text-xs font-bold text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full shrink-0">적용</span>
                        </button>
                        {templateCount > 1 && (
                            <button
                                type="button"
                                onClick={() => setShowTemplateDrawer(true)}
                                className="w-full text-center text-[11px] text-neutral-500 hover:text-white transition-colors py-1"
                            >
                                다른 템플릿 보기 ({templateCount - 1})
                            </button>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowTemplateDrawer(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 hover:text-white transition-colors"
                    >
                        <Bookmark className="w-4 h-4" />
                        <span className="text-sm font-bold">내 템플릿 만들기</span>
                    </button>
                )
            )}

            {/* Top Toggle: Today vs Advance */}
            <div className="flex bg-[#1C1C1E] rounded-xl p-1 border border-neutral-800">
                <button
                    type="button"
                    onClick={() => {
                        setAuctionMode("today");
                        setInstantEntry(false);
                        setValue("entry_time", dayjs().add(1, "hour").format("HH:mm"));
                        setValue("event_date", getClubEventDate());
                        setValue("duration_minutes", 15);
                    }}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${auctionMode === "today"
                        ? "bg-amber-500 text-black shadow-sm"
                        : "text-neutral-500 hover:text-white"
                        }`}
                >
                    🔥 오늘 특가 (타임세일)
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setAuctionMode("advance");
                        setInstantEntry(false);
                        setValue("entry_time", "22:00");
                        setValue("duration_minutes", 24 * 60);
                        // 경매 종료(24h) 이후 22:00이 오는 첫 날짜
                        const auctionEnd = dayjs().add(24 * 60, "minute");
                        let ed = auctionEnd.format("YYYY-MM-DD");
                        if (dayjs(`${ed}T22:00`).isBefore(auctionEnd)) {
                            ed = auctionEnd.add(1, "day").format("YYYY-MM-DD");
                        }
                        setValue("event_date", ed);
                    }}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${auctionMode === "advance"
                        ? "bg-white text-black shadow-sm"
                        : "text-neutral-500 hover:text-white"
                        }`}
                >
                    📅 얼리버드
                </button>
            </div>

            {/* 1. 클럽 선택 + 대표 이미지 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Building2 className="w-4 h-4 text-green-500" />
                    <span>클럽 선택</span>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-xl overflow-hidden">
                    <input type="file" accept="image/*" id="thumbnail-upload" className="hidden" onChange={handleThumbnailSelect} />
                    <select
                        {...register("club_id")}
                        disabled={!isTermsEditable}
                        className={`w-full h-12 bg-transparent px-4 text-white focus:outline-none appearance-none ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <option value="">클럽을 선택하세요</option>
                        {clubs.map(club => (
                            <option key={club.id} value={club.id}>{club.name} ({club.area})</option>
                        ))}
                    </select>
                    {selectedClub && (
                        <div className="flex items-center gap-3 border-t border-neutral-800 px-3 py-2.5">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-900 shrink-0">
                                {(() => {
                                    if (thumbnailPreview) {
                                        return <img src={thumbnailPreview} alt="대표 이미지" className="w-full h-full object-cover" />;
                                    }
                                    const clubImg = selectedClub?.thumbnail_url;
                                    const drinkImg = getDrinkCategoryImage(selectedIncludes);
                                    const fallbackUrl = clubImg || drinkImg;
                                    if (fallbackUrl) {
                                        return <img src={fallbackUrl} alt="기본 이미지" className="w-full h-full object-cover" />;
                                    }
                                    return (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageIcon className="w-4 h-4 text-neutral-700" />
                                        </div>
                                    );
                                })()}
                            </div>
                            <p className="flex-1 min-w-0 text-[11px] text-neutral-500 truncate">
                                {thumbnailPreview
                                    ? "커스텀 이미지 적용 중"
                                    : selectedClub.thumbnail_url
                                        ? "대표 이미지 적용"
                                        : getDrinkCategoryImage(selectedIncludes)
                                            ? "주류 기본 이미지"
                                            : "이미지 미설정"
                                }
                            </p>
                            {thumbnailPreview ? (
                                <button
                                    type="button"
                                    onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); setIsClubImage(false); }}
                                    className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <label
                                    htmlFor="thumbnail-upload"
                                    className="text-[11px] text-neutral-500 font-medium px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 cursor-pointer transition-colors shrink-0"
                                >
                                    변경
                                </label>
                            )}
                        </div>
                    )}
                </div>
                {errors.club_id && <p className="text-red-500 text-xs">{errors.club_id?.message?.toString()}</p>}
            </section>

            {/* 2. 테이블 위치 */}
            <section className="space-y-4">
                <button
                    type="button"
                    onClick={() => hasFloorPlan && setFloorPlanExpanded(!floorPlanExpanded)}
                    className="flex items-center gap-2 w-full mb-2"
                >
                    <MapPin className="w-4 h-4 text-green-500" />
                    <span className="text-white font-bold">테이블 위치</span>
                    {hasFloorPlan && (
                        <>
                            <span className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">등록됨</span>
                            <ChevronDown className={`w-4 h-4 text-neutral-400 ml-auto transition-transform ${floorPlanExpanded ? 'rotate-180' : ''}`} />
                        </>
                    )}
                </button>

                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
                    {hasFloorPlan && !floorPlanExpanded && (
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setFloorPlanExpanded(true)}>
                            <img src={floorPlanUrl!} alt="플로어맵" className="w-20 h-14 object-cover rounded-lg border border-neutral-800" />
                            <span className="text-xs text-neutral-500">탭하여 플로어맵 확인</span>
                        </div>
                    )}
                    {hasFloorPlan && floorPlanExpanded && (
                        <div className="space-y-2">
                            <div className="rounded-xl overflow-hidden border border-neutral-800">
                                <img
                                    src={floorPlanUrl!}
                                    alt="플로어맵"
                                    className="w-full h-auto block select-none pointer-events-none"
                                    draggable={false}
                                />
                            </div>
                            <label className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-neutral-400 hover:text-green-400 cursor-pointer transition-colors">
                                <RefreshCw className="w-3.5 h-3.5" />
                                {floorPlanUploading ? "업로드 중..." : "플로어맵 변경"}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={floorPlanUploading}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFloorPlanUpload(file);
                                    }}
                                />
                            </label>
                        </div>
                    )}
                    {!hasFloorPlan && selectedClub && (
                        <label className="flex flex-col items-center gap-3 p-5 border-2 border-dashed border-neutral-700 rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-all">
                            <MapPin className="w-8 h-8 text-green-500/60" />
                            <div className="text-center">
                                <p className="text-sm font-bold text-neutral-300">
                                    플로어맵을 등록해보세요
                                </p>
                                <p className="text-xs text-neutral-500 mt-1">
                                    자리 위치를 시각적으로 전달하면<br/>입찰 전환율이 높아집니다
                                </p>
                            </div>
                            <span className="text-xs font-bold text-green-500 bg-green-500/10 px-3 py-1.5 rounded-full">
                                {floorPlanUploading ? "업로드 중..." : "이미지 선택"}
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={floorPlanUploading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFloorPlanUpload(file);
                                }}
                            />
                        </label>
                    )}
                    <Input
                        {...register("table_info")}
                        type="text"
                        disabled={!isTermsEditable}
                        placeholder="테이블 위치를 입력하세요. 예) A3"
                        className={`bg-neutral-900 border-neutral-800 h-11 rounded-lg text-white ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    {errors.table_info && <p className="text-red-500 text-xs">{errors.table_info?.message?.toString()}</p>}
                </div>
            </section>

            {/* 3. 주류 선택 */}
            <LiquorSelector
                selected={selectedIncludes.filter((item: string) =>
                    LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
                )}
                disabled={!isTermsEditable}
                onSelect={(liquors) => {
                    if (!isTermsEditable) return;
                    const extras = selectedIncludes.filter(
                        (item: string) => !LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
                    );
                    setValue("includes", [...liquors, ...extras]);
                }}
            />

            {/* 테이블 구성 */}
            <section className={`space-y-4 ${!isTermsEditable ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>테이블 구성</span>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {EXTRAS_OPTIONS.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => toggleInclude(item)}
                                className={`px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${selectedIncludes.includes(item)
                                    ? "bg-green-500 text-black"
                                    : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                                    }`}
                            >
                                {selectedIncludes.includes(item) && <Check className="w-3 h-3" />}
                                {item}
                            </button>
                        ))}
                        {/* 직접 입력으로 추가된 커스텀 항목 */}
                        {selectedIncludes
                            .filter((item: string) => !EXTRAS_OPTIONS.includes(item) && !LIQUOR_KEYWORDS.some(kw => item.includes(kw)))
                            .map((item: string) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleInclude(item)}
                                    className="px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all bg-green-500 text-black"
                                >
                                    <X className="w-3 h-3" />
                                    {item}
                                </button>
                            ))}
                    </div>
                    {/* 직접 입력 */}
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            value={customExtra}
                            onChange={(e) => setCustomExtra(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    const trimmed = customExtra.trim();
                                    if (trimmed && !selectedIncludes.includes(trimmed)) {
                                        setValue("includes", [...selectedIncludes, trimmed]);
                                        setCustomExtra("");
                                    }
                                }
                            }}
                            placeholder="직접 입력 (예: 스파클러 서비스)"
                            className="flex-1 bg-neutral-900 border-neutral-800 h-9 rounded-lg text-white text-[12px]"
                        />
                        <Button
                            type="button"
                            onClick={() => {
                                const trimmed = customExtra.trim();
                                if (trimmed && !selectedIncludes.includes(trimmed)) {
                                    setValue("includes", [...selectedIncludes, trimmed]);
                                    setCustomExtra("");
                                }
                            }}
                            disabled={!customExtra.trim()}
                            className="h-9 px-3 bg-green-500 hover:bg-green-600 text-black font-bold text-xs rounded-lg disabled:opacity-30"
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* 주류 변경 안내 */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                    <p className="text-[11px] text-amber-500 font-bold">주류 변경 안내</p>
                    <p className="text-[10px] text-amber-500/80">• 현장에서 동급 브랜드 변경 가능</p>
                    <p className="text-[10px] text-amber-500/80">• 낙찰가 이하 환불 불가</p>
                </div>
                {errors.includes && <p className="text-red-500 text-[11px]">{errors.includes?.message?.toString()}</p>}
            </section>


            {/* Smart Pricing 추천 — 충분한 데이터(3건+)가 있을 때만 토글 표시 */}
            {selectedClubId && priceRec?.sufficient_data && (
                <div>
                    <button
                        type="button"
                        onClick={() => setShowSmartPricing(prev => !prev)}
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors py-2"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-green-500" />
                        <span>AI 추천 시작가 {showSmartPricing ? "접기" : "보기"}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSmartPricing ? "rotate-180" : ""}`} />
                    </button>
                    {showSmartPricing && (
                        <SmartPricingCard
                            recommendation={priceRec}
                            loading={priceRecLoading}
                            onApply={handleApplyRecommendation}
                        />
                    )}
                </div>
            )}

            {/* 4. 가격 설정 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Wine className="w-4 h-4 text-amber-500" />
                    <span>가격 설정</span>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-6">
                    <div className="space-y-3">
                        <Label className="text-neutral-400 text-[10px] font-bold uppercase">경매 시작가</Label>
                        {hasBids && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-2">
                                <p className="text-[12px] text-amber-400 font-bold">🔒 입찰이 있어 경매 조건 변경 불가</p>
                                <p className="text-[10px] text-amber-400/80 mt-1">이미 {initialData.bid_count}회 입찰이 있어 가격, 주류, 테이블, 지속시간을 변경할 수 없습니다.</p>
                            </div>
                        )}
                        <Input
                            type="text"
                            value={startPriceDisplay}
                            disabled={!isTermsEditable}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, "");
                                const numValue = value === "" ? 0 : parseInt(value, 10);
                                setValue("start_price", numValue);
                                setStartPriceDisplay(value === "" ? "" : numValue.toLocaleString());
                            }}
                            placeholder="예: 300,000"
                            className={`bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-green-500 ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 10000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+1만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 50000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+5만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 100000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+10만</Button>
                        </div>

                        {/* 가격 경고 */}
                        {(() => {
                            const ABSOLUTE_MIN = 50000; // 절대 최소가 5만원
                            const hasSmartPricing = priceRec?.sufficient_data && priceRec?.suggested_start_price;
                            const recommendedPrice = priceRec?.suggested_start_price || 0;
                            const isTooLow = hasSmartPricing
                                ? currentStartPrice > 0 && currentStartPrice < recommendedPrice * 0.7
                                : currentStartPrice > 0 && currentStartPrice < ABSOLUTE_MIN;

                            if (!isTooLow) return null;

                            return (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-1">
                                    <p className="text-[12px] text-red-400 font-bold">⚠️ 시작가가 매우 낮습니다!</p>
                                    {hasSmartPricing ? (
                                        <>
                                            <p className="text-[11px] text-red-400/80">• 추천 시작가: ₩{recommendedPrice.toLocaleString()}</p>
                                            <p className="text-[11px] text-red-400/80">• 현재 입력: ₩{currentStartPrice.toLocaleString()} (추천가의 {Math.round(currentStartPrice / recommendedPrice * 100)}%)</p>
                                            <p className="text-[11px] text-red-400/80">• 0을 빠뜨렸는지 확인해주세요</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-[11px] text-red-400/80">• 권장 최소가: ₩{ABSOLUTE_MIN.toLocaleString()}</p>
                                            <p className="text-[11px] text-red-400/80">• 현재 입력: ₩{currentStartPrice.toLocaleString()}</p>
                                            <p className="text-[11px] text-red-400/80">• 0을 빠뜨렸는지 확인해주세요</p>
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        {errors.start_price && currentStartPrice < 1 && <p className="text-red-500 text-[11px]">{errors.start_price?.message?.toString()}</p>}
                    </div>

                </div>
            </section>

            {/* 6. 일정 설정 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Calendar className="w-4 h-4 text-green-500" />
                    <span>일정 설정</span>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-neutral-400 text-[10px] font-bold uppercase">입장 시간</Label>
                            {auctionMode === "today" && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={instantEntry}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setInstantEntry(checked);
                                        setValue("entry_time", checked ? null : dayjs().add(1, "hour").format("HH:mm"));
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 accent-green-500"
                                />
                                <span className="text-[10px] text-white font-bold">즉시 입장</span>
                            </label>
                            )}
                        </div>
                        {instantEntry ? (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl h-11 flex items-center px-4">
                                <span className="text-green-500 text-sm font-bold">낙찰 후 바로 입장 가능</span>
                            </div>
                        ) : auctionMode === "today" ? (
                            <Input
                                type="datetime-local"
                                value={(() => {
                                    const t = watch("entry_time") || dayjs().add(1, "hour").format("HH:mm");
                                    const d = watch("event_date");
                                    const combined = dayjs(`${d}T${t}`);
                                    if (combined.isBefore(dayjs())) {
                                        return combined.add(1, "day").format("YYYY-MM-DDTHH:mm");
                                    }
                                    return combined.format("YYYY-MM-DDTHH:mm");
                                })()}
                                min={(() => {
                                    const start = instantStart ? dayjs() : dayjs(watch("auction_start_at"));
                                    const dur = watch("duration_minutes");
                                    const end = dur === -1
                                        ? dayjs(watch("event_date")).hour(18).minute(0)
                                        : start.add(dur, "minute");
                                    const floor = dayjs();
                                    return (end.isAfter(floor) ? end : floor).format("YYYY-MM-DDTHH:mm");
                                })()}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                        const picked = dayjs(val);
                                        const pickedTime = picked.format("HH:mm");
                                        const eventDate = picked.hour() < 4
                                            ? picked.subtract(1, "day").format("YYYY-MM-DD")
                                            : picked.format("YYYY-MM-DD");
                                        setValue("event_date", eventDate);
                                        setValue("entry_time", pickedTime);
                                    }
                                }}
                                className="bg-neutral-900 border-neutral-800 h-11 text-white [color-scheme:dark]"
                            />
                        ) : (
                            <Input
                                type="datetime-local"
                                value={(() => {
                                    const t = watch("entry_time") || "22:00";
                                    const d = watch("event_date");
                                    return dayjs(`${d}T${t}`).format("YYYY-MM-DDTHH:mm");
                                })()}
                                min={dayjs(getClubEventDate()).add(1, "day").set("hour", 0).set("minute", 0).format("YYYY-MM-DDTHH:mm")}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val) {
                                        const picked = dayjs(val);
                                        const pickedTime = picked.format("HH:mm");
                                        const eventDate = picked.hour() < 4
                                            ? picked.subtract(1, "day").format("YYYY-MM-DD")
                                            : picked.format("YYYY-MM-DD");
                                        setValue("event_date", eventDate);
                                        setValue("entry_time", pickedTime);
                                    }
                                }}
                                className="bg-neutral-900 border-neutral-800 h-11 text-white [color-scheme:dark]"
                            />
                        )}
                        {errors.event_date && <p className="text-red-500 text-[11px]">{errors.event_date?.message?.toString()}</p>}
                        {errors.entry_time && <p className="text-red-500 text-[11px]">{errors.entry_time?.message?.toString()}</p>}
                    </div>
                    {!initialData && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-neutral-400 text-[10px] font-bold uppercase">경매 시작 일시</Label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={instantStart}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setInstantStart(checked);
                                        setValue("instant_start", checked);
                                        if (!checked) {
                                            setValue("auction_start_at", dayjs().format("YYYY-MM-DDTHH:mm"));
                                        }
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 accent-green-500"
                                />
                                <span className="text-[10px] text-white font-bold">즉시 시작</span>
                            </label>
                        </div>
                        {instantStart ? (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl h-11 flex items-center px-4">
                                <span className="text-green-500 text-sm font-bold">등록 즉시 경매가 시작됩니다</span>
                            </div>
                        ) : (
                            <>
                                <Input {...register("auction_start_at")} type="datetime-local" min={dayjs().format("YYYY-MM-DDTHH:mm")} className="bg-neutral-900 border-neutral-800 h-11 text-white [color-scheme:dark]" />
                                {errors.auction_start_at && <p className="text-red-500 text-[11px]">{errors.auction_start_at?.message?.toString()}</p>}
                            </>
                        )}
                    </div>
                    )}
                    <div className={`space-y-3 ${!isTermsEditable ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Label className="text-neutral-400 text-[10px] font-bold uppercase">경매 지속 시간</Label>
                        {(() => {
                            const eventDate = watch("event_date");

                            if (auctionMode === "today") {
                                return (
                                    <div className="grid grid-cols-3 gap-2">
                                        {[{ label: "15분", value: 15 }, { label: "30분", value: 30 }, { label: "1시간", value: 60 }].map((opt) => (
                                            <button key={opt.value} type="button" onClick={() => setValue("duration_minutes", opt.value)} className={`h-10 rounded-lg text-xs font-bold transition-all ${watch("duration_minutes") === opt.value ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-500 border border-neutral-800"}`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            } else {
                                // 내일 이후
                                const futureOptions = [
                                    { label: "24시간", value: 24 * 60 },
                                    { label: "48시간", value: 48 * 60 },
                                    { label: "방문일 18:00 마감", value: -1 } // 특수 플래그
                                ];

                                return (
                                    <div className="grid grid-cols-1 gap-2">
                                        {futureOptions.map((opt) => (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => setValue("duration_minutes", opt.value)}
                                                className={`h-10 rounded-lg text-xs font-bold transition-all ${watch("duration_minutes") === opt.value ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-500 border border-neutral-800"}`}
                                            >
                                                {opt.label}
                                                {opt.value === -1 && (
                                                    <span className="ml-2 text-[10px] font-normal text-green-500">
                                                        ({dayjs(eventDate).format('M/D')} 18:00 자동 종료)
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                );
                            }
                        })()}
                        {errors.duration_minutes && <p className="text-red-500 text-[11px] mt-2">{errors.duration_minutes?.message?.toString()}</p>}
                    </div>
                </div>
            </section>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent z-50">
                <div className="max-w-lg mx-auto">
                    <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl bg-white text-black font-black text-lg hover:bg-neutral-200 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        {isSubmitting ? (initialData ? "수정 중..." : "등록 중...") : (initialData ? "경매 정보 수정하기" : "경매 시작하기")}
                        <ArrowRight className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                isOpen={!!priceConfirmInfo?.isOpen}
                onOpenChange={(open) => setPriceConfirmInfo(prev => prev ? { ...prev, isOpen: open } : null)}
                onConfirm={() => pendingSubmission && performSubmit(pendingSubmission.values)}
                onCancel={() => setPriceConfirmInfo(null)}
                title={priceConfirmInfo?.title || "시작가 확인"}
                description={priceConfirmInfo?.description}
                confirmText="진행하기"
            />

        </form>

        {/* 공유 성공 시트 (신규 등록 시에만) */}
        {createdAuctionId && (
            <ShareSuccessSheet
                isOpen={showShareSheet}
                onOpenChange={(open) => {
                    setShowShareSheet(open);
                }}
                auctionId={createdAuctionId}
                clubName={selectedClub?.name || "클럽"}
                tableInfo={watch("table_info")}
                eventDate={watch("event_date")}
                startPrice={watch("start_price")}
                formValues={{
                    club_id: watch("club_id"),
                    includes: watch("includes"),
                    start_price: watch("start_price"),
                    duration_minutes: watch("duration_minutes"),
                }}
                clubName2={selectedClub?.name}
                onContinue={() => {
                    setCreatedAuctionId(null);
                    setShowShareSheet(false);
                    setValue("table_info", "");
                    setValue("event_date", getClubEventDate());
                    setAuctionMode("today");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    toast.success("설정이 유지됩니다. 테이블 위치만 입력하세요!");
                }}
            />
        )}

        {/* 템플릿 Drawer */}
        <TemplateDrawer
            isOpen={showTemplateDrawer}
            onOpenChange={setShowTemplateDrawer}
            onApply={handleTemplateApply}
        />
        </div>
    );
}

