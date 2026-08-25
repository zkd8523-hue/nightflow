"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { benefitTypeLabel, couponDisplayName, REDEEM_COLORS, formatDiscount, formatCouponCountdown } from "@/lib/utils/coupon";
import type { CouponBenefitType, CouponDiscountType, CouponMinSpendUnit } from "@/types/database";

/**
 * 쿠폰 사용 화면 — QR/스캐너 없이 MD가 "화면만 보고" 판단하는 위조 방지 UI.
 * 정적 스크린샷으로 재현 불가능하게 만드는 장치:
 *  1) 초 단위 실시간 시계 (서버-클라 오프셋 보정, 250ms 갱신)
 *  2) 애니메이션 워터마크 (유저명 + claim id, 대각선 이동)
 *  4) 1회성 도장 애니메이션 + 햅틱
 * (3 오늘의 색, 5 상대시간은 Phase 2)
 */

interface ClaimData {
  id: string;
  issue_id: string;
  benefit_type: CouponBenefitType;
  title_snapshot: string;
  status: "active" | "redeemed" | "expired" | "revoked";
  expires_at: string;
  redeemed_at: string | null;
  redeem_nonce: string | null;
  redeem_color: number | null;
  // Migration 540에서 get_coupon_redeem_view가 조인해 넘겨주는 값들.
  // MD가 화면만 보고 판단하려면 클럽명·사용조건이 반드시 있어야 한다.
  club_name: string | null;
  club_area: string | null;
  club_thumbnail: string | null;
  conditions: string | null;
  benefit_detail: string | null;
  benefit_tags: string[] | null;
  discount_type: CouponDiscountType | null;
  discount_amount: number | null;
  min_spend: number | null;
  min_spend_unit: CouponMinSpendUnit;
  md_name: string | null;
  md_image: string | null;
}

interface Props {
  claimId: string;
  displayName: string;
}

type Phase = "loading" | "waiting" | "entering" | "redeemed" | "error";

const PASSCODE_LEN = 4;

export function CouponRedeemScreen({ claimId, displayName }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [color, setColor] = useState<number>(0);
  const [redeemedAt, setRedeemedAt] = useState<string | null>(null);

  // 서버-클라 시계 오프셋 (위조 방지 장치 1)
  const offsetRef = useRef(0);
  const [displayNow, setDisplayNow] = useState(() => Date.now());

  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // 진입 시 조회 — server_now로 오프셋 계산
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_coupon_redeem_view", { p_claim_id: claimId });
      if (cancelled) return;
      if (error) {
        setPhase("error");
        setErrorMsg("쿠폰을 불러오지 못했어요");
        return;
      }
      const result = data as { success: boolean; error?: string; claim?: ClaimData; server_now?: string };
      if (!result?.success || !result.claim) {
        setPhase("error");
        setErrorMsg(result?.error || "쿠폰을 찾을 수 없어요");
        return;
      }
      offsetRef.current = result.server_now ? new Date(result.server_now).getTime() - Date.now() : 0;
      setClaim(result.claim);
      if (result.claim.status === "redeemed") {
        setPhase("redeemed");
        setRedeemedAt(result.claim.redeemed_at);
        setNonce(result.claim.redeem_nonce);
        setColor(result.claim.redeem_color ?? 0);
      } else if (result.claim.status !== "active" || new Date(result.claim.expires_at).getTime() <= Date.now() + offsetRef.current) {
        setPhase("error");
        setErrorMsg(result.claim.status === "revoked" ? "발행이 취소된 쿠폰이에요" : "만료된 쿠폰이에요");
      } else {
        setPhase("waiting");
      }
    })();
    return () => { cancelled = true; };
  }, [claimId, supabase]);

  // 실시간 시계 250ms 갱신
  useEffect(() => {
    const t = setInterval(() => setDisplayNow(Date.now() + offsetRef.current), 250);
    return () => clearInterval(t);
  }, []);

  const doRedeem = async (code: string) => {
    setVerifying(true);
    setPassError(null);
    const { data, error } = await supabase.rpc("redeem_coupon", {
      p_claim_id: claimId,
      p_passcode: code,
    });
    setVerifying(false);
    if (error) {
      // RPC 자체가 실패한 경우 — 함수 없음/스키마 불일치 등 원인이 보여야 진단이 된다
      setPassError(error.message || error.code || "사용 처리에 실패했어요");
      setPasscode("");
      return;
    }
    const result = data as {
      success: boolean;
      error?: string;
      redeemed_at?: string;
      nonce?: string;
      color?: number;
      server_now?: string;
    };
    if (!result?.success) {
      setPassError(result?.error || "사용 처리에 실패했어요");
      setPasscode("");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
      return;
    }
    if (result.server_now) offsetRef.current = new Date(result.server_now).getTime() - Date.now();
    setRedeemedAt(result.redeemed_at ?? new Date().toISOString());
    setNonce(result.nonce ?? null);
    setColor(result.color ?? 0);
    setPhase("redeemed");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  if (phase === "loading") {
    return <div className="min-h-dvh bg-black flex items-center justify-center text-white/60 text-sm">불러오는 중...</div>;
  }

  if (phase === "error") {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white font-black text-lg">{errorMsg}</p>
        <button
          type="button"
          onClick={() => router.push("/my-coupons")}
          className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-black"
        >
          내 쿠폰함으로
        </button>
      </div>
    );
  }

  if (!claim) return null;
  const { label, emoji } = benefitTypeLabel(claim.benefit_type);

  if (phase === "redeemed") {
    const [from, to] = REDEEM_COLORS[color % REDEEM_COLORS.length];
    return (
      <RedeemedView
        title={claim.title_snapshot}
        label={label}
        emoji={emoji}
        nonce={nonce}
        redeemedAt={redeemedAt}
        gradientFrom={from}
        gradientTo={to}
        displayNow={displayNow}
        displayName={displayName}
        claimId={claimId}
        clubName={claim.club_name}
        mdName={claim.md_name}
        onBack={() => router.push("/my-coupons")}
      />
    );
  }

  // waiting / holding
  return (
    <div className="min-h-dvh bg-black flex flex-col relative overflow-hidden select-none">
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
        aria-label="뒤로가기"
      >
        <ChevronLeft className="w-5 h-5 text-white" />
      </button>

      <div className="pt-16">
        <LiveTicker
          displayNow={displayNow}
          segments={[claim.club_name, label, claim.md_name && `발행 ${claim.md_name}`, displayName]}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <TicketCard claim={claim} label={label} emoji={emoji} displayNow={displayNow} />
        {phase !== "entering" && (
          <p className="text-white/45 text-[12px] mt-4">관리자 앞에서 사용해주세요</p>
        )}
      </div>

      <div className="pb-10 px-6">
        {phase === "entering" ? (
          <PasscodePad
            value={passcode}
            error={passError}
            verifying={verifying}
            onChange={(v) => {
              setPasscode(v);
              setPassError(null);
              if (v.length === PASSCODE_LEN) doRedeem(v);
            }}
            onCancel={() => { setPhase("waiting"); setPasscode(""); setPassError(null); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setPhase("entering"); setPasscode(""); setPassError(null); }}
            className="w-full h-16 rounded-2xl bg-amber-500 font-black text-black text-[16px] active:scale-[0.98] transition-transform"
          >
            사용하기
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * MD 승인 비밀번호 입력 패드.
 * 유저 혼자 누를 수 있던 "길게 누르기"를 대체한다 — MD만 아는 4자리를 입력해야
 * 사용 처리가 되므로 MD의 물리적 개입이 강제된다.
 * 어두운 클럽에서 MD가 빠르게 치도록 시스템 키보드 대신 큰 자체 키패드를 쓴다.
 */
function PasscodePad({
  value,
  error,
  verifying,
  onChange,
  onCancel,
}: {
  value: string;
  error: string | null;
  verifying: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
}) {
  const push = (d: string) => {
    if (verifying || value.length >= PASSCODE_LEN) return;
    onChange(value + d);
  };
  const back = () => {
    if (verifying) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="w-full">
      {/* 입력 표시 */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {Array.from({ length: PASSCODE_LEN }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              error ? "bg-red-400" : i < value.length ? "bg-amber-400" : "bg-white/20"
            }`}
          />
        ))}
      </div>

      <p className={`text-center text-[12px] font-bold mb-4 h-4 ${error ? "text-red-400" : "text-white/50"}`}>
        {verifying ? "확인 중..." : error ?? "관리자가 비밀번호를 입력해주세요"}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PadKey key={d} onClick={() => push(d)} disabled={verifying}>
            {d}
          </PadKey>
        ))}
        <PadKey onClick={onCancel} disabled={verifying} muted>
          취소
        </PadKey>
        <PadKey onClick={() => push("0")} disabled={verifying}>
          0
        </PadKey>
        <PadKey onClick={back} disabled={verifying} muted>
          ←
        </PadKey>
      </div>
    </div>
  );
}

function PadKey({
  children,
  onClick,
  disabled,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 rounded-2xl font-black transition-transform active:scale-95 disabled:opacity-40 ${
        muted
          ? "bg-white/5 text-white/60 text-[14px]"
          : "bg-white/10 text-white text-[22px]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 티켓 카드 — CGV 모바일티켓 형태.
 * MD가 화면만 보고 판단해야 하므로 클럽명·혜택·할인·사용조건·유효기간을
 * 한 카드 안에 모두 담는다. 가로 절취선으로 실물 티켓 감각을 준다.
 */
function TicketCard({
  claim,
  label,
  emoji,
  displayNow,
}: {
  claim: ClaimData;
  label: string;
  emoji: string;
  displayNow: number;
}) {
  const discount = formatDiscount(claim.discount_type, claim.discount_amount, claim.min_spend, claim.min_spend_unit);
  const display = couponDisplayName(claim.benefit_type, claim.benefit_detail);
  const expiresLabel = formatCouponCountdown(claim.expires_at, displayNow);

  return (
    <div className="w-full max-w-[340px] rounded-3xl overflow-hidden bg-[#161616] border border-white/10 shadow-2xl">
      {/* 클럽 썸네일 */}
      {claim.club_thumbnail && (
        <div className="relative w-full h-32">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={claim.club_thumbnail} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/30 to-transparent" />
        </div>
      )}

      {/* 상단: 혜택 + 클럽.
          할인이 없으면 라벨과 제목이 같은 값이 되어 "프리드링크"가 두 번 나온다.
          → 혜택 라벨을 큰 제목으로 쓰고, 할인이 있을 때만 그 아래 강조한다. */}
      <div className={`px-5 ${claim.club_thumbnail ? "pt-1" : "pt-6"} pb-5 text-center`}>
        <h1 className="text-[26px] font-black text-white leading-tight">
          <span className="mr-1">{display.emoji}</span>{display.name}
        </h1>
        {discount && (
          <p className="text-[15px] font-black text-amber-400 mt-1.5">{discount}</p>
        )}
        {claim.club_name && (
          <p className="text-white/70 text-[14px] font-bold mt-2">
            {claim.club_name}
            {claim.club_area && <span className="text-white/40 font-medium"> · {claim.club_area}</span>}
          </p>
        )}
        {claim.md_name && (
          <p className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white/10 border border-white/15">
            <span className="text-[10px] font-bold text-white/50">발행</span>
            <span className="text-[14px] font-black text-white">{claim.md_name}</span>
          </p>
        )}
      </div>

      {/* 가로 절취선 — 좌우 반원 노치 + 점선 */}
      <div className="relative h-5" aria-hidden>
        <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-white/20" />
        <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black" />
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black" />
      </div>

      {/* 하단: 조건 + 유효기간 */}
      <div className="px-5 pt-3 pb-5 space-y-3">
        {claim.benefit_tags && claim.benefit_tags.length > 0 && (
          <div className="flex gap-3 text-left">
            <span className="text-[11px] text-white/40 font-bold shrink-0 w-[60px] pt-1">추가 혜택</span>
            <div className="flex flex-wrap gap-1">
              {claim.benefit_tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-[11px] font-bold text-amber-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {claim.benefit_detail && claim.benefit_type !== "etc" && (
          <Row label="혜택 내용" value={claim.benefit_detail} />
        )}
        {claim.conditions && (
          <Row label="사용 조건" value={claim.conditions} highlight />
        )}
        <Row label="사용 마감" value={expiresLabel} />
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-3 text-left">
      <span className="text-[11px] text-white/40 font-bold shrink-0 w-[60px] pt-0.5">{label}</span>
      <span className={`text-[13px] font-bold leading-snug ${highlight ? "text-amber-400" : "text-white/85"}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * 전광판 바 — 위조 방지 장치 1·2 통합.
 * 클럽·혜택·발행자·현재시각을 한 줄로 끊임없이 흘려보낸다.
 * 정적 스크린샷은 텍스트가 멈춰 있어 즉시 구분되고, 동시에 MD가 확인해야 할
 * 정보(어느 클럽 / 무슨 혜택 / 누가 발행)를 모두 담는다.
 * 시각은 서버 오프셋 보정값(displayNow)이라 클라 시계 조작도 무력화된다.
 */
function LiveTicker({
  displayNow,
  segments,
}: {
  displayNow: number;
  segments: (string | null | undefined)[];
}) {
  const d = new Date(displayNow);
  const clock = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  const parts = [...segments.filter(Boolean), clock] as string[];
  // 끊김 없이 이어지도록 같은 내용을 2벌 렌더한다 (translateX -50%로 순환).
  const strip = (
    <span className="inline-flex items-center shrink-0">
      {parts.map((t, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="px-3 text-[12px] font-black tracking-wide whitespace-nowrap">{t}</span>
          <span className="text-white/25">•</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="w-full overflow-hidden border-y border-white/10 bg-white/[0.04] py-2">
      <div className="flex w-max animate-[coupon-ticker_9s_linear_infinite] text-amber-300/90">
        {strip}
        {strip}
      </div>
      <style>{`
        @keyframes coupon-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function RedeemedView({
  title,
  label,
  emoji,
  nonce,
  redeemedAt,
  gradientFrom,
  gradientTo,
  displayNow,
  displayName,
  claimId,
  clubName,
  mdName,
  onBack,
}: {
  title: string;
  label: string;
  emoji: string;
  nonce: string | null;
  redeemedAt: string | null;
  gradientFrom: string;
  gradientTo: string;
  displayNow: number;
  displayName: string;
  claimId: string;
  clubName: string | null;
  mdName: string | null;
  onBack: () => void;
}) {
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStamped(true), 50);
    return () => clearTimeout(t);
  }, []);

  const watermark = `${displayName} · ${claimId.slice(0, 8)}`;

  return (
    <div
      className="min-h-dvh flex flex-col relative overflow-hidden select-none"
      style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
    >
      {/* 위조 방지 장치 2: 흐르는 워터마크 (정지 스크린샷은 한 위치 고정) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
        <div className="animate-coupon-watermark whitespace-nowrap text-white text-[13px] font-bold tracking-wider">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="mx-6">{watermark}</span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/20 flex items-center justify-center"
        aria-label="뒤로가기"
      >
        <ChevronLeft className="w-5 h-5 text-white" />
      </button>

      <div className="pt-16">
        <LiveTicker
          displayNow={displayNow}
          segments={[clubName, label, mdName && `발행 ${mdName}`, displayName]}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4 relative z-[1]">
        <div
          className={`transition-all duration-500 ${stamped ? "scale-100 opacity-100 blur-0" : "scale-150 opacity-0 blur-md"}`}
        >
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center mb-3 mx-auto">
            <span className="text-3xl">✓</span>
          </div>
          <p className="text-white/90 text-[13px] font-black">사용 완료</p>
        </div>
        <span className="text-[13px] font-bold text-white/90">{emoji} {label}</span>
        <h1 className="text-xl font-black text-white leading-snug">{title}</h1>
        {redeemedAt && (
          <RelativeTime redeemedAt={redeemedAt} displayNow={displayNow} />
        )}
        {nonce && (
          <p className="text-white/50 text-[11px] mt-2 font-mono tracking-widest">확인코드 {nonce}</p>
        )}
      </div>
    </div>
  );
}

function RelativeTime({ redeemedAt, displayNow }: { redeemedAt: string; displayNow: number }) {
  const diffSec = Math.max(0, Math.floor((displayNow - new Date(redeemedAt).getTime()) / 1000));
  const text = diffSec < 60 ? `${diffSec}초 전 사용됨` : `${Math.floor(diffSec / 60)}분 전 사용됨`;
  return <p className="text-white/70 text-[12px] font-bold">{text}</p>;
}
