"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

type Purpose = "signup" | "md_apply";

const isTestLoginEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

interface PhoneVerificationFieldProps {
  value: string;
  onChange: (next: string) => void;
  verified: boolean;
  onVerifiedChange: (next: boolean) => void;
  purpose?: Purpose;
  errorMessage?: string;
}

const SEND_ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: "올바른 휴대폰 번호를 입력해주세요.",
  phone_cooldown: "잠시 후 다시 시도해주세요.",
  phone_daily_limit: "오늘 인증 시도 횟수를 초과했습니다.",
  ip_limit: "잠시 후 다시 시도해주세요.",
  phone_already_registered: "이미 다른 계정에 등록된 번호입니다.",
  sms_send_failed: "SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
  unauthorized: "로그인이 필요합니다.",
  server_error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: "올바른 휴대폰 번호를 입력해주세요.",
  invalid_code: "6자리 숫자를 입력해주세요.",
  no_pending_verification: "인증번호를 먼저 받아주세요.",
  already_verified: "이미 인증이 완료되었습니다.",
  expired: "인증번호가 만료되었습니다. 다시 받아주세요.",
  too_many_attempts: "시도 횟수를 초과했습니다. 다시 받아주세요.",
  wrong_code: "인증번호가 올바르지 않습니다.",
  unauthorized: "로그인이 필요합니다.",
  server_error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PhoneVerificationField({
  value,
  onChange,
  verified,
  onVerifiedChange,
  purpose = "md_apply",
  errorMessage,
}: PhoneVerificationFieldProps) {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const lastVerifiedPhone = useRef<string | null>(null);

  // 인증 후 phone 값이 바뀌면 인증 상태 초기화
  useEffect(() => {
    if (verified && lastVerifiedPhone.current && value !== lastVerifiedPhone.current) {
      onVerifiedChange(false);
      setOtpVisible(false);
      setCode("");
      setExpiresAt(null);
    }
  }, [value, verified, onVerifiedChange]);

  // 카운트다운 timer
  useEffect(() => {
    if (!expiresAt || verified) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt, verified]);

  const remaining = expiresAt ? expiresAt - now : 0;
  const expired = otpVisible && remaining <= 0;

  async function handleSend() {
    if (!/^01[016789]\d{7,8}$/.test(value)) {
      toast.error("올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(SEND_ERROR_MESSAGES[data.error] ?? "인증번호 발송에 실패했습니다.");
        return;
      }
      const expires = new Date(data.expires_at).getTime();
      setExpiresAt(expires);
      setNow(Date.now());
      setOtpVisible(true);
      setCode(isTestLoginEnabled ? "000000" : "");

      // 테스트 모드: 자동 인증 완료 처리
      if (isTestLoginEnabled) {
        toast.success("테스트 모드: 자동 인증 처리 중...");
        await autoVerify("000000");
        return;
      }

      toast.success("인증번호를 발송했어요. 3분 내 입력해주세요.");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function autoVerify(autoCode: string) {
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value, code: autoCode, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(VERIFY_ERROR_MESSAGES[data.error] ?? "테스트 자동 인증 실패");
        return;
      }
      lastVerifiedPhone.current = value;
      onVerifiedChange(true);
      toast.success("테스트 인증 완료");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    }
  }

  async function handleVerify() {
    if (!/^\d{6}$/.test(code)) {
      toast.error("6자리 숫자를 입력해주세요.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: value, code, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = VERIFY_ERROR_MESSAGES[data.error] ?? "인증에 실패했습니다.";
        toast.error(
          data.error === "wrong_code" && typeof data.remaining_attempts === "number"
            ? `${msg} (남은 시도: ${data.remaining_attempts}회)`
            : msg,
        );
        return;
      }
      lastVerifiedPhone.current = value;
      onVerifiedChange(true);
      toast.success("휴대폰 인증이 완료되었습니다.");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-neutral-500 text-xs font-bold uppercase">휴대폰 번호 *</Label>

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          type="tel"
          inputMode="numeric"
          placeholder="01012345678"
          maxLength={11}
          readOnly={verified}
          className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono focus:ring-white flex-1"
        />
        <Button
          type="button"
          onClick={handleSend}
          disabled={sending || verified || value.length < 10}
          className="h-12 px-4 bg-white text-black font-bold hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : verified ? <Check className="w-4 h-4" /> : otpVisible ? "재발송" : "인증번호 받기"}
        </Button>
      </div>

      {otpVisible && !verified && (
        <div className="flex gap-2 pt-2">
          <div className="relative flex-1">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              placeholder="6자리 인증번호"
              maxLength={6}
              className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono focus:ring-white pr-16"
            />
            {!expired && expiresAt && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400 text-[12px] font-mono font-bold tabular-nums">
                {formatRemaining(remaining)}
              </span>
            )}
          </div>
          <Button
            type="button"
            onClick={handleVerify}
            disabled={verifying || expired || code.length !== 6}
            className="h-12 px-4 bg-white text-black font-bold hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "확인"}
          </Button>
        </div>
      )}

      {verified && (
        <p className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
          <Check className="w-3 h-3" />
          본인인증이 완료되었습니다
        </p>
      )}

      {!verified && !otpVisible && (
        <p className="text-neutral-600 text-[10px]">SMS로 6자리 인증번호가 발송됩니다. 가입 시 입력한 번호와 달라도 됩니다.</p>
      )}

      {expired && (
        <p className="text-red-500 text-[10px] font-bold">인증번호가 만료되었습니다. 다시 받아주세요.</p>
      )}

      {errorMessage && !verified && (
        <p className="text-red-500 text-[10px] font-bold">{errorMessage}</p>
      )}
    </div>
  );
}
