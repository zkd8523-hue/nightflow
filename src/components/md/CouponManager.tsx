"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Ticket, Plus, X, ChevronDown, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { createClient } from "@/lib/supabase/client";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { allowsDiscount, allowsMinSpend } from "@/lib/utils/coupon";
import { CouponBenefitPicker } from "@/components/md/CouponBenefitPicker";
import { CouponIssueCard } from "@/components/md/CouponIssueCard";
import { CouponOnboardingSheet } from "@/components/md/CouponOnboardingSheet";
import type { CouponIssue, CouponBenefitType, CouponDiscountType, CouponMinSpendUnit } from "@/types/database";

dayjs.locale("ko");

interface ClubLite {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
}

interface Props {
  clubs: ClubLite[];
  initialCoupons: CouponIssue[];
  /** @deprecated 태그(md_benefit_presets) 제거로 더 이상 쓰지 않음. 호출부 호환용 */
  mdId?: string;
  defaultClubId?: string | null;
  /** 대시보드 인라인 등 다른 컨테이너 안에서 띄울 때 자체 헤더/패딩 생략 */
  embedded?: boolean;
}

// 자주 쓰는 사용 조건 — 손으로 치면 "평일만"/"월~목"/"주중"처럼 제각각이 된다
const CONDITION_PRESETS = ["평일만(월~목)", "주말만(금~일)", "여성 한정", "23시 이전 입장"];

const MAX_STOCK = 30;       // 재고 상한 (create_coupon_issue와 동일)
const MAX_DISCOUNT_MAN = 1000; // 정액 할인 상한 1000만원 (DB CHECK와 동일)

/**
 * "데낄라 2, 샴페인 1" 같은 표준 포맷을 항목 리스트로 되돌린다 ("다시 발행" 프리필용).
 * "병"이 붙은 옛 포맷("데낄라 2병")과 그 이전 자유텍스트("샴1")도 최대한 복원한다.
 */
function parseBottleDetail(detail: string | null): { name: string; qty: number }[] {
  const trimmed = detail?.trim();
  if (!trimmed) return [{ name: "", qty: 1 }];
  const items = trimmed.split(",").map((part) => {
    const m = part.trim().match(/^(.+?)\s*(\d+)\s*병?$/);
    return m ? { name: m[1].trim(), qty: Math.min(20, Math.max(1, Number(m[2]))) } : { name: part.trim(), qty: 1 };
  }).filter((item) => item.name);
  return items.length > 0 ? items : [{ name: "", qty: 1 }];
}

export function CouponManager({ clubs, initialCoupons, defaultClubId, embedded = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [coupons, setCoupons] = useState<CouponIssue[]>(initialCoupons);
  const [showForm, setShowForm] = useState(() => searchParams.get("new") === "1");
  // 쿠폰 승인 비밀번호 (Migration 541). 미설정이면 발행이 차단된다.
  const [hasPasscode, setHasPasscode] = useState<boolean | null>(null);
  const [passSheetOpen, setPassSheetOpen] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // 지난 쿠폰 일괄 삭제 — 카드마다 휴지통을 두면 목록이 시끄럽다 (파티와 동일 패턴)
  const [deleteMode, setDeleteMode] = useState(false);
  const [deletePicked, setDeletePicked] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  // 폼 필드
  // default_club_id가 삭제·탈퇴로 목록에 없는 클럽을 가리키면 select에 매칭되는 option이 없어
  // 플레이스홀더만 뜨고 선택이 안 되는 것처럼 보인다. 목록에 실제로 있을 때만 기본값으로 쓴다.
  const [clubId, setClubId] = useState<string>(
    (defaultClubId && clubs.some((c) => c.id === defaultClubId) ? defaultClubId : clubs[0]?.id) ?? ""
  );
  // 서비스 바틀을 기본 선택으로 — 피크타임 MD가 가장 자주 쓰는 혜택
  const [benefitType, setBenefitType] = useState<CouponBenefitType | "">("service_bottle");
  const [discountType, setDiscountType] = useState<CouponDiscountType | "">("");
  const [discountValue, setDiscountValue] = useState("");  // percent=%, flat=만원
  // 최소 구매 조건. unit=krw면 만원 단위, unit=bottle이면 병 개수 그대로
  const [minSpendValue, setMinSpendValue] = useState("");
  const [minSpendUnit, setMinSpendUnit] = useState<CouponMinSpendUnit>("bottle");
  // "" = 미선택, "unlimited" = 무제한, 숫자 문자열 = 해당 수량
  const [totalCount, setTotalCount] = useState("");
  const [benefitDetail, setBenefitDetail] = useState("");
  // 서비스 바틀 상세 — 자유텍스트로 두면 MD마다 "2병"/"2 제공"/"2"처럼 표기가 갈려
  // 이름+수량을 구조화 입력으로 받고, 제출 시 "데낄라 2병, 샴페인 1병"으로 합쳐 benefitDetail에 담는다.
  const [bottleItems, setBottleItems] = useState<{ name: string; qty: number }[]>([{ name: "", qty: 1 }]);
  // 데킬라샷 — 최소구매 조건 없이 잔 수만 정한다 (서비스 바틀과 달리 이름 입력 없음)
  const [shotQty, setShotQty] = useState(1);
  const [conditions, setConditions] = useState("");
  const [showMore, setShowMore] = useState(false);

  // 사용 마감 — 기본값: 오늘 밤 마감(영업일 기준 익일 새벽 5시)
  const defaultEndsAt = useMemo(() => {
    const now = dayjs();
    const base = now.hour() < 6 ? now : now.add(1, "day");
    return base.hour(5).minute(0).second(0).format("YYYY-MM-DDTHH:mm");
  }, []);
  const [redeemEndsAtLocal, setRedeemEndsAtLocal] = useState(defaultEndsAt);

  const selectedClub = clubs.find((c) => c.id === clubId);

  // 프리셋에 없는 값이면 직접입력 칸에 표시 (선택 상태도 함께 나타낸다)
  const custom = ["", "unlimited", "10", "20", "30"].includes(totalCount) ? "" : totalCount;
  const visibleCoupons = useMemo(
    () => coupons.filter((c) => c.status === "active" || c.status === "sold_out"),
    [coupons]
  );
  // 취소·만료된 발행분 — "다시 발행" 기반으로 재사용 (카페24 쿠폰 관리 패턴).
  // 완전히 숨기면 복사할 대상이 사라져 매번 처음부터 입력해야 하므로 계속 노출한다.
  // 즐겨찾기가 맨 위 — 발행이 쌓이면 자주 쓰는 세팅이 아래로 밀려 매번 찾아야 한다
  const pastCoupons = useMemo(
    () =>
      coupons
        .filter((c) => c.status === "cancelled" || c.status === "expired")
        .sort((a, b) => Number(b.is_favorite ?? false) - Number(a.is_favorite ?? false)),
    [coupons]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("has_coupon_passcode");
      if (cancelled) return;
      const r = data as { success: boolean; has_passcode?: boolean };
      setHasPasscode(Boolean(r?.has_passcode));
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const handleSavePasscode = async () => {
    if (!/^[0-9]{4}$/.test(passInput)) {
      toast.error("숫자 4자리로 입력해주세요");
      return;
    }
    setPassBusy(true);
    try {
      const { data, error } = await supabase.rpc("set_coupon_passcode", { p_passcode: passInput });
      if (error) {
        toast.error(`설정 실패: ${error.message || error.code || "RPC 오류"}`);
        return;
      }
      const r = data as { success: boolean; error?: string };
      if (!r?.success) { toast.error(r?.error || "설정에 실패했어요"); return; }
      setHasPasscode(true);
      setPassSheetOpen(false);
      setPassInput("");
      toast.success("승인 비밀번호가 설정됐어요");
    } finally {
      setPassBusy(false);
    }
  };

  const resetForm = () => {
    setBenefitType("service_bottle");
    setDiscountType("");
    setDiscountValue("");
    setMinSpendValue("");
    setMinSpendUnit("bottle");
    setTotalCount("");
    setBenefitDetail("");
    setBottleItems([{ name: "", qty: 1 }]);
    setShotQty(1);
    setConditions("");
    setShowMore(false);
    setRedeemEndsAtLocal(defaultEndsAt);
  };

  /** 조건 프리셋 토글 — 문구를 쉼표로 잇고, 다시 누르면 그 조각만 뺀다 */
  const toggleCondition = (preset: string) => {
    const parts = conditions.split(",").map((t) => t.trim()).filter(Boolean);
    const next = parts.includes(preset)
      ? parts.filter((t) => t !== preset)
      : [...parts, preset];
    setConditions(next.join(", "));
  };

  // "데낄라 2, 샴페인 1" — 이름 없는 행은 무시. 표기를 "이름 N"으로 고정해
  // MD마다 "2병"/"2 제공"/"2"처럼 자유텍스트가 갈리는 걸 막는다. 화면 표시는
  // couponDisplayName()이 이 저장값을 "이름 N + 이름 N 쿠폰"으로 다시 조립한다.
  const bottleDetail = bottleItems
    .filter((b) => b.name.trim())
    .map((b) => `${b.name.trim()} ${b.qty}`)
    .join(", ");

  const handleCreate = async () => {
    if (!clubId || !selectedClub) { toast.error("클럽을 선택해주세요"); return; }
    if (!benefitType) { toast.error("혜택 종류를 선택해주세요"); return; }
    if (benefitType === "etc" && !benefitDetail.trim()) {
      toast.error("기타 혜택은 상세 설명이 필요해요");
      return;
    }
    if (benefitType === "service_bottle" && !bottleDetail) {
      toast.error("어떤 바틀을 제공하는지 입력해주세요");
      return;
    }
    if (!totalCount) { toast.error("수량을 선택해주세요"); return; }
    const countNum = totalCount === "unlimited"
      ? null
      : Number(totalCount.replace(/[^0-9]/g, ""));
    if (countNum !== null && (countNum <= 0 || countNum > MAX_STOCK)) {
      toast.error(`수량은 1~${MAX_STOCK}장 사이로 입력해주세요`);
      return;
    }

    // 할인 — percent는 그대로, flat은 만원 단위 입력이므로 *10000 (조각/경매 폼 관례)
    const rawDiscount = discountValue ? Number(discountValue) : null;
    if (discountType && !rawDiscount) {
      toast.error("할인 값을 입력해주세요");
      return;
    }
    if (discountType === "percent" && rawDiscount !== null && (rawDiscount < 1 || rawDiscount > 100)) {
      toast.error("할인율은 1~100% 사이로 입력해주세요");
      return;
    }
    if (discountType === "flat" && rawDiscount !== null && (rawDiscount < 1 || rawDiscount > MAX_DISCOUNT_MAN)) {
      toast.error(`할인 금액은 1~${MAX_DISCOUNT_MAN}만원 사이로 입력해주세요`);
      return;
    }
    const discountAmount = discountType === "percent"
      ? rawDiscount
      : discountType === "flat" && rawDiscount !== null
        ? rawDiscount * 10000
        : null;
    // "기타"는 자유텍스트 상세설명에 조건을 이미 직접 적을 수 있어 최소구매 조건을 선택사항으로 둔다.
    if (allowsMinSpend(benefitType) && benefitType !== "etc" && !minSpendValue) {
      toast.error("최소 구매 조건을 입력해주세요");
      return;
    }
    const minSpendNum = minSpendValue ? Number(minSpendValue) : null;
    if (minSpendUnit === "bottle" && minSpendNum !== null && (minSpendNum < 1 || minSpendNum > 20)) {
      toast.error("최소 구매 병 수는 1~20 사이로 입력해주세요");
      return;
    }
    const minSpend = minSpendNum === null ? null : minSpendUnit === "bottle" ? minSpendNum : minSpendNum * 10000;
    const redeemEndsAtMs = dayjs(redeemEndsAtLocal + "+09:00").valueOf();
    if (redeemEndsAtMs <= Date.now()) {
      toast.error("사용 마감 시각은 현재 시각 이후여야 해요");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_coupon_issue", {
        p_club_id: clubId,
        p_benefit_type: benefitType,
        p_redeem_ends_at: dayjs(redeemEndsAtLocal + "+09:00").toISOString(),
        p_total_count: countNum,
        p_benefit_detail: (
          benefitType === "service_bottle" ? bottleDetail
          : benefitType === "tequila_shot" ? `${shotQty}잔`
          : benefitDetail.trim()
        ) || null,
        p_conditions: conditions.trim() || null,
        p_thumbnail_url: null,
        p_discount_type: discountType || null,
        p_discount_amount: discountAmount,
        p_min_spend: minSpend,
        p_min_spend_unit: minSpendUnit,
      });
      if (error) {
        toast.error(`발행 실패: ${error.message || error.code || "RPC 오류"}`);
        return;
      }
      const result = data as { success: boolean; error?: string; id?: string };
      if (!result?.success) {
        toast.error(result?.error || "발행 실패");
        return;
      }
      if (result.id) {
        const { data: fresh } = await supabase
          .from("coupon_issues")
          .select("*, club:clubs(id, name, area, thumbnail_url)")
          .eq("id", result.id)
          .single();
        if (fresh) setCoupons((prev) => [fresh as unknown as CouponIssue, ...prev]);
      }
      toast.success("쿠폰이 발행됐어요");
      setShowForm(false);
      resetForm();
      if (searchParams.get("new") === "1") {
        router.replace(embedded ? "/md/dashboard?section=coupon" : "/md/coupons");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("이 쿠폰 발행을 취소할까요? 미사용 보유분은 모두 무효화돼요.")) return;
    const { data, error } = await supabase.rpc("cancel_coupon_issue", { p_id: id });
    if (error) {
      toast.error(`취소 실패: ${error.message || error.code || "RPC 오류"}`);
      return;
    }
    const result = data as { success: boolean; error?: string; revoked_count?: number };
    if (!result?.success) { toast.error(result?.error || "취소 실패"); return; }
    setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c)));
    toast.success(`발행이 취소됐어요${result.revoked_count ? ` (보유분 ${result.revoked_count}건 무효화)` : ""}`);
  };

  // 지난 쿠폰의 설정을 그대로 복사해 발행 폼을 채운다. 마감 시각만 새로 잡으면 됨.
  const handleReissue = (coupon: CouponIssue) => {
    if (clubs.some((c) => c.id === coupon.club_id)) setClubId(coupon.club_id);
    setBenefitType(coupon.benefit_type);
    // flat은 DB가 원 단위라 폼(만원)으로 역변환해야 한다
    setDiscountType(coupon.discount_type ?? "");
    setDiscountValue(
      coupon.discount_amount == null
        ? ""
        : coupon.discount_type === "flat"
          ? String(coupon.discount_amount / 10000)
          : String(coupon.discount_amount)
    );
    setMinSpendUnit(coupon.min_spend_unit ?? "krw");
    setMinSpendValue(
      coupon.min_spend == null
        ? ""
        : coupon.min_spend_unit === "bottle"
          ? String(coupon.min_spend)
          : String(coupon.min_spend / 10000)
    );
    setTotalCount(coupon.total_count ? String(coupon.total_count) : "unlimited");
    setBenefitDetail(coupon.benefit_detail ?? "");
    if (coupon.benefit_type === "service_bottle") {
      setBottleItems(parseBottleDetail(coupon.benefit_detail));
    }
    if (coupon.benefit_type === "tequila_shot") {
      const m = coupon.benefit_detail?.match(/(\d+)/);
      setShotQty(m ? Math.min(10, Math.max(1, Number(m[1]))) : 1);
    }
    setConditions(coupon.conditions ?? "");
    setShowMore(!!coupon.conditions);
    setRedeemEndsAtLocal(defaultEndsAt);
    setShowForm(true);
    toast.success("이전 설정을 불러왔어요");
  };

  const handleToggleFavorite = async (id: string) => {
    // 낙관적 반영 — 별을 눌렀는데 반응이 없으면 안 눌린 줄 안다
    setCoupons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_favorite: !c.is_favorite } : c))
    );
    const { data, error } = await supabase.rpc("toggle_coupon_favorite", { p_id: id });
    const result = data as { success: boolean; error?: string; is_favorite?: boolean } | null;
    if (error || !result?.success) {
      setCoupons((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_favorite: !c.is_favorite } : c))
      );
      toast.error(result?.error || "설정에 실패했어요");
    }
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setDeletePicked(new Set());
  };

  const toggleDeletePick = (id: string) => {
    setDeletePicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (deletePicked.size === 0 || deleteBusy) return;
    if (!confirm(`${deletePicked.size}개를 삭제할까요?\n\n삭제하면 재발행 시 처음부터 다시 등록해야 해요.`)) return;
    setDeleteBusy(true);
    const ids = Array.from(deletePicked);
    const deleted: string[] = [];
    const errors: string[] = [];
    // 한 건씩 — RPC가 사용 이력 등을 개별 검사하므로 일부만 실패할 수 있다
    for (const id of ids) {
      const { data, error } = await supabase.rpc("delete_coupon_issue", { p_id: id });
      const r = data as { success: boolean; error?: string } | null;
      if (!error && r?.success) deleted.push(id);
      else errors.push(r?.error || "삭제 실패");
    }
    // 실패분은 목록에 남겨야 하므로 성공한 id만 걸러낸다
    if (deleted.length > 0) {
      const gone = new Set(deleted);
      setCoupons((prev) => prev.filter((c) => !gone.has(c.id)));
    }
    setDeleteBusy(false);
    exitDeleteMode();
    if (errors.length === 0) toast.success(`${deleted.length}개 삭제됐어요`);
    else if (deleted.length === 0) toast.error(errors[0]);
    else toast.error(`${deleted.length}개 삭제 · ${errors.length}개 실패`);
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-background pb-24"}>
      <div className={embedded ? "" : "max-w-lg mx-auto px-4 py-5"}>
        {!embedded && (
          <Link
            href="/md/dashboard"
            className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            대시보드
          </Link>
        )}
        {!embedded && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Ticket className="w-5 h-5 text-brand-amber" />
              <h1 className="text-2xl font-black text-foreground tracking-tight">쿠폰 발행</h1>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
              무료입장·프리드링크 등 혜택을 쿠폰으로 만들어 유저가 직접 받아가게 하세요.
            </p>
          </>
        )}

        {!showForm && (
          <button
            type="button"
            onClick={() => {
              if (hasPasscode === false) { setPassSheetOpen(true); return; }
              setShowForm(true);
            }}
            className="w-full h-12 mb-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            새 쿠폰 발행
          </button>
        )}

        {/* 비밀번호 설정 시트 */}
        {passSheetOpen && (
          <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60" onClick={() => setPassSheetOpen(false)}>
            <div
              className="w-full max-w-lg bg-card rounded-t-3xl p-5 pb-8 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <p className="text-[16px] font-black text-foreground">승인 비밀번호</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  손님이 쿠폰을 사용할 때 이 번호를 입력해야 처리돼요.
                  나만 알고 있어야 다른 곳에서 몰래 쓰는 걸 막을 수 있어요.
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={passInput}
                onChange={(e) => setPassInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="숫자 4자리"
                maxLength={4}
                className="w-full h-14 rounded-xl bg-background border border-border px-4 text-[22px] font-black tracking-[0.5em] text-center text-foreground placeholder:text-muted-foreground placeholder:text-[14px] placeholder:tracking-normal placeholder:font-bold focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="button"
                onClick={handleSavePasscode}
                disabled={passBusy || passInput.length !== 4}
                className="w-full h-12 rounded-xl bg-amber-500 disabled:opacity-40 text-black font-black text-[14px]"
              >
                {passBusy ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}

        {/* 발행 폼 — 하단 시트. 인라인으로 펼치면 목록이 아래로 밀려 답답하다.
            "다시 발행"도 같은 폼을 열므로 함께 모달로 뜬다. */}
        {showForm && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"
          >
          <div
            className="w-full max-w-lg bg-card rounded-3xl px-5 pt-5 pb-6 space-y-5 max-h-[85vh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-[20px] text-foreground font-black tracking-tight">새 쿠폰 발행</p>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ① 클럽 선택 */}
            <section className="space-y-2">
              <div className="text-foreground font-bold text-[13px]">
                <span>클럽 선택</span>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden relative h-12">
                <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
                  <span className={`text-sm font-medium truncate ${selectedClub ? "text-foreground" : "text-muted-foreground"}`}>
                    {selectedClub ? `${selectedClub.name}${selectedClub.area ? ` (${selectedClub.area})` : ""}` : "클럽을 선택하세요"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                </div>
                <select
                  value={clubId}
                  onChange={(e) => setClubId(e.target.value)}
                  disabled={busy || clubs.length === 0}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {clubs.length === 0 && <option value="">소속 클럽 없음</option>}
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.area ? ` (${c.area})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* ② 혜택 종류 */}
            <section className="space-y-2">
              <div className="text-foreground font-bold text-[13px]">
                <span>혜택 종류</span>
              </div>
              <CouponBenefitPicker
                benefitType={benefitType}
                onBenefitTypeChange={(t) => {
                  setBenefitType(t);
                  if (allowsDiscount(t)) {
                    // 정액을 기본 선택으로 — MD가 바로 금액을 입력하면 되게 한다
                    setDiscountType("flat");
                    setDiscountValue("");
                  } else {
                    setDiscountType("");
                    setDiscountValue("");
                  }
                  // 병 단위 토글은 서비스 바틀 전용. 서비스 바틀을 고르면 병이 기본, 아니면 만원으로.
                  setMinSpendUnit(t === "service_bottle" ? "bottle" : "krw");
                }}
                disabled={busy}
              />
              {benefitType === "etc" && (
                <textarea
                  value={benefitDetail}
                  onChange={(e) => setBenefitDetail(e.target.value)}
                  placeholder="어떤 혜택인지 설명해주세요"
                  rows={2}
                  maxLength={100}
                  className="w-full rounded-xl bg-card border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                />
              )}
              {benefitType === "tequila_shot" && (
                <div className="flex items-center justify-center rounded-xl bg-card border border-border px-3 h-11">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || shotQty <= 1}
                      onClick={() => setShotQty((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg text-foreground font-black text-[15px] disabled:opacity-30 active:scale-95 transition"
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm font-bold text-foreground tabular-nums">{shotQty}잔</span>
                    <button
                      type="button"
                      disabled={busy || shotQty >= 10}
                      onClick={() => setShotQty((q) => Math.min(10, q + 1))}
                      className="w-7 h-7 rounded-lg text-foreground font-black text-[15px] disabled:opacity-30 active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ③ 할인 조건 — 최소구매("5만원/2병 이상 구매시")와 할인값(정액/정률)을 한 섹션으로.
                단위(만원/병)를 바꿀 수 있어 "서비스 바틀"처럼 병 개수 조건도 표현한다.
                정액을 기본 선택으로 둬 MD가 바로 금액을 입력할 수 있게 한다.
                무료입장·프리드링크·프리패스는 공짜로 주는 것이라 조건/할인 개념이 없어 숨긴다. */}
            {allowsMinSpend(benefitType) && (
            <section className="space-y-2">
              <div className="text-foreground font-bold text-[13px]">
                <span>할인 조건{benefitType === "etc" ? " (선택)" : ""}</span>
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={minSpendValue}
                    onChange={(e) => setMinSpendValue(e.target.value.replace(/[^0-9]/g, ""))}
                    maxLength={minSpendUnit === "bottle" ? 2 : 5}
                    className="w-full h-11 rounded-xl bg-card border border-border pl-3 pr-28 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-bold pointer-events-none">
                    {minSpendUnit === "bottle" ? "병 이상 구매시" : "만원 이상 구매시"}
                  </span>
                </div>
                {benefitType === "service_bottle" && (
                <div className="flex items-center gap-1 shrink-0">
                  {([
                    { v: "bottle", label: "병" },
                    { v: "krw", label: "만원" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (minSpendUnit === o.v) return;
                        setMinSpendUnit(o.v);
                        setMinSpendValue("");
                      }}
                      className={`h-11 px-2.5 rounded-xl text-[12px] font-bold transition-colors border ${
                        minSpendUnit === o.v
                          ? "bg-green-500 text-black border-green-500"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                )}
              </div>
              {benefitType === "service_bottle" && (
                <div className="space-y-1.5">
                  {bottleItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const next = [...bottleItems];
                          next[i] = { ...next[i], name: e.target.value };
                          setBottleItems(next);
                        }}
                        placeholder="바틀 이름 (예: 샴페인, 하드, 호세 등)"
                        maxLength={30}
                        className="flex-1 min-w-0 h-11 rounded-xl bg-card border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                      />
                      <div className="flex items-center gap-1 shrink-0 h-11 rounded-xl bg-card border border-border px-1">
                        <button
                          type="button"
                          disabled={busy || item.qty <= 1}
                          onClick={() => {
                            const next = [...bottleItems];
                            next[i] = { ...next[i], qty: Math.max(1, next[i].qty - 1) };
                            setBottleItems(next);
                          }}
                          className="w-7 h-7 rounded-lg text-foreground font-black text-[15px] disabled:opacity-30 active:scale-95 transition"
                        >
                          −
                        </button>
                        <span className="w-9 text-center text-sm font-bold text-foreground tabular-nums">{item.qty}병</span>
                        <button
                          type="button"
                          disabled={busy || item.qty >= 20}
                          onClick={() => {
                            const next = [...bottleItems];
                            next[i] = { ...next[i], qty: Math.min(20, next[i].qty + 1) };
                            setBottleItems(next);
                          }}
                          className="w-7 h-7 rounded-lg text-foreground font-black text-[15px] disabled:opacity-30 active:scale-95 transition"
                        >
                          +
                        </button>
                      </div>
                      {bottleItems.length > 1 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setBottleItems(bottleItems.filter((_, idx) => idx !== i))}
                          className="shrink-0 w-9 h-11 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-red-400 active:scale-95 transition"
                          aria-label="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {bottleItems.length < 2 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setBottleItems([...bottleItems, { name: "", qty: 1 }])}
                      className="h-9 px-3 rounded-full text-[12px] font-bold border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      바틀 추가
                    </button>
                  )}
                </div>
              )}

              {allowsDiscount(benefitType) && (
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={discountType === "percent" ? "10" : "5"}
                    maxLength={discountType === "percent" ? 3 : 4}
                    className="w-full h-11 rounded-xl bg-card border border-border pl-3 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-bold pointer-events-none">
                    {discountType === "percent" ? "% 할인" : "만원 할인"}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {([
                    { v: "flat", label: "정액 ₩" },
                    { v: "percent", label: "정률 %" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (discountType === o.v) return;
                        setDiscountType(o.v);
                        setDiscountValue("");
                      }}
                      className={`h-11 px-2.5 rounded-xl text-[12px] font-bold transition-colors border ${
                        discountType === o.v
                          ? "bg-green-500 text-black border-green-500"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              )}
            </section>
            )}

            {/* ④ 수량 */}
            <section className="space-y-2">
              <div className="text-foreground font-bold text-[13px]">
                <span>수량</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { v: "unlimited", label: "무제한" },
                  { v: "10", label: "10장" },
                  { v: "20", label: "20장" },
                  { v: "30", label: "30장" },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    disabled={busy}
                    onClick={() => setTotalCount(o.v)}
                    className={`h-9 px-3.5 rounded-full text-[12px] font-bold border transition-colors ${
                      totalCount === o.v
                        ? "bg-green-500 text-black border-green-500"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={custom}
                    onChange={(e) => setTotalCount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="직접입력"
                    maxLength={2}
                    disabled={busy}
                    className={`h-9 w-24 rounded-full border px-3.5 text-[12px] font-bold text-center focus:outline-none focus:border-green-500/50 ${
                      custom
                        ? "bg-green-500 text-black border-green-500 pr-6"
                        : "bg-card text-foreground border-border placeholder:text-muted-foreground placeholder:font-bold"
                    }`}
                  />
                  {custom && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-black pointer-events-none">
                      장
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ⑤ 사용 마감 */}
            <section className="space-y-2">
              <div className="text-foreground font-bold text-[13px]">
                <span>사용 마감</span>
              </div>
              <DateTimeSheet
                mode="datetime"
                value={redeemEndsAtLocal}
                onChange={setRedeemEndsAtLocal}
                label="사용 마감"
                timeLabel="마감 시각"
                placeholder="마감 시각을 선택하세요"
                min={dayjs().format("YYYY-MM-DDTHH:mm")}
                max={dayjs().add(14, "day").format("YYYY-MM-DDTHH:mm")}
                elevated
              />
              <p className="text-[11px] text-muted-foreground">
                이 시각이 지나면 쿠폰이 자동으로 만료돼요. 최대 14일 이내로 설정할 수 있어요.
              </p>
            </section>

            {/* 더보기 (접힘) */}
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-bold"
            >
              {showMore ? "간단히 보기 ▲" : "상세 설명·사용 조건 추가 ▼"}
            </button>
            {showMore && (
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CONDITION_PRESETS.map((preset) => {
                    const on = conditions.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={busy}
                        onClick={() => toggleCondition(preset)}
                        className={`h-8 px-3 rounded-full text-[12px] font-bold border transition-colors ${
                          on
                            ? "bg-green-500 text-black border-green-500"
                            : "bg-card text-muted-foreground border-border"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="사용 조건을 자유롭게 입력할 수 있어요"
                  rows={2}
                  maxLength={80}
                  className="w-full rounded-xl bg-card border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                />
              </section>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-[14px]"
            >
              {busy ? "발행 중..." : "쿠폰 발행하기"}
            </button>
          </div>
          </div>
        )}

        {/* 내 쿠폰 목록 — 발행중/소진 */}
        <div className="space-y-3">
          {visibleCoupons.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground py-8">
              아직 발행한 쿠폰이 없어요
            </p>
          ) : (
            visibleCoupons.map((c) => (
              <CouponIssueCard key={c.id} coupon={c} onCancel={() => handleCancel(c.id)} />
            ))
          )}
        </div>

        {/* 지난 쿠폰 — 취소·만료분. 완전히 안 지우고 "다시 발행"으로 재사용 가능하게 둔다 */}
        {pastCoupons.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 px-1">
              {deleteMode ? (
                <>
                  <button
                    type="button"
                    onClick={exitDeleteMode}
                    className="h-7 px-3 rounded-full bg-muted text-muted-foreground text-[11.5px] font-black hover:text-foreground transition-colors"
                  >
                    취소
                  </button>
                  <span className="text-[11.5px] font-bold text-muted-foreground">
                    {deletePicked.size}개 선택
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeletePicked((prev) =>
                        prev.size === pastCoupons.length
                          ? new Set()
                          : new Set(pastCoupons.map((c) => c.id))
                      )
                    }
                    className="ml-auto h-7 px-3 rounded-full bg-muted text-muted-foreground text-[11.5px] font-black hover:text-foreground transition-colors"
                  >
                    {deletePicked.size === pastCoupons.length ? "전체 해제" : "전체 선택"}
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy || deletePicked.size === 0}
                    onClick={handleBulkDelete}
                    className="h-7 px-3 rounded-full bg-red-500 text-white text-[11.5px] font-black disabled:opacity-40 active:scale-95 transition"
                  >
                    {deleteBusy ? "삭제 중…" : `${deletePicked.size}개 삭제`}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[12px] font-bold text-muted-foreground">지난 쿠폰</p>
                  <button
                    type="button"
                    onClick={() => setDeleteMode(true)}
                    aria-label="여러 개 삭제"
                    className="ml-auto w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            {pastCoupons.map((c) => (
              <CouponIssueCard
                key={c.id}
                coupon={c}
                onReissue={() => handleReissue(c)}
                onToggleFavorite={() => handleToggleFavorite(c.id)}
                deleteMode={deleteMode}
                deletePicked={deletePicked.has(c.id)}
                onTogglePick={() => toggleDeletePick(c.id)}
              />
            ))}
          </div>
        )}

        {/* 승인 비밀번호 — 유저가 쿠폰을 쓸 때 MD가 입력하는 4자리 */}
        <button
          type="button"
          onClick={() => setPassSheetOpen(true)}
          className={`w-full mb-3 rounded-xl px-3.5 py-3 flex items-center justify-between text-left border transition-colors ${
            hasPasscode === false
              ? "bg-amber-500/10 border-amber-500/40"
              : "bg-card border-border"
          }`}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-foreground inline-flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-money" />
              승인 비밀번호
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {hasPasscode === false
                ? "설정해야 쿠폰을 발행할 수 있어요"
                : "손님이 쿠폰 쓸 때 내가 입력하는 4자리"}
            </p>
          </div>
          <span className={`text-[11px] font-black shrink-0 ml-2 ${hasPasscode ? "text-muted-foreground" : "text-amber-400"}`}>
            {hasPasscode === null ? "" : hasPasscode ? "변경" : "설정하기"}
          </span>
        </button>
      </div>

      {guideOpen && (
        <CouponOnboardingSheet manualOpen onManualClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
