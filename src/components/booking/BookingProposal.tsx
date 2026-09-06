"use client";

// MD용 제안서 — 확정서(BookingPassMd)와 같은 레이아웃을 쓰되, 아직 합의 전이라
// "제안" 상태로 보여준다. 자리·확정가가 없고 체크인·도착 신호도 없다.
//
// 손님이 고른 술은 selected_menu 스냅샷에서 그대로 뽑는다 — 운영자가 옮겨 적지 않는다.
// MD가 여기서 바로 승인/거절하면 /api/proposal-response로 저장되고 운영자에게 SMS가 간다.

import { useState } from "react";
import type { SelectedMenuSnapshot } from "@/types/database";

const LANG_LABEL: Record<string, string> = {
  en: "English",
  ja: "일본어",
  zh: "중국어(간체)",
  "zh-tw": "중국어(번체)",
  ko: "한국어",
};

const REJECT_LABEL: Record<string, string> = {
  budget: "금액 부족",
  absent: "당일 미출근",
  expired: "예약 만료",
};

type Props = {
  proposalToken: string;
  mdResponse: string | null;
  mdTableChoosable: boolean | null;
  mdTableOptions: string | null;
  mdRejectReason: string | null;
  mdRequiredAmount: number | null;
  guestName: string | null;
  eventDate: string;
  groupSize: number | string;
  cancelled: boolean;
  lang: string | null;
  clubName: string | null;
  selectedMenu: SelectedMenuSnapshot | null;
  selectedMenuTotal: number | null;
  budget: number | null;
  guestRequest: string | null;
  hostName: string | null;
};

function fmtDateKo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

/** 스냅샷 → 사람이 읽는 줄. 테이블 차지는 금액에만 반영하고 줄로는 안 뽑는다. */
function menuLines(snap: SelectedMenuSnapshot | null): string[] {
  if (!snap) return [];
  const lines = snap.items.map((it) => {
    const choice = it.choices?.length
      ? ` (${it.choices.map((c) => c.name_en).join(", ")})`
      : "";
    const variant = it.label_en ? ` ${it.label_en}` : "";
    return `${it.qty} ${it.name_en}${variant}${choice}`;
  });
  if (snap.combo) {
    lines.push(`Combo — Champagne x${snap.combo.cham_count} + Hard x${snap.combo.hard_count}`);
  }
  return lines;
}

export function BookingProposal(p: Props) {
  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex gap-3 py-2.5 border-t border-border/60 first:border-t-0">
      <div className="shrink-0 w-[72px] text-[11px] font-semibold text-muted-foreground pt-0.5">
        {k}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );

  const lines = menuLines(p.selectedMenu);
  // 손님이 메뉴를 고른 요청은 그 합계가, 메뉴 없는 클럽이면 희망 예산이 기준 금액이다.
  const amount = p.selectedMenuTotal ?? p.budget;

  return (
    <div className="min-h-screen bg-background text-foreground py-7 px-4">
      <div className="max-w-md mx-auto">
        <div className="rounded-3xl bg-card border border-border overflow-hidden">
          <div className="bg-muted/40 px-5 pt-5 pb-4 text-center">
            <div className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              NightFlow
            </div>
            <div
              className={`inline-flex items-center gap-1.5 mt-2.5 text-[11px] font-bold tracking-wider uppercase rounded-full px-3 py-1 border ${
                p.cancelled
                  ? "text-red-400 bg-red-500/10 border-red-500/30"
                  : "text-brand-amber bg-amber-500/10 border-amber-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {p.cancelled ? "취소됨" : "제안"}
            </div>
            {/* 취소된 요청은 헤드라인부터 바꾼다 — "취소됨" 배지 바로 아래에
                "가능하신가요?"가 남아 있으면 모바일 첫 화면에서 그게 먼저 읽혀
                MD가 답하려다 버튼이 없어 헤맨다. */}
            <div className="text-[15px] font-bold text-foreground mt-3">
              {p.cancelled ? "취소된 요청입니다 — 답하지 않으셔도 됩니다" : "이 조건으로 가능하신가요?"}
            </div>
            {p.hostName && (
              <div className="text-[13.5px] font-bold text-foreground mt-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">담당 파트너 </span>
                {p.hostName}
              </div>
            )}
          </div>

          {/* 취소 건은 본문(일시·클럽·인원 등)을 흐리게 — 살아있는 요청과
              똑같은 진하기로 보이면 취소 사실이 눈에 안 들어온다. */}
          <div className={`px-5 py-4 ${p.cancelled ? "opacity-50" : ""}`}>
            <Row k="일시">
              <div className="text-[18px] font-bold">{fmtDateKo(p.eventDate)}</div>
            </Row>
            {p.clubName && (
              <Row k="클럽">
                <div className="text-[15px] font-semibold">{p.clubName}</div>
              </Row>
            )}
            <Row k="인원">
              <div className="text-[18px] font-bold">{p.groupSize}명</div>
            </Row>
            {p.guestName && (
              <Row k="대표자">
                <div className="text-[15px] font-semibold">{p.guestName}</div>
              </Row>
            )}
            {p.lang && p.lang !== "ko" && (
              <Row k="응대 언어">
                <div className="text-[15px] font-semibold">{LANG_LABEL[p.lang] ?? p.lang}</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">한국어 불가</div>
              </Row>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[11px] font-bold text-muted-foreground mb-1.5">
                손님이 고른 구성
              </div>
              {lines.length > 0 ? (
                <Row k="구성">
                  <ul className="space-y-0.5">
                    {lines.map((it) => (
                      <li key={it} className="text-[14.5px] text-foreground/90">
                        {it}
                      </li>
                    ))}
                  </ul>
                </Row>
              ) : (
                <Row k="구성">
                  <div className="text-[14.5px] text-muted-foreground">
                    아직 정해지지 않음 — 예산 기준으로 제안 부탁드립니다
                  </div>
                </Row>
              )}
              {amount != null && (
                <Row k="금액">
                  <div className="font-mono text-[21px] font-bold text-money tabular-nums">
                    {amount.toLocaleString()}원
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {p.selectedMenuTotal != null ? "손님이 고른 구성 합계" : "손님 희망 예산"}
                  </div>
                </Row>
              )}
              {p.selectedMenu?.table_charge && (
                <Row k="테이블차지">
                  <div className="text-[14.5px] text-foreground/90">
                    {p.selectedMenu.table_charge.amount.toLocaleString()}원 (
                    {p.selectedMenu.table_charge.basis === "weekend" ? "주말" : "평일"}) 포함
                  </div>
                </Row>
              )}
              {p.selectedMenu?.zone && (
                <Row k="존">
                  <div className="text-[14.5px] text-foreground/90">{p.selectedMenu.zone}</div>
                </Row>
              )}
              {p.guestRequest && (
                <Row k="요청">
                  <div className="text-[14.5px] text-foreground/90">{p.guestRequest}</div>
                </Row>
              )}
            </div>

            <div className="mt-4 pt-3.5 border-t border-border">
              {p.cancelled ? (
                <p className="text-[13px] text-muted-foreground">취소된 요청입니다.</p>
              ) : (
                <ResponseBox
                  proposalToken={p.proposalToken}
                  initialResponse={p.mdResponse}
                  initialTableChoosable={p.mdTableChoosable}
                  initialTableOptions={p.mdTableOptions}
                  initialRejectReason={p.mdRejectReason}
                  initialRequiredAmount={p.mdRequiredAmount}
                />
              )}
              <div className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t border-border">
                <span className="text-[11.5px] text-muted-foreground">나플 담당자</span>
                <a
                  href="tel:01022051052"
                  className="font-mono text-[15px] font-bold text-foreground tabular-nums"
                >
                  010-2205-1052
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** MD 응답 박스 — 승인/거절을 여기서 바로 누른다.
 *  이미 답한 뒤엔 결과만 보여주되, 잘못 눌렀을 수 있으니 다시 답할 길은 열어둔다. */
function ResponseBox({
  proposalToken,
  initialResponse,
  initialTableChoosable,
  initialTableOptions,
  initialRejectReason,
  initialRequiredAmount,
}: {
  proposalToken: string;
  initialResponse: string | null;
  initialTableChoosable: boolean | null;
  initialTableOptions: string | null;
  initialRejectReason: string | null;
  initialRequiredAmount: number | null;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [tableChoosable, setTableChoosable] = useState(initialTableChoosable);
  const [tableOptions, setTableOptions] = useState(initialTableOptions ?? "");
  const [rejectReason, setRejectReason] = useState(initialRejectReason);
  const [requiredAmount, setRequiredAmount] = useState(
    initialRequiredAmount ? String(initialRequiredAmount) : "",
  );
  // "idle" = 아직 뭘 누를지 고르는 중, "approve"/"reject" = 세부 입력 단계
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // API가 주는 코드는 그대로 보여주면 안 된다 — MD는 카톡으로 링크만 받고 들어온
  // 사람이라 "bad_params"를 보면 뭘 해야 할지 알 수 없다. 무엇 때문에 막혔고
  // 다음에 뭘 하면 되는지까지 한 문장으로 준다.
  const errText = (code: string) =>
    ({
      cancelled: "이미 취소된 예약입니다. 담당자에게 확인해 주세요.",
      not_found: "만료되었거나 잘못된 링크입니다. 담당자에게 다시 요청해 주세요.",
      bad_params: "입력이 올바르지 않습니다. 다시 선택해 주세요.",
      // 이 둘은 시간이 지나도 안 풀린다 — 입력을 고쳐야 하는 오류다.
      // 폴백("잠시 후 다시")으로 두면 MD가 같은 버튼만 계속 누른다.
      table_choosable_required: "테이블 선택 가능 여부를 골라주세요.",
      reason_required: "거절 사유를 골라주세요.",
      invalid_json: "전송에 실패했습니다. 다시 시도해 주세요.",
      update_failed: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      failed: "전송에 실패했습니다. 통신 상태를 확인해 주세요.",
    })[code] ?? "잠시 후 다시 시도해 주세요.";

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/proposal-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_token: proposalToken, ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "failed");
      }
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // 이미 답한 상태 — 결과 요약 + 다시 답하기
  if (response && mode === "idle") {
    const approved = response === "approved";
    return (
      <div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            approved
              ? "border-green-500/30 bg-green-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <div className={`text-[14px] font-bold ${approved ? "text-money" : "text-red-400"}`}>
            {approved ? "✅ 승인함" : "❌ 받기 어려움"}
          </div>
          {approved && (
            <div className="text-[13px] text-foreground/80 mt-1">
              {tableChoosable
                ? `손님이 테이블 선택 가능${tableOptions ? ` — ${tableOptions}` : ""}`
                : "랜덤 / 당일배정"}
            </div>
          )}
          {!approved && rejectReason && (
            <div className="text-[13px] text-foreground/80 mt-1">
              {REJECT_LABEL[rejectReason] ?? rejectReason}
              {rejectReason === "budget" && requiredAmount
                ? ` — ${Number(requiredAmount).toLocaleString()}원이면 가능`
                : ""}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setResponse(null)}
          className="mt-2 text-[12px] text-muted-foreground underline"
        >
          다시 답하기
        </button>
      </div>
    );
  }

  // 승인 — 손님이 테이블을 고를 수 있는지부터 받는다
  if (mode === "approve") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] font-bold text-foreground">
          손님이 테이블을 정할 수 있나요?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTableChoosable(true)}
            className={`h-11 rounded-xl border text-[13px] font-bold ${
              tableChoosable === true
                ? "border-money bg-green-500/15 text-money"
                : "border-border bg-card text-foreground/80"
            }`}
          >
            네 — 고를 수 있어요
          </button>
          <button
            type="button"
            onClick={() => setTableChoosable(false)}
            className={`h-11 rounded-xl border text-[13px] font-bold ${
              tableChoosable === false
                ? "border-brand-amber bg-amber-500/15 text-brand-amber"
                : "border-border bg-card text-foreground/80"
            }`}
          >
            랜덤 / 당일배정
          </button>
        </div>

        {tableChoosable === true && (
          <div>
            <label className="text-[11px] text-muted-foreground">
              고를 수 있는 자리를 적어주세요
            </label>
            <input
              value={tableOptions}
              onChange={(e) => setTableOptions(e.target.value)}
              placeholder="예) A존 3번 / B존 5번 중 선택"
              className="w-full h-11 mt-1 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
            />
          </div>
        )}

        {err && <p className="text-[12px] text-red-400">{errText(err)}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="h-11 px-4 rounded-xl border border-border text-[13px] font-bold text-muted-foreground"
          >
            뒤로
          </button>
          <button
            type="button"
            disabled={busy || tableChoosable === null}
            onClick={async () => {
              const ok = await post({
                action: "approve",
                table_choosable: tableChoosable,
                table_options: tableOptions,
              });
              if (ok) {
                setResponse("approved");
                setMode("idle");
              }
            }}
            className="flex-1 h-11 rounded-xl bg-money text-black text-[14px] font-black disabled:opacity-40"
          >
            {busy ? "보내는 중…" : "승인 보내기"}
          </button>
        </div>
        {/* 버튼이 40% 투명도로 죽어 있어도 이유가 안 보이면 "먹통이네" 하고
            나간다. tableChoosable이 초기값 null이라 첫 방문 MD는 항상 이 상태다. */}
        {tableChoosable === null && (
          <p className="text-[12px] text-muted-foreground text-center">위에서 하나를 골라주세요.</p>
        )}
      </div>
    );
  }

  // 거절 — 사유를 받고, 금액 부족이면 얼마면 되는지까지 받는다
  if (mode === "reject") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] font-bold text-foreground">받기 어려운 이유를 알려주세요</p>
        <div className="grid gap-2">
          {(["budget", "absent", "expired"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRejectReason(r)}
              className={`h-11 rounded-xl border text-[13px] font-bold ${
                rejectReason === r
                  ? "border-red-500/50 bg-red-500/15 text-red-400"
                  : "border-border bg-card text-foreground/80"
              }`}
            >
              {REJECT_LABEL[r]}
            </button>
          ))}
        </div>

        {rejectReason === "budget" && (
          <div>
            <label className="text-[11px] text-muted-foreground">얼마면 가능한가요?</label>
            <input
              inputMode="numeric"
              value={requiredAmount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setRequiredAmount(raw ? Number(raw).toLocaleString("en-US") : "");
              }}
              placeholder="예) 3,000,000"
              className="w-full h-11 mt-1 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
            />
          </div>
        )}

        {err && <p className="text-[12px] text-red-400">{errText(err)}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="h-11 px-4 rounded-xl border border-border text-[13px] font-bold text-muted-foreground"
          >
            뒤로
          </button>
          <button
            type="button"
            disabled={busy || !rejectReason}
            onClick={async () => {
              const ok = await post({
                action: "reject",
                reason: rejectReason,
                required_amount: requiredAmount
                  ? Number(requiredAmount.replace(/[^0-9]/g, ""))
                  : undefined,
              });
              if (ok) {
                setResponse("rejected");
                setMode("idle");
              }
            }}
            className="flex-1 h-11 rounded-xl bg-red-500 text-white text-[14px] font-black disabled:opacity-40"
          >
            {busy ? "보내는 중…" : "거절 보내기"}
          </button>
        </div>
      </div>
    );
  }

  // 첫 화면 — 승인 / 거절 두 갈래
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
        가능하시면 승인해주세요. 확정되면 손님에게 확정서가 발송됩니다.
      </p>
      <button
        type="button"
        onClick={() => setMode("approve")}
        className="w-full h-12 rounded-xl bg-money text-black text-[15px] font-black"
      >
        가능합니다
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="w-full h-12 rounded-xl border border-border bg-card text-[15px] font-bold text-foreground/80"
      >
        받기 어려워요
      </button>
    </div>
  );
}
