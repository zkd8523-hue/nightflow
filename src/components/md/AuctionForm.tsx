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
import type { Club, Auction, PriceRecommendation } from "@/types/database";
import { Calendar, Wine, Check, ArrowRight, ImageIcon, ChevronDown, MapPin, X, RefreshCw, Building2 } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
dayjs.locale("ko");
import { getClubEventDate } from "@/lib/utils/date";
import {
    getBidIncrement,
    isEarlybirdEndValid,
    isEventDateWithinWindow,
    getEarlybirdEndDateOptions,
    EARLYBIRD_MAX_EVENT_DAYS_AHEAD,
} from "@/lib/utils/auction";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { uploadImage } from "@/lib/utils/upload";
import { ShareSuccessSheet } from "./ShareSuccessSheet";

import { trackEvent } from "@/lib/analytics";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { isInstantEnabled } from "@/lib/features";

const formSchema = z.object({
    listing_type: z.enum(["auction", "instant"]).default("auction"),
    club_id: z.string().min(1, "클럽을 선택해주세요."),
    table_info: z.string().min(1, "테이블 정보를 입력해주세요."),
    start_price: z.number().min(1, "가격은 0원보다 커야 합니다."),
    buy_now_price: z.number().optional(),
    entry_time: z.string().nullable(),
    event_date: z.string(),
    auction_start_at: z.string(),
    instant_start: z.boolean().optional(),
    duration_minutes: z.number().min(1, "지속 시간을 선택해주세요."),
    // 얼리버드에서는 auction_end_at을 직접 지정. instant에서는 duration_minutes 사용.
    auction_end_at: z.string().optional(),
    includes: z.array(z.string()).min(1, "최소 한 개의 포함 내역을 선택해주세요."),
}).superRefine((data, ctx) => {
    // 얼리버드 (listing_type='auction'): 이벤트일 윈도우 + 마감 시각 규칙 강제
    if (data.listing_type === "auction") {
        // 이벤트일은 오늘 ~ +7일 이내
        if (data.event_date && !isEventDateWithinWindow(data.event_date)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `이벤트는 오늘부터 ${EARLYBIRD_MAX_EVENT_DAYS_AHEAD}일 이내여야 합니다.`,
                path: ["event_date"],
            });
        }

        if (!data.auction_end_at) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "마감 시각을 선택해주세요.",
                path: ["auction_end_at"],
            });
        } else if (process.env.NODE_ENV !== "development" && !isEarlybirdEndValid(data.event_date, data.auction_end_at)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "마감은 이벤트 -2일 이전 21:00이어야 합니다.",
                path: ["auction_end_at"],
            });
        }
    }

    // 즉시낙찰가(BIN)가 시작가보다 낮은지 체크
    if (data.listing_type === "auction" && data.buy_now_price && data.buy_now_price < data.start_price) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "즉시낙찰가는 시작가보다 낮을 수 없습니다.",
            path: ["buy_now_price"],
        });
    }

    // 오늘특가: 시작 일시가 현재보다 과거인지 체크 — 즉시 시작이면 건너뜀
    if (data.listing_type === "instant" && !data.instant_start && data.auction_start_at && dayjs(data.auction_start_at).isBefore(dayjs())) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "시작 일시는 현재 시각 이후여야 합니다.",
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
    const instantEnabled = isInstantEnabled();
    const [auctionMode, setAuctionMode] = useState<"today" | "advance">(() => {
        if (initialData) {
            // 기존 데이터 수정은 그대로 유지 (진행 중인 instant 거래 보존)
            return initialData.listing_type === "instant"
                ? "today"
                : (dayjs(initialData.event_date).isSame(getClubEventDate(), "day") ? "today" : "advance");
        }
        // 신규 등록: instant off면 advance 강제
        return instantEnabled ? "today" : "advance";
    });
    const isInstantMode = auctionMode === "today";
    const [startPriceDisplay, setStartPriceDisplay] = useState((initialData?.start_price || prefill?.start_price)?.toLocaleString() || "");
    const [binPriceDisplay, setBinPriceDisplay] = useState(
        (initialData?.buy_now_price || prefill?.buy_now_price)?.toLocaleString() || ""
    );
    const [binEnabled, setBinEnabled] = useState(
        !!(initialData?.buy_now_price && initialData.listing_type === 'auction') ||
        !!(prefill?.buy_now_price && prefill.listing_type === 'auction')
    );
    const [instantEntry, setInstantEntry] = useState(
        initialData ? !initialData.entry_time
        : prefill ? !prefill.entry_time
        : false
    );

    const [customExtra, setCustomExtra] = useState("");
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(initialData?.thumbnail_url || null);
    const [isClubImage, setIsClubImage] = useState(false);
    const [localFloorPlanUrls, setLocalFloorPlanUrls] = useState<Record<string, string>>({});
    const [setAsClubDefault, setSetAsClubDefault] = useState(false);
    const [floorPlanUploading, setFloorPlanUploading] = useState(false);
    const [floorPlanExpanded, setFloorPlanExpanded] = useState(false);
    // 얼리버드 마감 옵션 토글 (기본은 -2일 카드만, 클릭 시 -3/-4일 펼침)
    const [showAllEndOptions, setShowAllEndOptions] = useState(false);


    // Dialog States
    const [priceConfirmInfo, setPriceConfirmInfo] = useState<{ isOpen: boolean, title: string, description: string } | null>(null);
    const [pendingSubmission, setPendingSubmission] = useState<{ values: FormValues } | null>(null);

    // Share Success Sheet state
    const [showShareSheet, setShowShareSheet] = useState(false);
    const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);

    // 얼리버드 기본 event_date: 오늘 + 3일 (→ 마감 옵션 최소 1개 보장)
    const defaultEarlybirdEventDate = dayjs().add(3, "day").format("YYYY-MM-DD");
    const initialEventDate = initialData?.event_date
        || (prefill?.event_date)
        || (initialData?.listing_type === "auction" ? defaultEarlybirdEventDate : getClubEventDate());

    const { register, handleSubmit, setValue, watch, clearErrors, formState: { errors, isSubmitting } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            listing_type: initialData?.listing_type || (instantEnabled ? "instant" : "auction"),
            club_id: initialData?.club_id || prefill?.club_id || defaultClubId || "",
            table_info: initialData?.table_info || prefill?.table_info || "",
            duration_minutes: initialData?.duration_minutes || prefill?.duration_minutes || 240,
            includes: initialData?.includes || prefill?.includes || ["기본 안주"],
            event_date: initialEventDate,
            start_price: initialData?.start_price || prefill?.start_price || 0,
            buy_now_price: (initialData?.buy_now_price && initialData.listing_type === 'auction')
                ? initialData.buy_now_price
                : (prefill?.buy_now_price && prefill.listing_type === 'auction')
                    ? prefill.buy_now_price
                    : undefined,
            entry_time: initialData
                ? (initialData.entry_time ?? null)
                : (prefill?.entry_time ?? "22:00"),
            auction_start_at: initialData?.auction_start_at ? dayjs(initialData.auction_start_at).format("YYYY-MM-DDTHH:mm") : dayjs().format("YYYY-MM-DDTHH:mm"),
            auction_end_at: initialData?.auction_end_at || undefined,
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
    const hasBids = initialData && (initialData.bid_count > 0 || (initialData.chat_interest_count ?? 0) > 0);
    const isTermsEditable = !hasBids;

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

    useEffect(() => {
        if (!selectedClubId) {
            setPriceRec(null);
            return;
        }
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

    // Watch auction mode to auto-reset fields when switching between modes
    useEffect(() => {
        const isToday = auctionMode === "today";
        const currentDuration = watch("duration_minutes");

        if (isToday) {
            // 오늘특가로 전환 — duration_minutes 기본값 복원 (4시간)
            if (![60, 120, 240].includes(currentDuration)) {
                setValue("duration_minutes", 240);
            }
            setValue("listing_type", "instant");
        } else {
            // 얼리버드로 전환
            setValue("listing_type", "auction");
            // event_date가 너무 가까우면 기본값으로 보정
            const eventDate = watch("event_date");
            const daysAway = dayjs(eventDate).diff(dayjs().startOf("day"), "day");
            if (daysAway < 2) {
                setValue("event_date", dayjs().add(3, "day").format("YYYY-MM-DD"));
            }
            // auction_end_at 자동 설정: 선택 가능한 가장 늦은 마감(= -2일 21:00)
            const targetEvent = watch("event_date");
            const options = getEarlybirdEndDateOptions(targetEvent);
            if (options.length > 0) {
                // 기본값: 가장 가까운 마감 = -2일 (daysBefore가 가장 작은 것)
                const nearest = options.reduce((a, b) => (a.daysBefore < b.daysBefore ? a : b));
                setValue("auction_end_at", nearest.endAtISO);
            }
            // 얼리버드에서는 즉시 입장 불가 — 해제
            if (instantEntry) {
                setInstantEntry(false);
                setValue("entry_time", "22:00");
            }
        }
    }, [auctionMode, setValue]);  // eslint-disable-line react-hooks/exhaustive-deps

    // 얼리버드 모드에서 event_date 변경 시 auction_end_at 자동 재계산
    const watchedEventDate = watch("event_date");
    useEffect(() => {
        if (auctionMode !== "advance") return;
        const options = getEarlybirdEndDateOptions(watchedEventDate);
        if (options.length === 0) {
            setValue("auction_end_at", undefined);
            return;
        }
        // 현재 선택된 값이 새 옵션 목록에 없으면 기본값(가장 가까운 마감)으로 보정
        const currentEnd = watch("auction_end_at");
        const match = options.find(o => o.endAtISO === currentEnd);
        if (!match) {
            const nearest = options.reduce((a, b) => (a.daysBefore < b.daysBefore ? a : b));
            setValue("auction_end_at", nearest.endAtISO);
        }
    }, [watchedEventDate, auctionMode, setValue]);  // eslint-disable-line react-hooks/exhaustive-deps

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
        setSetAsClubDefault(false);
    };

    const uploadThumbnail = async (): Promise<string | null> => {
        if (!thumbnailFile) {
            if (isClubImage) return null; // 클럽 이미지는 저장 안 함 (폴백으로 표시)
            return thumbnailPreview; // 기존 URL 유지 (수정 시)
        }
        const publicUrl = await uploadImage(thumbnailFile, `auctions/${mdId}`, {
            upsert: true,
            maxWidth: 1920,
        });
        return publicUrl;
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
            } else if (values.listing_type === "auction") {
                // 얼리버드: 등록 즉시 시작 (규칙 고정)
                auction_start_at = new Date().toISOString();
            } else {
                // 오늘특가: 등록 즉시 시작
                auction_start_at = new Date().toISOString();
            }

            let auction_end_at: string;
            let finalDurationMinutes = values.duration_minutes;

            if (values.listing_type === "auction") {
                // 얼리버드: 사용자가 선택한 auction_end_at 사용
                if (!values.auction_end_at) {
                    toast.error("마감 시각을 선택해주세요.");
                    return;
                }
                auction_end_at = values.auction_end_at;
                finalDurationMinutes = dayjs(auction_end_at).diff(dayjs(auction_start_at), "minute");
                if (finalDurationMinutes <= 0) {
                    toast.error("마감 시각이 시작 시각보다 빠를 수 없습니다.");
                    return;
                }
            } else {
                // 오늘특가: duration_minutes 기반
                auction_end_at = dayjs(auction_start_at).add(values.duration_minutes, "minute").toISOString();
            }

            const auctionData: Record<string, unknown> = {
                md_id: mdId,
                listing_type: values.listing_type || "auction",
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
                auto_extend_min: isInstantMode ? 0 : 3,
                max_extensions: isInstantMode ? 0 : 3,
                status: initialData?.status || "scheduled",
                bid_increment: getBidIncrement(values.start_price),
            };

            // instant 모드: buy_now_price = start_price (서버에서도 강제하지만 클라이언트도 설정)
            if (isInstantMode) {
                auctionData.buy_now_price = values.start_price;
            } else if (binEnabled && values.buy_now_price && values.buy_now_price > 0) {
                // 얼리버드 경매: MD가 설정한 BIN 가격
                auctionData.buy_now_price = values.buy_now_price;
            } else {
                auctionData.buy_now_price = null;
            }

            // 썸네일 처리: 있으면 저장, 수정 모드에서 제거했으면 명시적 null
            if (thumbnailUrl) {
                auctionData.thumbnail_url = thumbnailUrl;
                // "기본으로 설정" 체크 시에만 클럽 대표 이미지 업데이트
                if (thumbnailFile && setAsClubDefault) {
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
                throw new Error(result.error || "등록에 실패했습니다.");
            }

            trackEvent("auction_created", {
                auction_id: result.id,
                listing_type: values.listing_type,
                club_id: values.club_id,
                area: clubs.find(c => c.id === values.club_id)?.area,
                start_price: values.start_price,
                duration_minutes: finalDurationMinutes,
                is_update: !!initialData,
            });

            if (initialData) {
                // 수정: 기존 동작 유지
                toast.success(isInstantMode ? "판매 정보가 수정되었습니다!" : "경매 정보가 수정되었습니다!");
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

    // 토글 노출 조건: instant on이거나 기존 instant 데이터를 수정 중일 때
    const isEditingInstant = !!initialData && initialData.listing_type === "instant";
    const showModeToggle = instantEnabled || isEditingInstant;

    return (
        <div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">
            {/* Top Toggle: Today vs Advance — instant off 시 신규 등록에서는 숨김 */}
            {showModeToggle && (
                <div className="flex bg-[#1C1C1E] rounded-xl p-1 border border-neutral-800">
                    <button
                        type="button"
                        onClick={() => {
                            setAuctionMode("today");
                            setValue("listing_type", "instant");
                            setInstantEntry(false);
                            setValue("entry_time", "22:00");
                            setValue("event_date", getClubEventDate());
                            setValue("duration_minutes", 240);
                        }}
                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${auctionMode === "today"
                            ? "bg-amber-500 text-black shadow-sm"
                            : "text-neutral-500 hover:text-white"
                            }`}
                    >
                        🔥 오늘특가 (타임세일)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setAuctionMode("advance");
                            setValue("listing_type", "auction");
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
                        📅 얼리버드 경매
                    </button>
                </div>
            )}



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
                                    ? "대표이미지 · 커스텀 적용 중"
                                    : selectedClub.thumbnail_url
                                        ? "대표이미지 · 클럽 기본"
                                        : getDrinkCategoryImage(selectedIncludes)
                                            ? "대표이미지 · 주류 기본"
                                            : "대표이미지 · 미설정"
                                }
                            </p>
                            {thumbnailPreview && thumbnailFile ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={setAsClubDefault}
                                            onChange={(e) => setSetAsClubDefault(e.target.checked)}
                                            className="w-3 h-3 rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 accent-green-500"
                                        />
                                        <span className="text-[10px] text-neutral-400 font-medium whitespace-nowrap">기본으로 설정</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); setIsClubImage(false); setSetAsClubDefault(false); }}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : thumbnailPreview ? (
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
                                    {selectedClub.thumbnail_url || getDrinkCategoryImage(selectedIncludes) ? "변경" : "등록"}
                                </label>
                            )}
                        </div>
                    )}
                </div>
                {errors.club_id && <p className="text-red-500 text-xs">{errors.club_id?.message?.toString()}</p>}
            </section>

            {/* 2. 테이블 위치 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-green-500" />
                    <span className="text-white font-bold">테이블 위치</span>
                </div>

                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
                    {hasFloorPlan && !floorPlanExpanded && (
                        <button type="button" onClick={() => setFloorPlanExpanded(true)} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-green-400 transition-colors py-1">
                            <span>등록된 플로어맵</span>
                            <ChevronDown className="w-3 h-3" />
                        </button>
                    )}
                    {hasFloorPlan && floorPlanExpanded && (
                        <div className="space-y-2">
                            <button type="button" onClick={() => setFloorPlanExpanded(false)} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-green-400 transition-colors py-1">
                                <MapPin className="w-3.5 h-3.5 text-green-500" />
                                <span>플로어맵 닫기</span>
                                <ChevronDown className="w-3 h-3 rotate-180" />
                            </button>
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
            <section className={`space-y-3 ${!isTermsEditable ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 text-white font-bold mb-1">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>테이블 구성</span>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-5 px-5">
                    {EXTRAS_OPTIONS.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => toggleInclude(item)}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all flex-shrink-0 ${selectedIncludes.includes(item)
                                ? "bg-green-500 text-black"
                                : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                                }`}
                        >
                            {selectedIncludes.includes(item) && <Check className="w-3 h-3" />}
                            {item}
                        </button>
                    ))}
                    {/* 직접 추가된 커스텀 항목 */}
                    {selectedIncludes
                        .filter((item: string) => !EXTRAS_OPTIONS.includes(item) && !LIQUOR_KEYWORDS.some(kw => item.includes(kw)))
                        .map((item: string) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => toggleInclude(item)}
                                className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all flex-shrink-0 bg-green-500 text-black"
                            >
                                <X className="w-3 h-3" />
                                {item}
                            </button>
                        ))}
                    {/* 인라인 직접 입력 */}
                    <div className="flex items-center gap-1 flex-shrink-0 pr-10">
                        <input
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
                            placeholder="+ 직접 입력"
                            className="w-24 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1.5 text-[11px] text-white placeholder-neutral-600 focus:outline-none focus:border-green-500/50"
                        />
                    </div>
                </div>

                {/* 주류 변경 안내 */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                    <p className="text-[11px] text-amber-500 font-bold">주류 변경 안내</p>
                    <p className="text-[10px] text-amber-500/80">• 현장에서 동급 브랜드 변경 가능</p>
                    <p className="text-[10px] text-amber-500/80">• {isInstantMode ? "예약가" : "낙찰가"} 이하 환불 불가</p>
                </div>
                {errors.includes && <p className="text-red-500 text-[11px]">{errors.includes?.message?.toString()}</p>}
            </section>


            {/* Smart Pricing 추천 — 숨김 처리 */}

            {/* 4. 가격 설정 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Wine className="w-4 h-4 text-amber-500" />
                    <span>{isInstantMode ? "판매가" : "경매 시작가"}</span>
                </div>
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
                    <div className="space-y-3">
                        {hasBids && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-2">
                                <p className="text-[12px] text-amber-400 font-bold">🔒 {isInstantMode ? "예약이 있어 조건 변경 불가" : "입찰이 있어 경매 조건 변경 불가"}</p>
                                <p className="text-[10px] text-amber-400/80 mt-1">{isInstantMode ? "이미 예약이 있어" : `이미 ${initialData.bid_count}회 입찰이 있어`} 가격, 주류, 테이블, 지속시간을 변경할 수 없습니다.</p>
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
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 100000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+10만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 50000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+5만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 10000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); }} className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+1만</Button>
                        </div>

                        {/* 가격 경고 */}
                        {(() => {
                            const ABSOLUTE_MIN = 50000; // 절대 최소가 5만원
                            const hasSmartPricing = priceRec?.sufficient_data && priceRec?.suggested_start_price;
                            const recommendedPrice = priceRec?.suggested_start_price || 0;
                            const isTooLow = hasSmartPricing
                                ? currentStartPrice > 0 && currentStartPrice < recommendedPrice * 0.7
                                : currentStartPrice > 0 && currentStartPrice < ABSOLUTE_MIN;

                            if (isInstantMode || !isTooLow) return null;

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

                    {/* 즉시낙찰가 (BIN) — 얼리버드 경매 전용 */}
                    {!isInstantMode && (
                        <div className="space-y-3 border-t border-neutral-800/50 pt-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-neutral-400 text-[10px] font-bold uppercase">즉시낙찰가 (선택)</Label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={binEnabled}
                                        disabled={!isTermsEditable}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setBinEnabled(checked);
                                            if (!checked) {
                                                setValue("buy_now_price", undefined);
                                                setBinPriceDisplay("");
                                            } else {
                                                // 자동 추천: 시작가의 2배
                                                const suggested = currentStartPrice * 2;
                                                if (suggested > 0) {
                                                    setValue("buy_now_price", suggested);
                                                    setBinPriceDisplay(suggested.toLocaleString());
                                                }
                                            }
                                        }}
                                        className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 accent-green-500"
                                    />
                                    <span className="text-[10px] text-white font-bold">사용</span>
                                </label>
                            </div>
                            {binEnabled && (
                                <>
                                    <Input
                                        type="text"
                                        value={binPriceDisplay}
                                        disabled={!isTermsEditable}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/[^0-9]/g, "");
                                            const numValue = value === "" ? 0 : parseInt(value, 10);
                                            setValue("buy_now_price", numValue);
                                            setBinPriceDisplay(value === "" ? "" : numValue.toLocaleString());
                                        }}
                                        placeholder={`추천: ${(currentStartPrice * 2).toLocaleString()}원 (시작가의 2배)`}
                                        className={`bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-green-500 ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    />
                                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                                        이 가격에 입찰하면 경매가 즉시 종료되고, 해당 유저에게 낙찰됩니다.
                                        {currentStartPrice > 0 && watch("buy_now_price") && watch("buy_now_price")! < currentStartPrice * 1.5 && (
                                            <span className="text-amber-400 font-bold block mt-1">
                                                ⚠️ 시작가의 1.5배 이상을 권장합니다 (최소 {(currentStartPrice * 1.5).toLocaleString()}원)
                                            </span>
                                        )}
                                    </p>
                                    {errors.buy_now_price && <p className="text-red-500 text-[11px] mt-1">{errors.buy_now_price?.message?.toString()}</p>}
                                </>
                            )}
                        </div>
                    )}

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
                            <div className="flex flex-col gap-0.5">
                                <Label className="text-neutral-400 text-[10px] font-bold uppercase">입장 일시</Label>
                                {auctionMode !== "today" && (
                                    <span className="text-[9px] text-neutral-600">
                                        오늘부터 {EARLYBIRD_MAX_EVENT_DAYS_AHEAD}일 이내 이벤트만 등록할 수 있어요
                                    </span>
                                )}
                            </div>
                            {auctionMode === "today" && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={instantEntry}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setInstantEntry(checked);
                                        setValue("entry_time", checked ? null : "22:00");
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 accent-green-500"
                                />
                                <span className="text-[10px] text-white font-bold">즉시 입장</span>
                            </label>
                            )}
                        </div>
                        {instantEntry ? (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl h-11 flex items-center px-4">
                                <span className="text-green-500 text-sm font-bold">{isInstantMode ? "예약 후 즉시 입장 가능" : "낙찰 후 즉시 입장 가능"}</span>
                            </div>
                        ) : auctionMode === "today" ? (
                            <DateTimeSheet
                                label="입장 일시 선택"
                                mode="date-2"
                                dateOptions={[
                                    { label: `${dayjs(getClubEventDate()).format("M/D (ddd)")} 저녁`, value: getClubEventDate(), minTime: "18:00", maxTime: "23:59", defaultTime: "22:00" },
                                    { label: `${dayjs(getClubEventDate()).add(1, "day").format("M/D (ddd)")} 새벽`, value: dayjs(getClubEventDate()).add(1, "day").format("YYYY-MM-DD"), minTime: "00:00", maxTime: "05:59", defaultTime: "01:00" },
                                ]}
                                value={`${watch("event_date")}T${watch("entry_time") || "22:00"}`}
                                onChange={(val) => {
                                    const picked = dayjs(val);
                                    setValue("event_date", picked.format("YYYY-MM-DD"));
                                    setValue("entry_time", picked.format("HH:mm"));
                                    clearErrors("entry_time");
                                }}
                            />
                        ) : (
                            <>
                                <DateTimeSheet
                                    label="입장 일시 선택"
                                    value={(() => {
                                        const t = watch("entry_time") || "22:00";
                                        const d = watch("event_date");
                                        return dayjs(`${d}T${t}`).format("YYYY-MM-DDTHH:mm");
                                    })()}
                                    min={dayjs().add(2, "day").set("hour", 0).set("minute", 0).format("YYYY-MM-DDTHH:mm")}
                                    max={dayjs().add(EARLYBIRD_MAX_EVENT_DAYS_AHEAD, "day").set("hour", 23).set("minute", 59).format("YYYY-MM-DDTHH:mm")}
                                    onChange={(val) => {
                                        const picked = dayjs(val);
                                        const pickedTime = picked.format("HH:mm");
                                        const eventDate = picked.hour() < 4
                                            ? picked.subtract(1, "day").format("YYYY-MM-DD")
                                            : picked.format("YYYY-MM-DD");
                                        setValue("event_date", eventDate);
                                        setValue("entry_time", pickedTime);
                                        clearErrors("entry_time");
                                    }}
                                />
                            </>
                        )}
                        {errors.event_date && <p className="text-red-500 text-[11px]">{errors.event_date?.message?.toString()}</p>}
                        {errors.entry_time && <p className="text-red-500 text-[11px]">{errors.entry_time?.message?.toString()}</p>}
                    </div>
                    <div className={`space-y-3 ${!isTermsEditable ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className="flex flex-col gap-0.5">
                            <Label className="text-neutral-400 text-[10px] font-bold uppercase">{isInstantMode ? "판매 지속 시간" : "경매 마감"}</Label>
                            {auctionMode === "advance" && (
                                <span className="text-[9px] text-neutral-600">마감은 항상 21:00. 이벤트일 최소 2일 전.</span>
                            )}
                        </div>
                        {(() => {
                            if (auctionMode === "today") {
                                return (
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: "4시간", value: 240 },
                                            { label: "2시간", value: 120 },
                                            { label: "1시간", value: 60 },
                                        ].map((opt) => (
                                            <button key={opt.value} type="button" onClick={() => setValue("duration_minutes", opt.value)} className={`h-10 rounded-lg text-xs font-bold transition-all ${watch("duration_minutes") === opt.value ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-500 border border-neutral-800"}`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            } else {
                                // 얼리버드: 마감 날짜 선택 (이벤트 -2일 ~ -4일, 21:00 KST 고정)
                                const eventDate = watch("event_date");
                                const options = getEarlybirdEndDateOptions(eventDate);
                                const currentEnd = watch("auction_end_at");

                                if (options.length === 0) {
                                    return (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                            <p className="text-red-400 text-xs font-bold">
                                                선택 가능한 마감 시각이 없습니다. 이벤트 날짜를 더 뒤로 설정해주세요.
                                            </p>
                                        </div>
                                    );
                                }

                                // -2일이 가장 가까운 마감 (daysBefore가 가장 작은 값)
                                const defaultOption = options.reduce((a, b) => (a.daysBefore < b.daysBefore ? a : b));
                                const otherOptions = options.filter(o => o.endAtISO !== defaultOption.endAtISO);
                                const isDefaultSelected = currentEnd === defaultOption.endAtISO;

                                return (
                                    <div className="space-y-2">
                                        {/* [DEV] 5분 테스트 옵션 */}
                                        {process.env.NODE_ENV === "development" && (
                                            <button
                                                type="button"
                                                onClick={() => setValue("auction_end_at", dayjs().add(5, "minute").toISOString())}
                                                className={`w-full h-10 rounded-xl text-xs font-black transition-all px-4 text-left border border-dashed ${watch("auction_end_at") && dayjs(watch("auction_end_at")).diff(dayjs(), "minute") <= 6 ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300" : "bg-neutral-900 border-yellow-500/30 text-yellow-500/70"}`}
                                            >
                                                ⚡ [DEV] 5분 후 마감 (테스트용)
                                            </button>
                                        )}

                                        {/* 기본 카드 (큰 사이즈) */}
                                        <button
                                            type="button"
                                            onClick={() => setValue("auction_end_at", defaultOption.endAtISO)}
                                            className={`w-full h-14 rounded-xl text-sm font-black transition-all px-4 text-left flex flex-col justify-center ${isDefaultSelected ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-300 border border-neutral-800"}`}
                                        >
                                            <span>{defaultOption.label}</span>
                                            <span className={`text-[10px] font-medium mt-0.5 ${isDefaultSelected ? "text-neutral-600" : "text-neutral-500"}`}>
                                                가장 긴 노출
                                            </span>
                                        </button>

                                        {/* "다른 시각" 토글 */}
                                        {otherOptions.length > 0 && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllEndOptions(v => !v)}
                                                    className="w-full text-[11px] text-neutral-500 font-bold py-1.5 hover:text-neutral-300 transition-colors"
                                                >
                                                    {showAllEndOptions ? "접기 ▲" : "더 빠른 마감 ▼"}
                                                </button>

                                                {showAllEndOptions && (
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {otherOptions.map((opt) => (
                                                            <button
                                                                key={opt.endAtISO}
                                                                type="button"
                                                                onClick={() => setValue("auction_end_at", opt.endAtISO)}
                                                                className={`h-11 rounded-lg text-xs font-bold transition-all px-4 text-left ${currentEnd === opt.endAtISO ? "bg-neutral-200 text-black" : "bg-neutral-900 text-neutral-400 border border-neutral-800"}`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            }
                        })()}
                        {errors.duration_minutes && <p className="text-red-500 text-[11px] mt-2">{errors.duration_minutes?.message?.toString()}</p>}
                        {errors.auction_end_at && <p className="text-red-500 text-[11px] mt-2">{errors.auction_end_at?.message?.toString()}</p>}
                    </div>
                </div>
            </section>

            <div className="mt-12 px-1">
                <div className="max-w-lg mx-auto">
                    <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl bg-white text-black font-black text-lg hover:bg-neutral-200 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        {isSubmitting ? (initialData ? "수정 중..." : "등록 중...") : (initialData ? (isInstantMode ? "판매 정보 수정하기" : "경매 정보 수정하기") : (isInstantMode ? "오늘특가 등록하기" : "경매 시작하기"))}
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
                onContinue={() => {
                    setCreatedAuctionId(null);
                    setShowShareSheet(false);
                    setValue("table_info", "");
                    setValue("event_date", getClubEventDate());
                    setAuctionMode(instantEnabled ? "today" : "advance");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    toast.success("설정이 유지됩니다. 테이블 위치만 입력하세요!");
                }}
                listingType={watch("listing_type")}
                areaName={selectedClub?.area}
            />
        )}

        </div>
    );
}

