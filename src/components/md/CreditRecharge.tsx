"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, Landmark, Copy, CircleCheck } from "lucide-react";
import {
  CREDIT_PRODUCTS,
  BANK_TRANSFER_ACCOUNT,
  type CreditProduct,
} from "@/lib/payments/credit-products";
import { CreditHistory } from "@/components/md/CreditHistory";
import { formatPrice } from "@/lib/utils/format";

interface CreditRechargeProps {
  /** 현재 크레딧 잔액 (표시용) */
  currentCredits: number | null;
  /** 충전 내역 조회용 MD user id */
  userId: string;
}

/**
 * MD 크레딧 충전 — 계좌이체(무통장입금) 전용.
 * 흐름: 계좌 안내를 먼저 노출 → MD가 직접 입금 → 입금자명 입력 →
 *       [입금완료·확인 요청] → pending 생성 + 관리자 푸시 → 관리자 통장 확인 후 수기 적립.
 * (PG/카카오페이 경로는 심사 반려 이슈로 UI에서 제거. API 라우트는 유지.)
 */
export function CreditRecharge({ currentCredits, userId }: CreditRechargeProps) {
  const [selectedId, setSelectedId] = useState<string>(
    CREDIT_PRODUCTS.find((p) => p.recommended)?.id ?? CREDIT_PRODUCTS[0].id
  );
  const [loading, setLoading] = useState(false);
  const [depositorName, setDepositorName] = useState("");
  const [done, setDone] = useState<{ credits: number } | null>(null);

  const selected = CREDIT_PRODUCTS.find((p) => p.id === selectedId)!;

  async function handleRequest() {
    if (loading) return;
    const name = depositorName.trim();
    if (!name) {
      toast.error("입금자명을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/credits/bank-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selected.id, depositorName: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "요청에 실패했습니다.");
      }
      setDone({ credits: data.credits });
    } catch (e) {
      const message = e instanceof Error ? e.message : "요청 중 오류가 발생했습니다.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(BANK_TRANSFER_ACCOUNT.number.replace(/-/g, ""));
      toast.success("계좌번호가 복사되었습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-5">
      {/* 현재 잔액 */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          보유 크레딧
        </p>
        <p className="text-3xl font-black text-brand-amber">
          {currentCredits ?? 0}
          <span className="text-base font-bold text-muted-foreground ml-1">크레딧</span>
        </p>
      </div>

      {done ? (
        <RequestDone
          credits={done.credits}
          userId={userId}
          onReset={() => {
            setDone(null);
            setDepositorName("");
          }}
        />
      ) : (
        <>
          {/* 상품 선택 */}
          <div className="space-y-3">
            {CREDIT_PRODUCTS.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={product.id === selectedId}
                onSelect={() => setSelectedId(product.id)}
              />
            ))}
          </div>

          {/* 입금 계좌 안내 + 입금자명 (한 박스) */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <p className="text-sm font-black text-foreground">입금 계좌</p>

            <div className="rounded-xl bg-background/60 border border-border p-4 space-y-2 text-sm">
              <Row label="은행" value={BANK_TRANSFER_ACCOUNT.bank} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">계좌번호</span>
                <button onClick={copyAccount} className="flex items-center gap-1.5 font-black text-foreground">
                  {BANK_TRANSFER_ACCOUNT.number}
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <Row label="예금주" value={BANK_TRANSFER_ACCOUNT.holder} />
              <Row label="입금액" value={formatPrice(selected.amount)} highlight />
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              위 계좌로 입금하신 뒤, 아래에 <span className="text-foreground/80 font-bold">[입금완료·확인 요청]</span>을 눌러주세요.
              <br />평일 기준 <span className="text-foreground/80 font-bold">5분 내</span>로 크레딧을 적립해드립니다.
            </p>

            {/* 입금자명 입력 */}
            <div className="pt-1">
              <label className="text-xs font-bold text-foreground/80">입금자명</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                통장에 찍힐 이름을 그대로 입력해주세요. 이 이름으로 입금을 확인합니다.
              </p>
              <input
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                maxLength={40}
                placeholder="예: 김나플"
                className="w-full rounded-xl bg-background border border-border px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-amber-500"
              />
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              · 크레딧은 1개당 100원(부가세 포함)입니다.<br />
              · 관리자가 통장 확인 후 크레딧을 적립합니다. (심야에는 다소 지연될 수 있습니다)<br />
              · 미사용 크레딧은 충전일로부터 7일 이내 고객센터를 통해 전액 환불 가능합니다.
            </p>
          </div>

          <button
            onClick={handleRequest}
            disabled={loading}
            className="w-full rounded-full bg-inverse text-inverse-foreground font-black py-4 flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                요청 중...
              </>
            ) : (
              <>
                <Landmark className="w-5 h-5" />
                입금완료 · 확인 요청
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function RequestDone({
  credits,
  userId,
  onReset,
}: {
  credits: number;
  userId: string;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-500 font-black">
          <CircleCheck className="w-5 h-5" />
          입금확인 요청 완료
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">
          관리자가 통장 입금을 확인하면 <span className="font-bold">{credits}크레딧</span>이 적립됩니다.
          적립이 완료되면 알림으로 알려드립니다. (심야에는 다소 지연될 수 있습니다)
        </p>
        <p className="text-[11px] text-muted-foreground">
          아직 입금 전이라면 안내된 계좌로 입금해주세요. 오입금·금액 오류 시 고객센터로 문의해주세요.
        </p>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-full bg-card border border-border text-foreground font-bold py-3.5"
      >
        확인
      </button>

      {/* 충전 내역 (확인 버튼 아래, 기본 접힘) */}
      <CreditHistory userId={userId} />
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-black text-brand-amber" : "font-bold text-foreground"}>{value}</span>
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onSelect,
}: {
  product: CreditProduct;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 flex items-center justify-between transition-colors ${
        selected
          ? "border-amber-500 bg-amber-500/10"
          : "border-border bg-card hover:border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selected ? "border-amber-500 bg-amber-500" : "border-border"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
        </div>
        <div className="text-left">
          <p className="font-bold text-foreground">
            크레딧 {product.credits}개
            {product.recommended && (
              <span className="ml-2 text-[10px] font-black text-brand-amber bg-amber-500/15 px-2 py-0.5 rounded-full align-middle">
                인기
              </span>
            )}
          </p>
        </div>
      </div>
      <p className="font-black text-foreground">{formatPrice(product.amount)}</p>
    </button>
  );
}
