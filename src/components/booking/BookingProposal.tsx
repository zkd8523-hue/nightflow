"use client";

// MD용 제안서 — 확정서(BookingPassMd)와 같은 레이아웃을 쓰되, 아직 합의 전이라
// "제안" 상태로 보여준다. 자리·확정가가 없고 체크인·도착 신호도 없다.
//
// 손님이 고른 술은 selected_menu 스냅샷에서 그대로 뽑는다 — 운영자가 옮겨 적지 않는다.
// MD가 여기서 바로 승인/거절하면 /api/proposal-response로 저장되고 운영자에게 SMS가 간다.

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MenuPhotosOverlay } from "@/components/booking/MenuPhotosOverlay";
import { SeatPicker } from "@/components/booking/SeatPicker";
import { seatValueLabel, seatsOfValue, type SeatZone } from "@/lib/booking/seats";
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
  other: "직접 입력",
};

type Props = {
  proposalToken: string;
  mdResponse: string | null;
  mdTableChoosable: boolean | null;
  mdTableOptions: string | null;
  mdRejectReason: string | null;
  mdRequiredAmount: number | null;
  /** 주류 제안 요청에 MD가 승인하며 적은 추천 구성(Migration 676) */
  mdProposedItems: string | null;
  /** 거절 사유 직접 입력 문장(Migration 677) */
  mdRejectNote: string | null;
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
  /** 담당 MD 본인이 로그인해 연 경우에만 — 파트너 페이지 예약관리로 돌아가는 링크 */
  backHref?: string | null;
  /** 확정서가 나왔으면 MD용 확정서 링크 */
  confirmHref?: string | null;
  /** 클럽 주대(메뉴판) 사진 — 주류 제안 요청에서 구성을 적을 때 "메뉴판 보기"로 연다 */
  menuUrls?: string[];
  /** 클럽 테이블맵 · 자리 목록(Migration 704) — 자리 고르기 */
  floorPlanUrls?: string[];
  seatZones?: SeatZone[];
  mdSeats?: string[];
  mdBumpRisk?: boolean | null;
  mdConditions?: string | null;
  /** 손님이 자리를 고르고 담당자 재확인을 기다리는 중이면 고른 값(md_reconfirm_state=pending) */
  pendingGuestChoice?: string | null;
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
  // 주류 제안(MD 추천) — 손님이 메뉴를 안 고르고 예산만 정해 "클럽이 세트를 제안"해 달라고 한 요청.
  const isRecommend = !!p.selectedMenu?.md_recommend;
  // 손님이 메뉴를 고른 요청은 그 합계가, 메뉴 없는 클럽이면 희망 예산이 기준 금액이다.
  const amount = p.selectedMenuTotal ?? p.budget;

  return (
    <div className="min-h-screen bg-background text-foreground py-7 px-4">
      <div className="max-w-md mx-auto">
        {/* 앱에서 푸시·예약관리로 들어온 담당 MD만 — 이 화면엔 하단 탭이 없어 돌아갈 길이 필요하다. */}
        {p.backHref && (
          <Link
            href={p.backHref}
            className="inline-flex items-center gap-0.5 mb-3 mt-[env(safe-area-inset-top)] text-[13px] font-bold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            예약관리
          </Link>
        )}
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
                {isRecommend ? "손님 요청 — 예산에 맞춰 구성 제안" : "손님이 고른 구성"}
              </div>
              {/* 주류 제안 요청은 금액이 먼저다 — 파트너가 그 금액을 보고 구성을 짠다(2026-09-30).
                  이때 금액 밑 "손님 예산" 설명은 뺀다. 손님이 직접 고른 요청은 구성 → 합계 순. */}
              {isRecommend && amount != null && (
                <Row k="금액">
                  <div className="font-mono text-[21px] font-bold text-money tabular-nums">
                    {amount.toLocaleString()}원
                  </div>
                </Row>
              )}
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
                  {isRecommend ? (
                    <div className="break-keep">
                      <div className="text-[14.5px] font-bold text-brand-amber">구성 제안 요청</div>
                      <div className="text-[13.5px] text-foreground/85 mt-0.5 leading-snug">
                        술은 금액 안에서 구성을 적은 다음 예약 승인 버튼을 눌러주세요.
                      </div>
                    </div>
                  ) : (
                    <div className="text-[14.5px] text-muted-foreground">
                      아직 정해지지 않음 — 예산 기준으로 제안 부탁드립니다
                    </div>
                  )}
                </Row>
              )}
              {!isRecommend && amount != null && (
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
                p.pendingGuestChoice ? (
                <ReconfirmBox
                  proposalToken={p.proposalToken}
                  choiceLabel={seatValueLabel(p.seatZones ?? [], p.pendingGuestChoice, true)}
                  choiceSeats={seatsOfValue(p.seatZones ?? [], p.pendingGuestChoice)}
                  amount={amount}
                  seatZones={p.seatZones ?? []}
                  floorPlanUrls={p.floorPlanUrls ?? []}
                  menuUrls={p.menuUrls ?? []}
                  clubName={p.clubName}
                />
                ) : (
                <ResponseBox
                  proposalToken={p.proposalToken}
                  initialResponse={p.mdResponse}
                  initialTableChoosable={p.mdTableChoosable}
                  initialTableOptions={p.mdTableOptions}
                  initialRejectReason={p.mdRejectReason}
                  initialRequiredAmount={p.mdRequiredAmount}
                  initialProposedItems={p.mdProposedItems}
                  initialRejectNote={p.mdRejectNote}
                  isRecommend={isRecommend}
                  budget={amount}
                  menuUrls={p.menuUrls ?? []}
                  clubName={p.clubName}
                  confirmHref={p.confirmHref ?? null}
                  initialSeats={p.mdSeats ?? []}
                  initialBumpRisk={p.mdBumpRisk ?? null}
                  initialConditions={p.mdConditions ?? null}
                  floorPlanUrls={p.floorPlanUrls ?? []}
                  seatZones={p.seatZones ?? []}
                />
                )
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

/** 담당자 응답 박스(2026-11-01 개편) — "예약 가능해요" / "받기 어려워요".
 *  예약 가능: 손님이 자리를 고를 수 있으면 자리 목록(구역 전체·일부)에서 고르고, 밀릴 수 있는지 O/X는 필수.
 *  받기 어려워요: 사유 + 금액 부족이면 필요 금액과 "이 조건이면 가능해요".
 *  답한 뒤엔 다음 절차 두 줄만 — 방금 적은 걸 다시 보여줄 필요가 없다. 잘못 눌렀으면 "다시 답하기". */
function ResponseBox({
  proposalToken,
  initialResponse,
  initialTableChoosable,
  initialTableOptions,
  initialRejectReason,
  initialRequiredAmount,
  initialProposedItems,
  initialRejectNote,
  initialSeats,
  initialBumpRisk,
  initialConditions,
  isRecommend,
  budget,
  menuUrls,
  floorPlanUrls,
  seatZones,
  clubName,
  confirmHref,
}: {
  proposalToken: string;
  confirmHref: string | null;
  initialResponse: string | null;
  initialTableChoosable: boolean | null;
  initialTableOptions: string | null;
  initialRejectReason: string | null;
  initialRequiredAmount: number | null;
  initialProposedItems: string | null;
  initialRejectNote: string | null;
  initialSeats: string[];
  initialBumpRisk: boolean | null;
  initialConditions: string | null;
  isRecommend: boolean;
  budget: number | null;
  menuUrls: string[];
  floorPlanUrls: string[];
  seatZones: SeatZone[];
  clubName: string | null;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [tableChoosable, setTableChoosable] = useState(initialTableChoosable);
  const [tableOptions, setTableOptions] = useState(initialTableOptions ?? "");
  const [seats, setSeats] = useState<string[]>(initialSeats);
  const [bumpRisk, setBumpRisk] = useState<boolean | null>(initialBumpRisk);
  const [rejectReason, setRejectReason] = useState(initialRejectReason);
  const [requiredAmount, setRequiredAmount] = useState(
    initialRequiredAmount ? Number(initialRequiredAmount).toLocaleString("en-US") : "",
  );
  const [conditions, setConditions] = useState(initialConditions ?? "");
  const [proposedItems, setProposedItems] = useState(initialProposedItems ?? "");
  // 주류 제안 요청은 구성을 적어야 승인할 수 있다(서버도 같은 조건으로 막는다).
  const itemsMissing = isRecommend && !proposedItems.trim();
  const itemsRef = useRef<HTMLTextAreaElement>(null);
  const [rejectNote, setRejectNote] = useState(initialRejectNote ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasZones = seatZones.length > 0;

  // API 코드는 그대로 보여주면 안 된다 — 무엇 때문에 막혔고 뭘 하면 되는지 한 문장으로.
  const errText = (code: string) =>
    ({
      cancelled: "이미 취소된 예약입니다. 담당자에게 확인해 주세요.",
      not_found: "만료되었거나 잘못된 링크입니다. 담당자에게 다시 요청해 주세요.",
      bad_params: "입력이 올바르지 않습니다. 다시 선택해 주세요.",
      table_choosable_required: "손님이 자리를 고를 수 있는지 골라주세요.",
      seats_required: "고를 수 있는 자리를 하나 이상 골라주세요.",
      bump_risk_required: "밀릴 수 있는지 O / X를 골라주세요.",
      reason_required: "받기 어려운 이유를 골라주세요.",
      proposed_items_required: "예산 안에서 드릴 구성을 적어주세요.",
      reason_text_required: "받기 어려운 이유를 적어주세요.",
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

  // 주류 제안 요청의 구성 입력칸 — 첫 화면부터 보여준다(2026-09-30).
  const itemsInput = isRecommend ? (
    <div>
      <p className="text-[13px] font-bold text-foreground">
        {budget ? `${budget.toLocaleString()}원 안에서 ` : ""}어떤 구성으로 드릴까요?
      </p>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-[11.5px] text-muted-foreground">한 줄에 하나씩 · 손님에게 그대로 전달돼요</p>
        {menuUrls.length > 0 && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="shrink-0 flex items-center text-[12.5px] font-bold text-brand-amber"
          >
            메뉴판 보기
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <textarea
        ref={itemsRef}
        value={proposedItems}
        onChange={(e) => {
          setProposedItems(e.target.value);
          if (err === "proposed_items_required") setErr(null);
        }}
        rows={3}
        placeholder={"예) 돔페리뇽 1\n잭다니엘 2\n과일·믹서 포함"}
        className={`w-full mt-1.5 px-3 py-2.5 rounded-xl bg-card border text-[14px] text-foreground outline-none focus:border-amber-500 resize-none ${
          err === "proposed_items_required" ? "border-red-500/60" : "border-amber-500/40"
        }`}
      />
      {menuOpen && (
        <MenuPhotosOverlay urls={menuUrls} clubName={clubName} onClose={() => setMenuOpen(false)} />
      )}
    </div>
  ) : null;

  const backBtn = (
    <button
      type="button"
      onClick={() => setMode("idle")}
      className="h-12 px-4 rounded-xl border border-border text-[13px] font-bold text-muted-foreground"
    >
      뒤로
    </button>
  );

  // 답한 뒤 — 다음 절차 두 줄만(2026-11-01 사용자 결정).
  if (response && mode === "idle") {
    return (
      <div>
        {confirmHref ? (
          <Link
            href={confirmHref}
            className="flex items-center justify-center w-full h-12 rounded-xl bg-white text-black text-[15px] font-black"
          >
            예약 확인서 보기
          </Link>
        ) : (
          <p className="text-[15px] font-bold text-foreground leading-relaxed">
            해당 사항을 고객에게 전달 후<br />
            {response === "approved" ? "예약 확인서를 전달해드리겠습니다." : "다시 연락드리겠습니다."}
          </p>
        )}
        <button
          type="button"
          onClick={() => setResponse(null)}
          className="text-[12px] text-muted-foreground underline mt-4"
        >
          다시 답하기
        </button>
      </div>
    );
  }

  // 예약 가능해요
  if (mode === "approve") {
    const seatsMissing = tableChoosable === true && (hasZones ? seats.length === 0 : !tableOptions.trim());
    const blocker = itemsMissing
      ? "드릴 구성을 적어주세요."
      : tableChoosable === null
      ? "손님이 자리를 고를 수 있는지 골라주세요."
      : seatsMissing
      ? "고를 수 있는 자리를 하나 이상 골라주세요."
      : bumpRisk === null
      ? "밀릴 수 있는지 O / X를 골라주세요."
      : null;
    return (
      <div className="space-y-3">
        {itemsInput}
        <p className="text-[13px] font-bold text-foreground">손님이 자리를 고를 수 있나요?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTableChoosable(true)}
            className={`h-11 rounded-xl border text-[13px] font-bold ${
              tableChoosable === true ? "border-money bg-green-500/15 text-money" : "border-border bg-card text-foreground/80"
            }`}
          >
            네, 고를 수 있어요
          </button>
          <button
            type="button"
            onClick={() => setTableChoosable(false)}
            className={`h-11 rounded-xl border text-[13px] font-bold ${
              tableChoosable === false ? "border-money bg-green-500/15 text-money" : "border-border bg-card text-foreground/80"
            }`}
          >
            당일 배정
          </button>
        </div>

        {tableChoosable === true && (
          <div>
            <p className="text-[13px] font-bold text-foreground mb-1.5">
              어디 중에서 고를 수 있나요? <span className="text-[11px] font-semibold text-muted-foreground">필수</span>
            </p>
            {hasZones ? (
              <SeatPicker zones={seatZones} selected={seats} onChange={setSeats} floorPlanUrls={floorPlanUrls} />
            ) : (
              <input
                value={tableOptions}
                onChange={(e) => setTableOptions(e.target.value)}
                placeholder="예) A존 3번 / B존 5번"
                className="w-full h-11 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
              />
            )}
          </div>
        )}

        <div>
          <p className="text-[13px] font-bold text-foreground">
            더 높은 금액 손님이 오면 이 자리가 밀릴 수 있나요?{" "}
            <span className="text-[11px] font-semibold text-muted-foreground">필수</span>
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => setBumpRisk(true)}
              className={`h-11 rounded-xl border text-[13px] font-bold ${
                bumpRisk === true ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border bg-card text-foreground/80"
              }`}
            >
              O 밀릴 수 있어요
            </button>
            <button
              type="button"
              onClick={() => setBumpRisk(false)}
              className={`h-11 rounded-xl border text-[13px] font-bold ${
                bumpRisk === false ? "border-money bg-green-500/15 text-money" : "border-border bg-card text-foreground/80"
              }`}
            >
              X 안 밀려요
            </button>
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-1">O를 고르면 손님 예약 확인서에 안내가 붙어요</p>
        </div>

        {err && <p className="text-[12px] text-red-400">{errText(err)}</p>}

        <div className="flex gap-2">
          {backBtn}
          <button
            type="button"
            disabled={busy || !!blocker}
            onClick={async () => {
              const ok = await post({
                action: "approve",
                table_choosable: tableChoosable,
                seats: tableChoosable && hasZones ? seats : undefined,
                table_options: tableChoosable && !hasZones ? tableOptions : undefined,
                bump_risk: bumpRisk,
                proposed_items: proposedItems.trim() || undefined,
              });
              if (ok) {
                setResponse("approved");
                setMode("idle");
              }
            }}
            className="flex-1 h-12 rounded-xl bg-money text-black text-[15px] font-black disabled:opacity-40"
          >
            {busy ? "보내는 중…" : "답변 완료"}
          </button>
        </div>
        {blocker && <p className="text-[12px] text-muted-foreground text-center">{blocker}</p>}
      </div>
    );
  }

  // 받기 어려워요
  if (mode === "reject") {
    return (
      <div className="space-y-3">
        <p className="text-[13px] font-bold text-foreground">받기 어려운 이유를 알려주세요</p>
        <div className="grid grid-cols-2 gap-2">
          {(["budget", "absent", "expired", "other"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRejectReason(r)}
              className={`h-11 rounded-xl border text-[13px] font-bold ${
                rejectReason === r
                  ? "border-amber-500 bg-amber-500/15 text-brand-amber"
                  : "border-border bg-card text-foreground/80"
              }`}
            >
              {REJECT_LABEL[r]}
            </button>
          ))}
        </div>

        {rejectReason === "other" && (
          <div>
            <label className="text-[11px] text-muted-foreground">받기 어려운 이유</label>
            <input
              autoFocus
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              maxLength={200}
              placeholder="예) 그날 단체석이 다 찼어요"
              className="w-full h-11 mt-1 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
            />
          </div>
        )}

        {rejectReason === "budget" && (
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] text-muted-foreground">얼마부터 가능한가요?</label>
              <input
                inputMode="numeric"
                value={requiredAmount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setRequiredAmount(raw ? Number(raw).toLocaleString("en-US") : "");
                }}
                placeholder="예) 1,400,000"
                className="w-full h-11 mt-1 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">이 조건이면 가능해요 (선택 · 한 줄에 하나씩)</label>
                {menuUrls.length > 0 && (
                  <button type="button" onClick={() => setMenuOpen(true)} className="flex items-center text-[12px] font-bold text-brand-amber">
                    메뉴판 보기
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                rows={3}
                placeholder={"예) 힙합존 4병 140만\nEDM존 5병 200만"}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-card border border-amber-500/40 text-[14px] text-foreground outline-none focus:border-amber-500 resize-none"
              />
              {menuOpen && <MenuPhotosOverlay urls={menuUrls} clubName={clubName} onClose={() => setMenuOpen(false)} />}
            </div>
          </div>
        )}

        {err && <p className="text-[12px] text-red-400">{errText(err)}</p>}

        <div className="flex gap-2">
          {backBtn}
          <button
            type="button"
            disabled={busy || !rejectReason || (rejectReason === "other" && !rejectNote.trim())}
            onClick={async () => {
              const ok = await post({
                action: "reject",
                reason: rejectReason,
                reason_text: rejectReason === "other" ? rejectNote.trim() : undefined,
                required_amount: requiredAmount ? Number(requiredAmount.replace(/[^0-9]/g, "")) : undefined,
                conditions: rejectReason === "budget" ? conditions.trim() || undefined : undefined,
              });
              if (ok) {
                setResponse("rejected");
                setMode("idle");
              }
            }}
            className="flex-1 h-12 rounded-xl bg-white text-black text-[15px] font-black disabled:opacity-40"
          >
            {busy ? "보내는 중…" : "답변 완료"}
          </button>
        </div>
      </div>
    );
  }

  // 첫 화면 — 예약 가능해요 / 받기 어려워요
  return (
    <div className="space-y-2">
      {itemsInput && <div className="pb-2">{itemsInput}</div>}
      {err === "proposed_items_required" && <p className="text-[12px] text-red-400">{errText(err)}</p>}
      <button
        type="button"
        onClick={() => {
          if (itemsMissing) {
            setErr("proposed_items_required");
            itemsRef.current?.focus();
            return;
          }
          setMode("approve");
        }}
        className="w-full h-12 rounded-xl bg-money text-black text-[15px] font-black"
      >
        예약 가능해요
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

/** 손님이 자리를 고른 뒤 담당자 재확인(2026-11-01) — "이 자리 지금도 되나요?"
 *  네 → 예약 확인서가 자동으로 나간다. 안 돼요 → 대신 가능한 자리 / 다른 조건 / 대신 가능한 자리도 없음. */
function ReconfirmBox({
  proposalToken,
  choiceLabel,
  choiceSeats,
  amount,
  seatZones,
  floorPlanUrls,
  menuUrls,
  clubName,
}: {
  proposalToken: string;
  choiceLabel: string;
  choiceSeats: string[];
  amount: number | null;
  seatZones: SeatZone[];
  floorPlanUrls: string[];
  menuUrls: string[];
  clubName: string | null;
}) {
  const [step, setStep] = useState<"ask" | "no" | "done">("ask");
  const [doneText, setDoneText] = useState("");
  const [alt, setAlt] = useState<string[]>([]);
  const [condOpen, setCondOpen] = useState(false);
  const [cond, setCond] = useState("");
  const [condAmount, setCondAmount] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (payload: Record<string, unknown>, after: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/md-reconfirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_token: proposalToken, ...payload }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
      setDoneText(after);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return <p className="text-[15px] font-bold text-foreground leading-relaxed whitespace-pre-line">{doneText}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3">
        <p className="text-[11.5px] font-bold text-muted-foreground">손님이 고른 자리</p>
        <p className="text-[18px] font-black text-brand-amber mt-0.5">{choiceLabel}</p>
        {amount != null && <p className="text-[12.5px] text-foreground/80 mt-0.5">{amount.toLocaleString()}원</p>}
      </div>

      {step === "ask" && (
        <>
          <p className="text-[14px] font-black text-foreground">이 자리 지금도 되나요?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ action: "yes" }, "예약 확인서가 손님과 담당자님께 발송됐어요.")}
              className="h-12 rounded-xl bg-money text-black text-[15px] font-black disabled:opacity-40"
            >
              {busy ? "보내는 중…" : "네, 가능해요"}
            </button>
            <button
              type="button"
              onClick={() => setStep("no")}
              className="h-12 rounded-xl border border-border bg-card text-[15px] font-bold text-foreground/80"
            >
              안 돼요
            </button>
          </div>
        </>
      )}

      {step === "no" && (
        <>
          <p className="text-[14px] font-black text-foreground">
            {choiceLabel}은 안 되는군요.
            <br />
            대신 가능한 자리가 있나요?
          </p>
          {seatZones.length > 0 && (
            <SeatPicker zones={seatZones} selected={alt} onChange={setAlt} floorPlanUrls={floorPlanUrls} disabled={choiceSeats} />
          )}
          <button
            type="button"
            disabled={busy || alt.length === 0}
            onClick={() => send({ action: "alt", seats: alt }, "대신 가능한 자리로 손님에게 다시 안내했어요.\n손님이 고르면 다시 알려드릴게요.")}
            className="w-full h-12 rounded-xl bg-money text-black text-[15px] font-black disabled:opacity-40"
          >
            이 자리로 손님에게 다시 안내
          </button>

          <button
            type="button"
            onClick={() => setCondOpen((v) => !v)}
            className="w-full h-12 rounded-xl border border-amber-500 text-brand-amber text-[14px] font-bold"
          >
            다른 조건이면 돼요 {condOpen ? "▴" : "▾"}
          </button>
          {condOpen && (
            <div className="rounded-xl border border-dashed border-amber-500/60 p-3 space-y-2.5">
              <div>
                <label className="text-[11px] text-muted-foreground">얼마부터 가능한가요?</label>
                <input
                  inputMode="numeric"
                  value={condAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    setCondAmount(raw ? Number(raw).toLocaleString("en-US") : "");
                  }}
                  placeholder="예) 2,000,000"
                  className="w-full h-11 mt-1 px-3 rounded-xl bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground">이 조건이면 가능해요 (한 줄에 하나씩)</label>
                  {menuUrls.length > 0 && (
                    <button type="button" onClick={() => setMenuOpen(true)} className="flex items-center text-[12px] font-bold text-brand-amber">
                      메뉴판 보기
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <textarea
                  value={cond}
                  onChange={(e) => setCond(e.target.value)}
                  rows={2}
                  placeholder="예) EDM존 5병 200만"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-card border border-amber-500/40 text-[14px] text-foreground outline-none focus:border-amber-500 resize-none"
                />
              </div>
              <button
                type="button"
                disabled={busy || !condAmount}
                onClick={() =>
                  send(
                    { action: "condition", amount: Number(condAmount.replace(/[^0-9]/g, "")), conditions: cond.trim() || undefined },
                    "이 조건으로 손님에게 안내했어요.\n손님이 진행하면 다시 알려드릴게요.",
                  )
                }
                className="w-full h-11 rounded-xl bg-white text-black text-[14px] font-black disabled:opacity-40"
              >
                이 조건으로 손님에게 안내
              </button>
              {menuOpen && <MenuPhotosOverlay urls={menuUrls} clubName={clubName} onClose={() => setMenuOpen(false)} />}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => send({ action: "none" }, "나플 담당자에게 전달했어요.\n손님에게는 나플에서 연락드릴게요.")}
            className="w-full h-12 rounded-xl border border-border bg-card text-[14px] font-bold text-foreground/80 disabled:opacity-40"
          >
            대신 가능한 자리도 없어요
          </button>
        </>
      )}
      {err && <p className="text-[12px] text-red-400">전송에 실패했어요. 잠시 후 다시 시도해 주세요.</p>}
    </div>
  );
}
