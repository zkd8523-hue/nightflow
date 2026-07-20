"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAreaVerification } from "@/hooks/useAreaVerification";
import {
  ROOM_LABEL,
  VERIFIABLE_AREAS,
  type VerifiableArea,
} from "@/lib/chat/areas";

const IS_DEV = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

type VerifyReason = "chat" | "shot";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 인증 성공 시 감지된 지역 코드 반환 */
  onSuccess?: (detected: VerifiableArea) => void;
  /** 진입 컨텍스트 — 'shot'이면 SHOT 작성 안내, 그 외는 채팅 참여 안내 */
  reason?: VerifyReason;
}

export function AreaVerifySheet({
  open,
  onOpenChange,
  onSuccess,
  reason = "chat",
}: Props) {
  const { verifyByCurrentLocation } = useAreaVerification();
  const [loading, setLoading] = useState(false);
  // dev 환경에서만 사용: 선택한 지역으로 우회 인증
  const [devSelectedArea, setDevSelectedArea] = useState<VerifiableArea>("gangnam");

  async function handleVerify() {
    setLoading(true);
    try {
      const detected = await verifyByCurrentLocation(
        IS_DEV ? devSelectedArea : undefined
      );
      if (!detected) {
        toast.error(
          "현재 위치는 채팅방이 열려있지 않아요. 강남·홍대·이태원에서 시도해주세요"
        );
        onOpenChange(false);
        return;
      }
      toast.success(
        `${ROOM_LABEL[detected]} 지역으로 인증되었어요! 2시간 동안 채팅할 수 있어요`
      );
      onSuccess?.(detected);
      onOpenChange(false);
    } catch (e) {
      const err = e as { message?: string; code?: number };
      console.error("[AreaVerifySheet] error", e);
      if (err.code === 1) {
        toast.error("위치 권한이 거부되었습니다. 설정에서 허용해주세요");
      } else if (err.code === 3) {
        toast.error("위치 확인 시간이 초과되었습니다. 다시 시도해주세요");
      } else {
        toast.error(`위치 확인 실패: ${err.message ?? "알 수 없는 오류"}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-card border-border rounded-t-3xl pb-6"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-foreground text-[16px] text-left">
            {reason === "shot"
              ? "🔴 클럽 지정 LIVE는 현장 인증자만 올릴 수 있어요"
              : "지금 위치를 확인할게요"}
          </SheetTitle>
          {reason === "shot" && (
            <p className="text-left text-[12px] text-muted-foreground pt-1">
              지금 강남·홍대·이태원에 있다면 인증하고 LIVE를 올려보세요
            </p>
          )}
        </SheetHeader>

        <div className="mt-3 space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-background border border-border">
            <MapPin className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[14px] text-foreground font-bold">
                {IS_DEV
                  ? "[테스트 환경] 위치 우회 인증"
                  : "현재 위치 기준으로 자동 입장돼요"}
              </p>
              {IS_DEV ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    비프로덕션 환경이라 GPS 호출 없이 바로 인증됩니다.
                    <br />
                    원하는 지역을 선택해주세요.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {VERIFIABLE_AREAS.map((a) => {
                      const selected = devSelectedArea === a.code;
                      return (
                        <button
                          key={a.code}
                          type="button"
                          onClick={() => setDevSelectedArea(a.code)}
                          className={`px-2.5 py-1 rounded-full text-[12px] font-bold border transition-colors ${
                            selected
                              ? "bg-amber-500/20 border-amber-500 text-brand-amber"
                              : "bg-card border-border text-foreground/80 hover:border-border"
                          }`}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  <b className="text-brand-amber">강남·홍대·이태원</b>이면 해당
                  지역방으로 자동 배치됩니다.
                  <br />
                  인증은 <b className="text-brand-amber">2시간</b> 동안 유효하고,
                  만료 전 자동 갱신돼요.
                  <br />
                  <span className="text-muted-foreground text-[11px]">
                    ※ 좌표는 저장되지 않고 지역 코드만 보관됩니다
                  </span>
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-[14px] font-black bg-inverse text-inverse-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                위치 확인 중...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />위치 인증하기
              </>
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
