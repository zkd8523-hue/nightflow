"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Club, Auction, PriceRecommendation } from "@/types/database";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { Calendar, Wine, Check, ArrowRight, ImageIcon, ChevronDown, MapPin, X, RefreshCw, Building2, Users, Bookmark, Minus, Plus, Coins, MessageCircle } from "lucide-react";
import dayjs from "dayjs";
import {
  getOfferDeadline as getPuzzleOfferDeadline,
  getExpiresAt as getPuzzleExpiresAt,
} from "@/lib/utils/puzzleDeadline";
import "dayjs/locale/ko";
dayjs.locale("ko");
import { getClubEventDate } from "@/lib/utils/date";
import {
    getBidIncrement,
    isEarlybirdEndValid,
    isEventDateWithinWindow,
    isShareEventDateWithinWindow,
    getEarlybirdEndDateOptions,
    EARLYBIRD_MAX_EVENT_DAYS_AHEAD,
    SHARE_MAX_EVENT_DAYS_AHEAD,
} from "@/lib/utils/auction";
import { getWeekStartForDate } from "@/lib/utils/hotdeal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { uploadImage } from "@/lib/utils/upload";
import { ShareSuccessSheet } from "./ShareSuccessSheet";
import { TemplateSelector } from "./TemplateSelector";

import { trackEvent } from "@/lib/analytics/events";
import { trackShareEvent } from "@/lib/analytics/events";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { isInstantEnabled } from "@/lib/features";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";

const formSchema = z.object({
    listing_type: z.enum(["auction", "instant", "share"]).default("share"),
    club_id: z.string().min(1, "클럽을 선택해주세요."),
    table_info: z.string().min(1, "테이블 정보를 입력해주세요."),
    start_price: z.number().min(0).default(0),
    entry_time: z.string().nullable(),
    event_date: z.string(),
    auction_start_at: z.string(),
    instant_start: z.boolean().optional(),
    duration_minutes: z.number().min(1, "지속 시간을 선택해주세요.").default(240),
    // 얼리버드에서는 auction_end_at을 직접 지정. instant에서는 duration_minutes 사용.
    auction_end_at: z.string().optional(),
    includes: z.array(z.string()).default([]),
    md_comment: z.string().max(200, "최대 200자").optional(),
    md_message: z.string().max(60, "최대 60자").optional(),
    // 조각(share) 전용 필드
    total_seats: z.number().min(2).max(20).optional(),
    price_per_seat: z.number().min(1).optional(),
    main_alcohol: z.string().optional(),
    share_deadline: z.string().optional(),
}).superRefine((data, ctx) => {
    // 조각 전용 검증
    if (data.listing_type === "share") {
        if (!data.total_seats) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "정원을 입력해주세요. (2~20명)", path: ["total_seats"] });
        }
        if (!data.price_per_seat) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "인당 가격을 입력해주세요.", path: ["price_per_seat"] });
        } else if (data.price_per_seat % 10000 !== 0) {
            // 1인 가격은 반드시 만원 단위 (드리프트 방지 + 가독성)
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "인당 가격은 만원 단위여야 합니다. '↑ 만원' 버튼으로 정리해주세요.",
                path: ["price_per_seat"],
            });
        }
        if (!data.event_date) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "방문일시를 선택해주세요.", path: ["event_date"] });
        }
        // 방문일 window 검증은 schema에서 안 함 — 수정 모드(initialData)는 통과시키고
        // 신규 등록 시에만 onSubmit에서 분기 검증.
        return;
    }
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
                message: "마감은 이벤트 전날 21:00 이전이어야 합니다.",
                path: ["auction_end_at"],
            });
        }
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
    /** Migration 216: 각 MD의 club_partners.thumbnail_url 맵 (per-MD per-club). 기본 이미지로 사용. */
    partnerThumbnailMap?: Record<string, string | null>;
}

import { LiquorSelector } from "./LiquorSelector";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";
import { getDrinkCategoryImage } from "@/lib/constants/drink-images";



export function AuctionForm({ clubs, mdId, initialData, repostFrom, defaultClubId, partnerThumbnailMap }: AuctionFormProps) {
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
    const [startPriceCommitted, setStartPriceCommitted] = useState(!!(initialData?.start_price || prefill?.start_price));
    const [instantEntry, setInstantEntry] = useState(
        initialData ? !initialData.entry_time
        : prefill ? !prefill.entry_time
        : false
    );

    // 검증 실패 시 스크롤 타겟 ref
    const priceSectionRef = useRef<HTMLDivElement>(null);
    const [customExtra, setCustomExtra] = useState("");
    const [showCustomExtraSheet, setShowCustomExtraSheet] = useState(false);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(initialData?.thumbnail_url || null);
    const [isClubImage, setIsClubImage] = useState(false);
    const [localFloorPlanUrls, setLocalFloorPlanUrls] = useState<Record<string, string>>({});
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
    // MD 직통 조각 신규 등록: "완료" 클릭 시 실제 생성 전에 템플릿 저장 여부부터 확인
    const [pendingShareSubmitValues, setPendingShareSubmitValues] = useState<FormValues | null>(null);
    const [templateNameDraft, setTemplateNameDraft] = useState("");
    const initialTotalPrice = (initialData?.price_per_seat && initialData?.total_seats)
        ? initialData.price_per_seat * initialData.total_seats : 0;
    const [totalPrice, setTotalPrice] = useState(initialTotalPrice);
    const [totalPriceInputStr, setTotalPriceInputStr] = useState(initialTotalPrice ? initialTotalPrice.toLocaleString() : "");
    const initialSeats = Math.min(initialData?.total_seats ?? 4, 6);
    // 수정 모드일 때 DB의 target_male/target_female 값으로 성별 슬롯 상태 복원
    const initialUseGenderSlot = !!(
        initialData &&
        ((initialData.target_male ?? 0) > 0 || (initialData.target_female ?? 0) > 0)
    );
    const [targetCount, setTargetCount] = useState(initialSeats);
    const [useGenderSlot, setUseGenderSlot] = useState(initialUseGenderSlot);
    const [mdMessageEverEdited, setMdMessageEverEdited] = useState(!!(initialData?.md_message));
    const [kakaoUrl, setKakaoUrl] = useState(initialData?.kakao_open_chat_url ?? "");
    const [hasExternal, setHasExternal] = useState(!!(initialData?.external_attendees && initialData.external_attendees > 0));
    const [externalCount, setExternalCount] = useState(initialData?.external_attendees || 1);
    const [externalMale, setExternalMale] = useState(initialData?.external_male ?? 1);
    const [externalFemale, setExternalFemale] = useState(initialData?.external_female ?? 0);
    const [targetMale, setTargetMale] = useState(
        initialUseGenderSlot
            ? (initialData?.target_male ?? Math.ceil(initialSeats / 2))
            : Math.ceil(initialSeats / 2)
    );
    const [targetFemale, setTargetFemale] = useState(
        initialUseGenderSlot
            ? (initialData?.target_female ?? Math.floor(initialSeats / 2))
            : Math.floor(initialSeats / 2)
    );
    const [showTemplateSavePrompt, setShowTemplateSavePrompt] = useState(false);
    const [templateSaving, setTemplateSaving] = useState(false);
    // Migration 505: 저장과 동시에 상시 조각으로 켤지 — 기본은 이 등록의 요일을 그대로 반영
    const [turnLiveOnSave, setTurnLiveOnSave] = useState(false);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);

    // 얼리버드 기본 event_date: 오늘 + 2일 (→ 마감 옵션 최소 1개 보장, -1일 버퍼 기준)
    const defaultEarlybirdEventDate = dayjs().add(2, "day").format("YYYY-MM-DD");
    const initialEventDate = initialData?.event_date
        || (prefill?.event_date)
        || (initialData?.listing_type === "auction" ? defaultEarlybirdEventDate : getClubEventDate());

    const { register, handleSubmit, setValue, watch, clearErrors, formState: { errors, isSubmitting, isDirty } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            listing_type: initialData?.listing_type || "share",
            club_id: initialData?.club_id || prefill?.club_id || defaultClubId || clubs[0]?.id || "",
            table_info: initialData?.table_info || prefill?.table_info || "",
            duration_minutes: initialData?.duration_minutes || prefill?.duration_minutes || 240,
            includes: initialData?.includes || prefill?.includes || [],
            event_date: initialEventDate,
            start_price: initialData?.start_price || prefill?.start_price || 0,
            entry_time: initialData
                ? (initialData.entry_time ?? null)
                : (prefill?.entry_time ?? "22:00"),
            auction_start_at: initialData?.auction_start_at ? dayjs(initialData.auction_start_at).format("YYYY-MM-DDTHH:mm") : dayjs().format("YYYY-MM-DDTHH:mm"),
            auction_end_at: initialData?.auction_end_at || undefined,
            instant_start: true,
            md_comment: initialData?.md_comment || prefill?.md_comment || "",
            md_message: initialData?.md_message || prefill?.md_message || "",
        }
    });

    const [submitted, setSubmitted] = useState(false);
    const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(
        isDirty && !isSubmitting && !submitted
    );

    const selectedIncludes = watch("includes");
    const selectedTableInfo = watch("table_info");
    const selectedClubId = watch("club_id");
    const selectedClub = clubs.find(c => c.id === selectedClubId);
    const floorPlanUrl = localFloorPlanUrls[selectedClubId] || selectedClub?.floor_plan_url;
    const hasFloorPlan = !!floorPlanUrl;
    const currentStartPrice = watch("start_price") || 0;
    const currentListingType = watch("listing_type");
    const isShareMode = currentListingType === "share";

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
            if (!url) {
                // uploadImage 내부에서 이미 toast 노출 — 중복 방지를 위해 여기선 스킵
                return;
            }

            const res = await fetch("/api/md/clubs/update-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clubId: selectedClub.id, field: "floor_plan_url", value: url }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error("[FloorPlan] API error:", res.status, body);
                toast.error(`플로어맵 저장 실패 (${res.status})`);
                return;
            }

            setLocalFloorPlanUrls(prev => ({ ...prev, [selectedClub.id]: url }));
            setFloorPlanExpanded(false);
            toast.success("플로어맵이 등록되었습니다!");
        } catch (err) {
            console.error("[FloorPlan] Unexpected error:", err);
            toast.error("플로어맵 업로드 중 오류가 발생했습니다.");
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

    // 마운트 후 club_id가 비어있거나 유효하지 않으면 첫 번째(가장 먼저 등록한) 클럽 자동 선택
    // - native <select> + register 조합에서 defaultValues가 늦게 적용되는 케이스
    // - users.default_club_id가 삭제된/이관된 클럽을 가리키는 stale 케이스
    useEffect(() => {
        if (clubs.length === 0) return;
        const matches = selectedClubId && clubs.some(c => c.id === selectedClubId);
        if (!matches) {
            setValue("club_id", clubs[0].id, { shouldDirty: false });
        }
    }, [selectedClubId, clubs, setValue]);

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

    // 인원 변경 시 total_seats 동기화 (성비 모드 여부에 따라 분기)
    useEffect(() => {
        if (!isShareMode) return;
        setValue("total_seats", useGenderSlot ? targetMale + targetFemale : targetCount);
    }, [targetCount, targetMale, targetFemale, useGenderSlot]); // eslint-disable-line react-hooks/exhaustive-deps

    // MD 한마디 자동 채움 (수동 입력 전까지만)
    useEffect(() => {
        if (!isShareMode || mdMessageEverEdited) return;
        const eventDate = watch("event_date");
        const clubName = selectedClub?.name || "";
        const seats = useGenderSlot ? targetMale + targetFemale : targetCount;
        const perPerson = totalPrice > 0 && seats > 0 ? Math.floor(totalPrice / seats) : 0;
        const parts = [
            clubName,
            perPerson > 0 ? `N${Math.round(perPerson / 10000)}만` : "",
        ].filter(Boolean);
        if (eventDate) {
            const d = new Date(eventDate + "T00:00:00");
            const days = ["일", "월", "화", "수", "목", "금", "토"];
            const datePart = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
            setValue("md_message", `${datePart} ${parts.join(" ")}`);
        } else if (parts.length > 0) {
            setValue("md_message", parts.join(" "));
        }
    }, [watch("event_date"), selectedClub?.name, targetCount, targetMale, targetFemale, useGenderSlot, totalPrice, mdMessageEverEdited, isShareMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // 목표 매출 or 정원 변경 시 price_per_seat 자동 계산
    const watchedTotalSeats = watch("total_seats");
    useEffect(() => {
        if (!isShareMode) return;
        const seats = watchedTotalSeats || 2;
        if (totalPrice > 0 && seats > 0) {
            setValue("price_per_seat", Math.floor(totalPrice / seats));
        } else {
            setValue("price_per_seat", undefined as unknown as number);
        }
    }, [totalPrice, watchedTotalSeats]); // eslint-disable-line react-hooks/exhaustive-deps

    // Watch auction mode to auto-reset fields when switching between modes
    // 신규 등록: 마운트 시 listing_type을 share로 강제 (defaultValues 초기화 타이밍 안전망)
    useEffect(() => {
        if (!initialData) {
            setValue("listing_type", "share");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // 신규 등록 + share 모드면 listing_type 덮어쓰기 금지 (env var 무관)
        // 옛 auction/instant 매물 수정 모드에서만 토글이 의미 있음
        const isOldListingEdit = initialData?.listing_type === "auction" || initialData?.listing_type === "instant";
        if (!isOldListingEdit) return;

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
        // 조각 신규 등록 시 방문일 윈도우 검증 — 수정 모드는 통과
        if (isShareMode && !initialData && values.event_date && !isShareEventDateWithinWindow(values.event_date)) {
            toast.error(`방문일은 오늘부터 ${SHARE_MAX_EVENT_DAYS_AHEAD}일 이내로 선택해주세요.`);
            return;
        }
        // 조각 신규 등록: 실제 생성 전에 "템플릿으로 저장할까요?" 먼저 확인
        if (values.listing_type === "share" && !initialData) {
            setPendingShareSubmitValues(values);
            setTemplateNameDraft(`${Math.round((values.price_per_seat || 0) / 10000)}만원/${values.main_alcohol || "주류"}/파티${values.total_seats}`);
            setShowTemplateSavePrompt(true);
            return; // 프롬프트에서 예/아니오 선택 후 performSubmit 진행
        }
        // 가격 확인 (신규 등록 OR 수정 시 입찰 없으면, share 모드 제외)
        if (!isShareMode && (!initialData || (initialData && initialData.bid_count === 0))) {
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

            // ============================================================
            // 조각(share) 모드 제출 처리
            // ============================================================
            if (values.listing_type === "share") {
                const clubName = clubs.find(c => c.id === values.club_id)?.name || "";

                // MD 직통 조각은 무료·인앱 단체채팅 → 옛 카톡/슬롯 선점/1일1매물 게이트 전부 제거.
                // 등록 제한(같은 클럽·같은 날 1개)은 DB 트리거(Migration 366)가 처리.

                // ── MD 직통 조각 = puzzles (유저 조각과 같은 피드·인앱 채팅). 무료. ──
                const club = clubs.find(c => c.id === values.club_id);
                // puzzles.area는 NOT NULL — 클럽 지역이 없으면 등록 불가 → 클럽 편집으로 안내
                if (!club?.area) {
                    toast.error("이 클럽은 지역 정보가 없어요. 클럽 정보에서 지역을 먼저 등록해주세요.");
                    if (values.club_id) router.push(`/md/clubs/${values.club_id}/edit`);
                    return;
                }
                const seats = values.total_seats || targetCount;
                const perSeat = values.price_per_seat || 0;
                const eventDate = values.event_date || dayjs().format("YYYY-MM-DD");
                const externalTotal = hasExternal ? externalCount : 0; // 성별무관
                // MD 직통은 항상 조각(is_recruiting_party=true) → 자정 마감
                const offerDeadline = getPuzzleOfferDeadline(eventDate, true);
                const expiresAt = getPuzzleExpiresAt(eventDate, true);
                const noteText = (values.md_message || values.md_comment || "").trim() || null;
                // MD 한마디(md_comment)는 제목(notes)과 별개로 상세의 "MD 한마디" 박스에 노출
                const mdCommentText = (values.md_comment || "").trim() || null;

                if (initialData) {
                    const { error: upErr } = await supabase
                        .from("puzzles")
                        .update({
                            club_id: values.club_id,
                            area: club?.area ?? null,
                            event_date: eventDate,
                            target_count: seats,
                            budget_per_person: perSeat,
                            total_budget: perSeat * seats,
                            includes: values.includes || [],
                            table_info: values.table_info || null,
                            notes: noteText,
                            md_comment: mdCommentText,
                            offer_deadline: offerDeadline,
                            expires_at: expiresAt,
                        })
                        .eq("id", initialData.id)
                        .eq("leader_id", mdId);
                    if (upErr) throw new Error(upErr.message || "수정에 실패했습니다.");
                    setSubmitted(true);
                    toast.success("파티가 수정되었어요");
                    setTimeout(() => router.replace(`/flags/${initialData.id}`), 200);
                    return;
                }

                const { data: created, error: insErr } = await supabase
                    .from("puzzles")
                    .insert({
                        leader_id: mdId,
                        host_is_md: true,
                        club_id: values.club_id,
                        area: club?.area ?? null,
                        event_date: eventDate,
                        is_recruiting_party: true,
                        gender_pref: "any",
                        age_pref: ["any"],
                        vibe_pref: "any",
                        music_preference: null,
                        kakao_open_chat_url: null,
                        target_male: 0,
                        target_female: 0,
                        target_count: seats,
                        // 파트너 직통은 MD가 자리를 파는 쪽이라 본인은 좌석을 차지하지 않는다.
                        // (유저 조각은 방장이 실제 참석자라 1부터 — Migration 508)
                        current_count: externalTotal,
                        budget_per_person: perSeat,
                        total_budget: perSeat * seats,
                        includes: values.includes || [],
                        table_info: values.table_info || null,
                        notes: noteText,
                        md_comment: mdCommentText,
                        offer_deadline: offerDeadline,
                        expires_at: expiresAt,
                    })
                    .select("id")
                    .single();
                if (insErr || !created) throw new Error(insErr?.message || "등록에 실패했습니다.");

                // 방장(MD)을 puzzle_members에 추가 (fire-and-forget)
                supabase
                    .from("puzzle_members")
                    .insert({ puzzle_id: created.id, user_id: mdId, guest_count: externalTotal, gender: null })
                    .then(({ error: mErr }) => { if (mErr) console.error("puzzle_members insert error:", mErr); });

                setSubmitted(true);
                trackShareEvent("share_listing_created", {
                    auction_id: created.id,
                    club_id: values.club_id,
                    area: club?.area ?? null,
                    price_per_seat: perSeat,
                    total_seats: seats,
                    main_alcohol: values.main_alcohol ?? null,
                    is_update: false,
                });
                router.push(`/flags/${created.id}?created=share`);
                return;
            }

            // ============================================================
            // 기존 경매/즉시구매 제출 처리 (하위호환)
            // ============================================================

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
                md_comment: values.md_comment || null,
                md_message: values.md_message || null,
            };

            auctionData.buy_now_price = isInstantMode ? values.start_price : null;

            // 썸네일 처리: 있으면 저장, 수정 모드에서 제거했으면 명시적 null
            // 클럽 대표 이미지(clubs.thumbnail_url)는 admin 전용이므로 여기서 건드리지 않음
            if (thumbnailUrl) {
                auctionData.thumbnail_url = thumbnailUrl;
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

            setSubmitted(true);
            // 라우터 캐시 무효화 — 새 매물/수정 결과가 홈/대시보드에 즉시 반영되도록
            router.refresh();
            if (initialData) {
                // 수정: 기존 동작 유지
                toast.success(isInstantMode ? "판매 정보가 수정되었습니다!" : "경매 정보가 수정되었습니다!");
                setTimeout(() => {
                    router.replace("/md/dashboard");
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
        <form
          onSubmit={handleSubmit(onSubmit, (formErrors) => {
            // 가격 검증 실패 시 가격 섹션으로 스크롤 + 토스트
            if (formErrors.price_per_seat) {
              priceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              toast.error(formErrors.price_per_seat.message?.toString() || "인당 가격을 확인해주세요");
              return;
            }
            // 그 외 첫 에러도 토스트로
            const firstError = Object.values(formErrors)[0];
            if (firstError?.message) {
              toast.error(firstError.message.toString());
            }
          })}
          className="space-y-8 pb-12"
        >
            {/* Top Toggle: Today vs Advance — instant off 시 신규 등록에서는 숨김 */}
            {showModeToggle && (
                <div className="flex bg-card rounded-xl p-1 border border-border">
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
                            : "text-muted-foreground hover:text-white"
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
                            ? "bg-inverse text-inverse-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        📅 얼리버드 경매
                    </button>
                </div>
            )}



            {/* 파티 모드: 템플릿에서 생성 버튼 */}
            {isShareMode && !initialData && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border text-muted-foreground hover:text-foreground hover:border-amber-500 gap-1.5 text-xs"
                  onClick={() => setShowTemplateSelector(true)}
                >
                  <Bookmark className="w-3.5 h-3.5 text-brand-amber" />
                  템플릿에서 생성
                </Button>
              </div>
            )}

            {/* 1. 클럽 선택 + 대표 이미지 */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Building2 className="w-4 h-4 text-money" />
                    <span>클럽 선택</span>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <input type="file" accept="image/*" id="thumbnail-upload" className="hidden" onChange={handleThumbnailSelect} />
                    <div className={`relative h-12 ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
                            <span className={`text-sm font-medium truncate ${selectedClub ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {selectedClub ? `${selectedClub.name} (${selectedClub.area})` : "클럽을 선택하세요"}
                            </span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                        </div>
                        <select
                            {...register("club_id")}
                            disabled={!isTermsEditable}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                            <option value="">클럽을 선택하세요</option>
                            {clubs.map(club => (
                                <option key={club.id} value={club.id}>{club.name} ({club.area})</option>
                            ))}
                        </select>
                    </div>
                    {selectedClub && (
                        <div className="flex items-center gap-3 border-t border-border px-3 py-2.5">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-border bg-card shrink-0">
                                {(() => {
                                    if (thumbnailPreview) {
                                        return <img src={thumbnailPreview} alt="대표 이미지" className="w-full h-full object-cover" />;
                                    }
                                    // Migration 216: clubs.thumbnail_url(admin 전용) 대신 MD 본인의 partner thumbnail 사용
                                    const partnerImg = selectedClub
                                        ? partnerThumbnailMap?.[selectedClub.id] ?? null
                                        : null;
                                    const drinkImg = getDrinkCategoryImage(selectedIncludes);
                                    const fallbackUrl = partnerImg || drinkImg;
                                    if (fallbackUrl) {
                                        return <img src={fallbackUrl} alt="기본 이미지" className="w-full h-full object-cover" />;
                                    }
                                    return (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    );
                                })()}
                            </div>
                            <p className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
                                {thumbnailPreview
                                    ? "대표이미지 · 커스텀 적용 중"
                                    : partnerThumbnailMap?.[selectedClub.id]
                                        ? "대표이미지 · 내 기본"
                                        : getDrinkCategoryImage(selectedIncludes)
                                            ? "대표이미지 · 주류 기본"
                                            : "대표이미지 · 미설정"
                                }
                            </p>
                            {thumbnailPreview && thumbnailFile ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); setIsClubImage(false); }}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : thumbnailPreview ? (
                                <button
                                    type="button"
                                    onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); setIsClubImage(false); }}
                                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <label
                                    htmlFor="thumbnail-upload"
                                    className="text-[11px] text-muted-foreground font-medium px-2.5 py-1 rounded-md bg-muted hover:bg-muted cursor-pointer transition-colors shrink-0"
                                >
                                    {partnerThumbnailMap?.[selectedClub.id] || getDrinkCategoryImage(selectedIncludes) ? "변경" : "등록"}
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
                    <MapPin className="w-4 h-4 text-money" />
                    <span className="text-foreground font-bold">테이블 위치</span>
                </div>

                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                    {hasFloorPlan && !floorPlanExpanded && (
                        <button type="button" onClick={() => setFloorPlanExpanded(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-money transition-colors py-1">
                            <span>등록된 플로어맵</span>
                            <ChevronDown className="w-3 h-3" />
                        </button>
                    )}
                    {hasFloorPlan && floorPlanExpanded && (
                        <div className="space-y-2">
                            <button type="button" onClick={() => setFloorPlanExpanded(false)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-money transition-colors py-1">
                                <MapPin className="w-3.5 h-3.5 text-money" />
                                <span>플로어맵 닫기</span>
                                <ChevronDown className="w-3 h-3 rotate-180" />
                            </button>
                            <div className="rounded-xl overflow-hidden border border-border">
                                <img
                                    src={floorPlanUrl!}
                                    alt="플로어맵"
                                    className="w-full h-auto block select-none pointer-events-none"
                                    draggable={false}
                                />
                            </div>
                            <label className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-money cursor-pointer transition-colors">
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
                        <label className="flex flex-col items-center gap-3 p-5 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-all">
                            <MapPin className="w-8 h-8 text-money dark:text-money/60" />
                            <div className="text-center">
                                <p className="text-sm font-bold text-foreground/80">
                                    플로어맵을 등록해보세요
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    자리 위치를 시각적으로 전달하면<br/>입찰 전환율이 높아집니다
                                </p>
                            </div>
                            <span className="text-xs font-bold text-money bg-green-500/10 px-3 py-1.5 rounded-full">
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
                        placeholder="예) A3, B~C열, 준메인, 빠통"
                        className={`bg-card border-border h-11 rounded-lg text-foreground ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    {errors.table_info && <p className="text-red-500 text-xs">{errors.table_info?.message?.toString()}</p>}
                </div>
            </section>


            {/* 3. 입장 일시 — share 모드 숨김 (모집 마감으로 대체) */}
            {!isShareMode && <section className="space-y-4">
                <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Calendar className="w-4 h-4 text-money" />
                    <span>입장 일시</span>
                </div>
                <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
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
                                    className="w-3.5 h-3.5 rounded border-border bg-card text-money focus:ring-green-500 accent-green-500"
                                />
                                <span className="text-[10px] text-foreground font-bold">즉시 입장</span>
                            </label>
                            )}
                        </div>
                        {instantEntry ? (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl h-11 flex items-center px-4">
                                <span className="text-money text-sm font-bold">{isInstantMode ? "예약 후 즉시 입장 가능" : "낙찰 후 즉시 입장 가능"}</span>
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
            </section>}

            {/* 4. 주류 선택 (LiquorSelector) — share 모드 숨김 */}
            {!isShareMode && <LiquorSelector
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
            />}

            {/* Smart Pricing 추천 — 숨김 처리 */}

            {/* ── 파티(share) 전용 섹션 (PuzzleForm 파티원 모집과 통일) ── */}
            {isShareMode && (
              <>
                {/* 1. 방문일시 */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Calendar className="w-4 h-4 text-money" />
                    <span>방문일시</span>
                  </div>
                  <DateTimeSheet
                    mode="date-only"
                    label="날짜 선택"
                    value={watch("event_date") || ""}
                    min={dayjs().format("YYYY-MM-DD")}
                    max={dayjs().add(SHARE_MAX_EVENT_DAYS_AHEAD, "day").format("YYYY-MM-DD")}
                    onChange={(val) => setValue("event_date", val)}
                    placeholder={`최대 ${SHARE_MAX_EVENT_DAYS_AHEAD}일 뒤까지 선택 가능`}
                  />
                  {errors.event_date && <p className="text-red-500 text-[11px]">{errors.event_date.message?.toString()}</p>}
                </section>

                {/* 2. 매출설정 */}
                <section ref={priceSectionRef} className="space-y-4 scroll-mt-24">
                  <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Coins className="w-4 h-4 text-brand-amber" />
                    <span>파티 설정</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-5">

                    {/* 목표 매출 */}
                    <div className="space-y-3">
                      <p className="text-[12px] text-muted-foreground font-medium">목표 매출</p>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="예) 1,000,000"
                        value={totalPriceInputStr}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          if (raw === "") { setTotalPrice(0); setTotalPriceInputStr(""); return; }
                          const num = Number(raw);
                          if (!isNaN(num)) { setTotalPrice(num); setTotalPriceInputStr(num.toLocaleString()); }
                        }}
                        onBlur={() => {
                          if (totalPrice > 0) setTotalPriceInputStr(totalPrice.toLocaleString());
                        }}
                        disabled={hasBids}
                        className="bg-card border-border h-11 text-foreground font-bold focus:ring-amber-500"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {[500000, 100000, 50000].map((preset) => (
                          <Button
                            key={preset}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={hasBids}
                            onClick={() => {
                              const next = totalPrice + preset;
                              setTotalPrice(next);
                              setTotalPriceInputStr(next.toLocaleString());
                            }}
                            className="h-10 px-0 bg-card border-border text-foreground/80 hover:bg-muted hover:text-foreground hover:border-amber-500/50 font-bold text-[13px]"
                          >
                            +{preset / 10000}만
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={hasBids}
                          onClick={() => { setTotalPrice(0); setTotalPriceInputStr(""); }}
                          className="h-10 px-0 bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-red-500/50 font-bold text-[13px]"
                        >
                          초기화
                        </Button>
                      </div>
                      {/* price_per_seat 에러는 하단 amber 박스에서 단일 표시 (중복 제거) */}
                      {errors.price_per_seat && errors.price_per_seat.message?.toString().indexOf("만원 단위") === -1 && (
                        <p className="text-red-500 text-[11px]">{errors.price_per_seat.message?.toString()}</p>
                      )}
                    </div>

                    <div className="border-t border-border" />

                    {/* 인원 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] text-muted-foreground font-medium">인원</p>
                        <p className="text-[11px] text-muted-foreground">최소 2명, 최대 6명</p>
                      </div>
                      {/* 목표 인원 수 picker */}
                      <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-4">
                        <button
                          type="button"
                          disabled={hasBids || targetCount <= 2}
                          onClick={() => {
                            const next = Math.max(2, targetCount - 1);
                            setTargetCount(next);
                            setTargetMale(Math.ceil(next / 2));
                            setTargetFemale(Math.floor(next / 2));
                          }}
                          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-3.5 h-3.5 text-foreground" />
                        </button>
                        <span className="text-[15px] font-black text-foreground">{targetCount}명</span>
                        <button
                          type="button"
                          disabled={hasBids || targetCount >= 6}
                          onClick={() => {
                            const next = Math.min(6, targetCount + 1);
                            setTargetCount(next);
                            setTargetMale(Math.ceil(next / 2));
                            setTargetFemale(Math.floor(next / 2));
                          }}
                          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5 text-foreground" />
                        </button>
                      </div>
                      {/* 확정 인원 */}
                      <div className="pt-1 border-t border-border space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-bold text-foreground">이미 확정된 인원이 있나요?</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !hasExternal;
                              setHasExternal(next);
                              if (!next) { setExternalCount(1); setExternalMale(1); setExternalFemale(0); }
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors ${hasExternal ? "bg-white" : "bg-muted"}`}
                          >
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-background transition-all ${hasExternal ? "left-6" : "left-1"}`} />
                          </button>
                        </div>
                        {hasExternal && !useGenderSlot && (
                          <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-4">
                            <button
                              type="button"
                              disabled={externalCount <= 1}
                              onClick={() => setExternalCount(Math.max(1, externalCount - 1))}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Minus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                            <span className="text-[15px] font-black text-foreground">확정 {externalCount}명</span>
                            <button
                              type="button"
                              disabled={externalCount >= targetCount - 1}
                              onClick={() => setExternalCount(Math.min(targetCount - 1, externalCount + 1))}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                          </div>
                        )}
                        {hasExternal && useGenderSlot && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-3">
                              <button
                                type="button"
                                disabled={externalMale <= 0}
                                onClick={() => setExternalMale(externalMale - 1)}
                                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Minus className="w-3.5 h-3.5 text-foreground" />
                              </button>
                              <span className="text-[14px] font-black text-money">🧑 {externalMale}</span>
                              <button
                                type="button"
                                disabled={externalMale + externalFemale >= targetCount - 1}
                                onClick={() => setExternalMale(externalMale + 1)}
                                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Plus className="w-3.5 h-3.5 text-foreground" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-3">
                              <button
                                type="button"
                                disabled={externalFemale <= 0}
                                onClick={() => setExternalFemale(externalFemale - 1)}
                                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Minus className="w-3.5 h-3.5 text-foreground" />
                              </button>
                              <span className="text-[14px] font-black text-pink-400">👩 {externalFemale}</span>
                              <button
                                type="button"
                                disabled={externalMale + externalFemale >= targetCount - 1}
                                onClick={() => setExternalFemale(externalFemale + 1)}
                                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Plus className="w-3.5 h-3.5 text-foreground" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 성비 설정 토글 제거 — 파티는 성별무관(초록 슬롯) 통일 (target_male/female=0) */}
                      {/* 성비 슬롯 picker — 항상 합계 = targetCount */}
                      {useGenderSlot && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-3">
                            <button
                              type="button"
                              disabled={hasBids || targetMale <= 0}
                              onClick={() => { const m = targetMale - 1; setTargetMale(m); setTargetFemale(targetCount - m); }}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Minus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                            <span className="text-[14px] font-black text-money">🧑 {targetMale}</span>
                            <button
                              type="button"
                              disabled={hasBids || targetMale >= targetCount}
                              onClick={() => { const m = targetMale + 1; setTargetMale(m); setTargetFemale(targetCount - m); }}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-3">
                            <button
                              type="button"
                              disabled={hasBids || targetFemale <= 0}
                              onClick={() => { const f = targetFemale - 1; setTargetFemale(f); setTargetMale(targetCount - f); }}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Minus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                            <span className="text-[14px] font-black text-pink-400">👩 {targetFemale}</span>
                            <button
                              type="button"
                              disabled={hasBids || targetFemale >= targetCount}
                              onClick={() => { const f = targetFemale + 1; setTargetFemale(f); setTargetMale(targetCount - f); }}
                              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3.5 h-3.5 text-foreground" />
                            </button>
                          </div>
                        </div>
                      )}
                      {(() => {
                        const confirmed = hasExternal
                          ? (useGenderSlot ? externalMale + externalFemale : externalCount)
                          : 0;
                        const seeking = targetCount - confirmed;
                        const perPerson = totalPrice > 0
                          ? Math.floor(totalPrice / (useGenderSlot ? (targetMale + targetFemale || 1) : (targetCount || 1)))
                          : null;
                        return (
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] text-money font-bold">
                              {seeking > 0
                                ? useGenderSlot
                                  ? (() => {
                                      const sm = targetMale - (hasExternal ? externalMale : 0);
                                      const sf = targetFemale - (hasExternal ? externalFemale : 0);
                                      const parts = [...(sm > 0 ? [`남자${sm}`] : []), ...(sf > 0 ? [`여자${sf}`] : [])];
                                      return `🎉 ${parts.join("/")}명의 파티를 구해요`;
                                    })()
                                  : `🎉 총 ${seeking}명의 파티를 구해요`
                                : "🎉 정원이 꽉 찼어요"}
                            </p>
                            {perPerson !== null ? (
                              <div className="flex items-center gap-2">
                                <p className={`text-[15px] font-black ${perPerson % 10000 === 0 ? "text-money" : "text-brand-amber"}`}>
                                  {perPerson.toLocaleString()}원
                                  <span className="text-[11px] text-muted-foreground font-normal ml-1">/인</span>
                                </p>
                                {/* 만원 단위 올림 버튼 — 만원 단위 아니면 필수 (등록 차단) */}
                                {perPerson % 10000 !== 0 && (
                                  <button
                                    type="button"
                                    disabled={hasBids}
                                    onClick={() => {
                                      const seats = useGenderSlot ? (targetMale + targetFemale || 1) : (targetCount || 1);
                                      const rounded = Math.ceil(perPerson / 10000) * 10000;
                                      const newTotal = rounded * seats;
                                      setTotalPrice(newTotal);
                                      setTotalPriceInputStr(newTotal.toLocaleString());
                                    }}
                                    className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed animate-pulse"
                                  >
                                    ↑ 만원 단위
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">N비 미설정</p>
                            )}
                          </div>
                        );
                      })()}
                      {/* 만원 단위 안 맞을 때 안내 메시지 */}
                      {(() => {
                        const pp = totalPrice > 0
                          ? Math.floor(totalPrice / (useGenderSlot ? (targetMale + targetFemale || 1) : (targetCount || 1)))
                          : null;
                        if (pp !== null && pp % 10000 !== 0) {
                          const seats = useGenderSlot ? (targetMale + targetFemale || 1) : (targetCount || 1);
                          const rounded = Math.ceil(pp / 10000) * 10000;
                          const newTotal = rounded * seats;
                          return (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-2">
                              <p className="text-[12px] text-brand-amber font-bold">
                                ⚠️ 인당 가격을 만원 단위로 맞춰주세요
                              </p>
                              <p className="text-[11px] text-brand-amber dark:text-brand-amber/80 mt-0.5 leading-snug">
                                현재 {pp.toLocaleString()}원/인 → <span className="font-bold">{rounded.toLocaleString()}원/인</span>으로 올리면
                                {" "}목표 매출이 <span className="font-bold">{newTotal.toLocaleString()}원</span>이 됩니다.
                                <br />위 <span className="font-bold">"↑ 만원 단위"</span> 버튼을 눌러 정리해주세요.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {useGenderSlot && (
                        <p className="text-[11px] text-muted-foreground">성비는 목표값이에요. 초과 인원도 파트너 재량으로 승인할 수 있어요.<br />(ex: 세팅값 남자3·여자1. 현재 남자3·여자0 일때, 남자가 신청시 승인 가능. 최종 남자4·여자0)</p>
                      )}
                      {errors.total_seats && <p className="text-red-500 text-[11px]">{errors.total_seats.message?.toString()}</p>}
                    </div>

                  </div>
                </section>

                {/* 4. 주류 & 테이블 구성 — 파티(share) 모드: 주류 선택 */}
                <LiquorSelector
                  optional
                  selected={selectedIncludes.filter((item: string) =>
                    LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
                  )}
                  onSelect={(liquors) => {
                    const extras = selectedIncludes.filter(
                      (item: string) => !LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
                    );
                    setValue("includes", [...liquors, ...extras]);
                  }}
                />
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-bold mb-1">
                    <Check className="w-4 h-4 text-money" />
                    <span>테이블 구성</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EXTRAS_OPTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleInclude(item)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all flex-shrink-0 ${
                          selectedIncludes.includes(item)
                            ? "bg-green-500 text-black"
                            : "bg-card text-muted-foreground border border-border"
                        }`}
                      >
                        {selectedIncludes.includes(item) && <Check className="w-3 h-3" />}
                        {item}
                      </button>
                    ))}
                    {selectedIncludes
                      .filter((item: string) => !EXTRAS_OPTIONS.includes(item as typeof EXTRAS_OPTIONS[number]) && !LIQUOR_KEYWORDS.some(kw => item.includes(kw)))
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
                    <button
                      type="button"
                      onClick={() => setShowCustomExtraSheet(true)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap bg-card text-muted-foreground border border-border hover:border-border hover:text-foreground transition-all flex-shrink-0"
                    >
                      + 직접 입력
                    </button>
                  </div>
                </section>

                {/* 파티 정보 섹션 제거 — md_message는 여전히 자동 생성되어 notes(카드 제목)로 저장됨 */}

                {/* 6. MD 한마디 (직접 입력) */}
                <section className="space-y-4">
                  <div className="flex items-baseline gap-2 text-foreground font-bold mb-2">
                    <MessageCircle className="w-4 h-4 text-purple-500 self-center" />
                    <span>파트너의 한마디</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {" "}
                      <span className={(watch("md_comment") || "").length >= 200 ? "text-brand-amber" : ""}>
                        ({(watch("md_comment") || "").length}/200)
                      </span>
                    </span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4">
                    <Input
                      type="text"
                      value={watch("md_comment") || ""}
                      onChange={(e) => setValue("md_comment", e.target.value)}
                      placeholder="예) 텐션 좋은 분들 환영!"
                      maxLength={200}
                      className="bg-card border-border h-12 text-[14px] font-bold text-foreground focus:ring-amber-500 placeholder:text-muted-foreground placeholder:font-normal"
                    />
                  </div>
                </section>

                {/* 카톡 오픈채팅 섹션 제거 — MD 직통 파티는 인앱 단체채팅 사용 */}
              </>
            )}

            {/* 4. 가격 설정 (경매/즉시구매 전용) */}
            {!isShareMode && <section className="space-y-4">
                <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Wine className="w-4 h-4 text-brand-amber" />
                    <span>{isInstantMode ? "판매가" : "경매 시작가"}</span>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                    <div className="space-y-3">
                        {hasBids && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-2">
                                <p className="text-[12px] text-brand-amber font-bold">🔒 {isInstantMode ? "예약이 있어 조건 변경 불가" : "입찰이 있어 경매 조건 변경 불가"}</p>
                                <p className="text-[10px] text-brand-amber dark:text-brand-amber/80 mt-1">{isInstantMode ? "이미 예약이 있어" : `이미 ${initialData.bid_count}회 입찰이 있어`} 가격, 주류, 테이블, 지속시간을 변경할 수 없습니다.</p>
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
                                setStartPriceCommitted(false);
                            }}
                            onBlur={() => setStartPriceCommitted(true)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setStartPriceCommitted(true); } }}
                            placeholder="예: 650,000"
                            className={`bg-card border-border h-11 text-foreground font-bold focus:ring-green-500 ${!isTermsEditable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 500000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); setStartPriceCommitted(true); }} className="flex-1 h-9 bg-card border-border text-foreground/80 hover:bg-muted hover:text-foreground hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+50만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 100000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); setStartPriceCommitted(true); }} className="flex-1 h-9 bg-card border-border text-foreground/80 hover:bg-muted hover:text-foreground hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+10만</Button>
                            <Button type="button" variant="outline" size="sm" disabled={!isTermsEditable} onClick={() => { const v = currentStartPrice + 50000; setValue("start_price", v); setStartPriceDisplay(v.toLocaleString()); setStartPriceCommitted(true); }} className="flex-1 h-9 bg-card border-border text-foreground/80 hover:bg-muted hover:text-foreground hover:border-green-500/50 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed">+5만</Button>
                        </div>

                        {/* 가격 경고 */}
                        {(() => {
                            const ABSOLUTE_MIN = 50000; // 절대 최소가 5만원
                            const hasSmartPricing = priceRec?.sufficient_data && priceRec?.suggested_start_price;
                            const recommendedPrice = priceRec?.suggested_start_price || 0;
                            const isTooLow = hasSmartPricing
                                ? currentStartPrice > 0 && currentStartPrice < recommendedPrice * 0.7
                                : currentStartPrice > 0 && currentStartPrice < ABSOLUTE_MIN;

                            if (isInstantMode || !isTooLow || !startPriceCommitted) return null;

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

                        {/* 정식가 대비 넛지 — 항상 노출 */}
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            💡 인스타 공식 주대의 <span className="text-brand-amber font-bold">80~90% 수준</span>으로 시작하면 입찰이 빠르게 붙어요.<br />
                            최소 수익을 미리 확정해보세요!
                        </p>

                    </div>

                </div>
            </section>}

            {/* 7. 경매 마감 */}
            {!isShareMode && <section className="space-y-4">
                <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                    <Calendar className="w-4 h-4 text-money" />
                    <span>경매 마감</span>
                </div>
                <div className="bg-card border border-border rounded-2xl p-3">
                    <div className={`space-y-2 ${!isTermsEditable ? 'opacity-50 pointer-events-none' : ''}`}>
                        {auctionMode === "advance" && (
                            <span className="text-[11px] text-muted-foreground">마감은 이벤트 전날까지 가능.</span>
                        )}
                        {(() => {
                            if (auctionMode === "today") {
                                return (
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: "4시간", value: 240 },
                                            { label: "2시간", value: 120 },
                                            { label: "1시간", value: 60 },
                                        ].map((opt) => (
                                            <button key={opt.value} type="button" onClick={() => setValue("duration_minutes", opt.value)} className={`h-10 rounded-lg text-xs font-bold transition-all ${watch("duration_minutes") === opt.value ? "bg-neutral-200 text-black" : "bg-card text-muted-foreground border border-border"}`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                );
                            } else {
                                // 얼리버드: 마감 날짜 선택 (이벤트 -1일 ~ -3일, 21:00 KST 고정)
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

                                // -1일이 가장 가까운 마감 (daysBefore가 가장 작은 값)
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
                                                className={`w-full h-10 rounded-xl text-xs font-black transition-all px-4 text-left border border-dashed ${watch("auction_end_at") && dayjs(watch("auction_end_at")).diff(dayjs(), "minute") <= 6 ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300" : "bg-card border-yellow-500/30 text-yellow-500/70"}`}
                                            >
                                                ⚡ [DEV] 5분 후 마감 (테스트용)
                                            </button>
                                        )}

                                        {/* 기본 카드 (큰 사이즈) */}
                                        <button
                                            type="button"
                                            onClick={() => setValue("auction_end_at", defaultOption.endAtISO)}
                                            className={`w-full h-14 rounded-xl text-sm font-black transition-all px-4 text-left flex flex-col justify-center ${isDefaultSelected ? "bg-neutral-200 text-black" : "bg-card text-foreground/80 border border-border"}`}
                                        >
                                            <span>{defaultOption.label}</span>
                                            <span className={`text-[10px] font-medium mt-0.5 ${isDefaultSelected ? "text-muted-foreground" : "text-muted-foreground"}`}>
                                                가장 긴 노출
                                            </span>
                                        </button>

                                        {/* "다른 시각" 토글 */}
                                        {otherOptions.length > 0 && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllEndOptions(v => !v)}
                                                    className="w-full text-[11px] text-muted-foreground font-bold py-1.5 hover:text-foreground/80 transition-colors"
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
                                                                className={`h-11 rounded-lg text-xs font-bold transition-all px-4 text-left ${currentEnd === opt.endAtISO ? "bg-neutral-200 text-black" : "bg-card text-muted-foreground border border-border"}`}
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
            </section>}


            <div className="mt-12 px-1">
                <div className="max-w-lg mx-auto">
                    <Button disabled={isSubmitting || submitted} className="w-full h-14 rounded-2xl bg-inverse text-inverse-foreground font-black text-lg hover:opacity-90 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60">
                        {isSubmitting ? (initialData ? "수정 중..." : "등록 중...") : submitted ? "등록 완료" : (initialData ? (isInstantMode ? "판매 정보 수정하기" : "파티 정보 수정하기") : (isInstantMode ? "오늘특가 등록하기" : "파티 등록하기"))}
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

            {/* 직접 입력 시트 */}
            <Sheet open={showCustomExtraSheet} onOpenChange={(open) => { if (!open) { setShowCustomExtraSheet(false); setCustomExtra(""); } }}>
                <SheetContent
                    side="bottom"
                    className="bg-card border-t border-border rounded-t-3xl px-5 pb-10 pt-2"
                >
                    <SheetHeader className="p-0 mb-4">
                        <SheetTitle className="text-foreground text-[17px] font-black text-left">
                            서비스 직접 입력
                        </SheetTitle>
                        <p className="text-[12px] text-muted-foreground text-left">
                            테이블 구성에 추가할 서비스를 입력해주세요
                        </p>
                    </SheetHeader>
                    <div className="space-y-3">
                        <Input
                            autoFocus
                            value={customExtra}
                            onChange={(e) => setCustomExtra(e.target.value)}
                            onKeyDown={(e) => {
                                // 한글 IME 조합 중 Enter는 무시 (조합 완료 후 다시 발화됨)
                                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    const trimmed = customExtra.trim();
                                    if (trimmed && !selectedIncludes.includes(trimmed)) {
                                        setValue("includes", [...selectedIncludes, trimmed]);
                                    }
                                    setCustomExtra("");
                                    setShowCustomExtraSheet(false);
                                }
                            }}
                            placeholder="예: 샴페인 타워, 무대앞 자리, 부스 투어..."
                            maxLength={20}
                            className="bg-card border-border text-foreground text-[14px] h-12"
                        />
                        <Button
                            type="button"
                            onClick={() => {
                                const trimmed = customExtra.trim();
                                if (trimmed && !selectedIncludes.includes(trimmed)) {
                                    setValue("includes", [...selectedIncludes, trimmed]);
                                }
                                setCustomExtra("");
                                setShowCustomExtraSheet(false);
                            }}
                            disabled={!customExtra.trim()}
                            className="w-full h-12 bg-inverse hover:opacity-90 text-inverse-foreground font-black text-[14px] rounded-2xl disabled:bg-muted disabled:text-muted-foreground"
                        >
                            추가
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

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
                startPrice={watch("listing_type") === "share" ? (watch("price_per_seat") ?? 0) : watch("start_price")}
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

        {/* 파티 신규 등록 전 템플릿 저장 확인 — "완료" 클릭 시 실제 생성 전에 먼저 뜸 */}
        {pendingShareSubmitValues && (
            <Sheet
                open={showTemplateSavePrompt}
                onOpenChange={(open) => {
                    // 바깥 클릭/스와이프로 닫아도 등록은 진행 (건너뛰기와 동일)
                    if (!open && pendingShareSubmitValues) {
                        const v = pendingShareSubmitValues;
                        setShowTemplateSavePrompt(false);
                        setPendingShareSubmitValues(null);
                        performSubmit(v);
                    }
                }}
            >
                <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-10">
                    <SheetHeader className="text-left pb-2">
                        <SheetTitle className="text-foreground text-lg">템플릿으로 저장할까요?</SheetTitle>
                    </SheetHeader>
                    <p className="text-muted-foreground text-sm mb-4">
                        다음 등록 시 한 번에 불러올 수 있습니다.
                    </p>
                    <div className="mb-4 space-y-1.5">
                        <p className="text-[11px] text-muted-foreground font-bold">템플릿 이름</p>
                        <Input
                            type="text"
                            value={templateNameDraft}
                            onChange={(e) => setTemplateNameDraft(e.target.value)}
                            maxLength={40}
                            className="bg-card border-border h-11 text-brand-amber font-bold text-sm focus:ring-amber-500"
                        />
                    </div>
                    <label className="flex items-center gap-2 mb-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={turnLiveOnSave}
                            onChange={(e) => setTurnLiveOnSave(e.target.checked)}
                            className="w-4 h-4 rounded accent-amber-500"
                        />
                        <span className="text-[13px] font-bold text-foreground">
                            저장하고 바로 켜기 <span className="text-muted-foreground font-medium">— 오늘 요일로 4주간 자동 발행</span>
                        </span>
                    </label>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="flex-1 border-border text-muted-foreground hover:text-foreground"
                            disabled={templateSaving}
                            onClick={() => {
                                const v = pendingShareSubmitValues;
                                setShowTemplateSavePrompt(false);
                                setPendingShareSubmitValues(null);
                                performSubmit(v);
                            }}
                        >
                            아니오
                        </Button>
                        <Button
                            className="flex-1 bg-inverse text-inverse-foreground hover:opacity-90 font-bold"
                            disabled={templateSaving}
                            onClick={async () => {
                                const v = pendingShareSubmitValues;
                                setTemplateSaving(true);
                                try {
                                    const templateName = templateNameDraft.trim() || `${Math.round((v.price_per_seat || 0) / 10000)}만원/${v.main_alcohol || "주류"}/파티${v.total_seats}`;
                                    // 저장과 동시에 켤 때: 이번 등록의 요일을 기본 선택값으로, 종료일은 4주 후.
                                    const liveFields = turnLiveOnSave
                                        ? (() => {
                                            const dowKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                                            const eventDow = dowKeys[new Date(`${v.event_date}T00:00:00+09:00`).getDay()];
                                            const untilDate = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
                                            return { is_live: true, live_dows: [eventDow], live_until: untilDate };
                                        })()
                                        : {};
                                    await supabase.from("auction_templates").insert({
                                        md_id: mdId,
                                        name: templateName,
                                        club_id: v.club_id,
                                        table_type: v.table_info,
                                        total_seats: v.total_seats,
                                        price_per_seat: v.price_per_seat,
                                        main_alcohol: v.main_alcohol,
                                        includes: v.includes || [],
                                        md_comment: v.md_comment || null,
                                        ...liveFields,
                                    });
                                    toast.success(turnLiveOnSave ? "템플릿을 저장하고 켰어요!" : "템플릿이 저장되었습니다!");
                                } catch {
                                    toast.error("템플릿 저장에 실패했습니다.");
                                } finally {
                                    setTemplateSaving(false);
                                    setShowTemplateSavePrompt(false);
                                    setPendingShareSubmitValues(null);
                                    setTurnLiveOnSave(false);
                                    performSubmit(v);
                                }
                            }}
                        >
                            {templateSaving ? "저장 중..." : "예, 저장"}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        )}

        {/* 템플릿 선택 시트 */}
        <TemplateSelector
          mdId={mdId}
          open={showTemplateSelector}
          onOpenChange={setShowTemplateSelector}
          onSelect={(template) => {
            if (template.club_id) setValue("club_id", template.club_id);
            if (template.table_type) setValue("table_info", template.table_type);
            // 목표 매출·인원은 로컬 state(totalPrice/targetCount)가 화면을 그리고
            // RHF 필드(total_seats/price_per_seat)는 그 state에서 파생되는 단방향 구조라,
            // setValue만으론 화면(목표 매출·인원 스테퍼)이 안 바뀜 → 로컬 state도 함께 갱신.
            if (template.total_seats) {
              setTargetCount(template.total_seats);
              setValue("total_seats", template.total_seats);
            }
            if (template.price_per_seat) {
              const seats = template.total_seats || targetCount;
              const total = template.price_per_seat * seats;
              setTotalPrice(total);
              setTotalPriceInputStr(total.toLocaleString());
              setValue("price_per_seat", template.price_per_seat);
            }
            if (template.main_alcohol) setValue("main_alcohol", template.main_alcohol);
            if (template.includes?.length) setValue("includes", template.includes);
            if (template.md_comment) setValue("md_comment", template.md_comment);
            toast.success("템플릿이 적용되었습니다. 날짜/마감 시각을 입력하세요.");
          }}
        />

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
        </div>
    );
}

