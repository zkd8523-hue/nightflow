"use client";

// MD용 확정서. 손님용과 보여주는 정보가 다르다 —
// 금액·준비 내역·응대 언어를 보여주고, 손님 연락처는 넘기지 않는다.

import { useState } from "react";
import Link from "next/link";
import { Check, Phone, ChevronLeft } from "lucide-react";

const LANG_LABEL: Record<string, string> = {
  en: "English",
  ja: "일본어",
  zh: "중국어(간체)",
  "zh-tw": "중국어(번체)",
  ko: "한국어",
};

type Props = {
  requestId: string;
  refNo: string;
  guestName: string | null;
  eventDate: string;
  groupSize: number | string;
  cancelled: boolean;
  lang: string | null;
  clubName: string | null;
  tableInfo: string | null;
  includes: string[];
  totalPrice: number | null;
  guestRequest: string | null;
  /** 도착 예정 시각(자유 표기 "23:00") */
  arrivalTime?: string | null;
  hostName: string | null;
  arrivedPings: string[];
  /** 담당 MD 본인이 로그인해 연 경우에만 — 파트너 페이지 예약관리로 돌아가는 링크 */
  backHref?: string | null;
  mdToken: string;
  checkedInAt: string | null;
  /** 밀림 처리 상태(booking_confirmations.bump_state) — pending이면 손님 답을 기다리는 중 */
  bumpState?: string | null;
  bumpAmount?: number | null;
  /** 외국인 요청만 — 손님에게 메일로 유지/취소를 물을 수 있다 */
  canBump?: boolean;
};

function fmtDateKo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

export function BookingPassMd(p: Props) {
  // 손님이 실제로 "I'm here"를 보낸 적 있는지 — 없는데 체크인하면 서버가 경고
  // SMS를 관리자+MD에게 보낸다(허위/실수 클릭 방지용 로그, 차단은 아니다).
  const hasArrivedPing = p.arrivedPings.includes("arrived");
  const [step, setStep] = useState<"idle" | "confirm" | "done">(
    p.checkedInAt ? "done" : "idle"
  );
  const [busy, setBusy] = useState(false);
  const [warned, setWarned] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  // 파트너 쪽 예약 취소(2026-09-30) — 예전엔 클럽이 확정된 예약을 취소할 방법이 없었다.
  const [cancelStep, setCancelStep] = useState<"idle" | "confirm">("idle");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelledNow, setCancelledNow] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const isCancelled = p.cancelled || cancelledNow;

  // 밀릴 것 같아요(2026-11-01) — 더 높은 금액 손님이 와서 이 자리가 밀리게 됐을 때. 취소가 아니라
  // 손님에게 "이 금액이면 유지"를 먼저 묻는다(손님에게 약속한 "먼저 알리고 기회를 준다").
  const [bumpStep, setBumpStep] = useState<"idle" | "form" | "sent">(p.bumpState === "pending" ? "sent" : "idle");
  const [bumpAmt, setBumpAmt] = useState("");
  const [bumpItems, setBumpItems] = useState("");
  const [bumpHours, setBumpHours] = useState<"0.5" | "1" | "2" | "evening">("1");
  const [bumpErr, setBumpErr] = useState<string | null>(null);
  const doBump = async () => {
    const amount = Number(bumpAmt.replace(/[^0-9]/g, ""));
    if (!amount) return setBumpErr("유지하려면 필요한 총액을 적어주세요.");
    setBusy(true);
    setBumpErr(null);
    try {
      const res = await fetch("/api/md-bump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md_token: p.mdToken, amount, items: bumpItems.trim() || undefined, within: bumpHours }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setBumpStep("sent");
      else setBumpErr(j.error === "no_guest_channel" ? "손님 메일 주소가 없어요. 나플 담당자에게 연락해 주세요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch {
      setBumpErr("보내지 못했어요. 통신 상태를 확인해 주세요.");
    }
    setBusy(false);
  };

  const doCancel = async () => {
    if (!cancelReason.trim()) return setCancelErr("취소 사유를 적어주세요.");
    setBusy(true);
    setCancelErr(null);
    try {
      const res = await fetch("/api/booking-md-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md_token: p.mdToken, reason: cancelReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCancelledNow(true);
        setCancelStep("idle");
      } else {
        setCancelErr(
          json.error === "already_arrived"
            ? "손님이 이미 도착했거나 입장한 예약이라 취소할 수 없어요. 나플 담당자에게 연락해 주세요."
            : "취소하지 못했어요. 잠시 후 다시 시도해 주세요."
        );
      }
    } catch {
      setCancelErr("취소하지 못했어요. 통신 상태를 확인해 주세요.");
    }
    setBusy(false);
  };

  const doCheckin = async () => {
    setBusy(true);
    setCheckErr(null);
    try {
      const res = await fetch("/api/md-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin", md_token: p.mdToken }),
      });
      if (res.ok) {
        const json = await res.json();
        setWarned(!!json.warned);
        setStep("done");
      } else {
        setCheckErr("Could not save. Please try again.");
      }
    } catch {
      setCheckErr("Could not save. Please try again.");
    }
    setBusy(false);
  };

  const doUndo = async () => {
    setBusy(true);
    try {
      await fetch("/api/md-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo", md_token: p.mdToken }),
      });
    } catch {
      // 실패해도 로컬은 되돌린다 — 어차피 다시 체크인하면 서버 상태도 맞춰진다.
    }
    setStep("idle");
    setWarned(false);
    setBusy(false);
  };

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex gap-3 py-2.5 border-t border-border/60 first:border-t-0">
      <div className="shrink-0 w-[72px] text-[11px] font-semibold text-muted-foreground pt-0.5">
        {k}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );

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
            {/* 상태 배지는 취소일 때만 — 평소엔 "Booking details/예약 확인"이라 정보가 없었다(2026-11-01). */}
            {isCancelled && (
              <div
                className="inline-flex items-center gap-1.5 mt-2.5 text-[11px] font-bold tracking-wider uppercase rounded-full px-3 py-1 border text-red-400 bg-red-500/10 border-red-500/30"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                취소됨
              </div>
            )}
            <div className="font-mono font-bold text-[34px] tracking-wide text-brand-amber mt-3 tabular-nums">
              {p.refNo}
            </div>
            {p.hostName && (
              <div className="text-[13.5px] font-bold text-foreground mt-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">담당 파트너 </span>
                {p.hostName}
              </div>
            )}
          </div>

          <div className="px-5 py-4">
            <Row k="일시">
              <div className="text-[18px] font-bold">{fmtDateKo(p.eventDate)}</div>
            </Row>
            {p.arrivalTime && (
              <Row k="도착 예정">
                <div className="text-[18px] font-bold">{p.arrivalTime}</div>
              </Row>
            )}
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
                <div className="text-[15px] font-semibold">
                  {LANG_LABEL[p.lang] ?? p.lang}
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">한국어 불가</div>
              </Row>
            )}

            {/* "준비" 소제목은 뺐다(2026-11-01) — 아래 네 줄이 다 비면 제목만 남아 빈 섹션처럼 보였다.
                구분선 묶음도 내용이 하나라도 있을 때만 그린다. */}
            {(p.tableInfo || p.includes.length > 0 || p.totalPrice != null || p.guestRequest) && (
            <div className="mt-4 pt-3 border-t border-border">
              {p.tableInfo && (
                <Row k="자리">
                  <div className="text-[15px] font-semibold">{p.tableInfo}</div>
                </Row>
              )}
              {p.includes.length > 0 && (
                <Row k="구성">
                  <ul className="space-y-0.5">
                    {p.includes.map((it) => (
                      <li key={it} className="text-[14.5px] text-foreground/90">
                        {it}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
              {p.totalPrice != null && (
                <Row k="금액">
                  <div className="font-mono text-[21px] font-bold text-money tabular-nums">
                    {p.totalPrice.toLocaleString()}원
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    현장에서 직접 결제
                  </div>
                </Row>
              )}
              {p.guestRequest && (
                <Row k="요청">
                  <div className="text-[14.5px] text-foreground/90">{p.guestRequest}</div>
                </Row>
              )}
            </div>
            )}

            {/* 도착 알림 안내 — 담당자가 처음 받는 문자에 놀라지 않게, 운영자가 매번 설명하지 않게(2026-11-01).
                손님이 이미 신호를 보냈거나 취소된 예약엔 안 보인다. */}
            {!isCancelled && p.arrivedPings.length === 0 && !p.checkedInAt && (
              <div className="mt-4 rounded-xl border border-sky-400/40 bg-sky-400/[0.08] px-4 py-3">
                <div className="text-[13.5px] font-black text-foreground">📲 손님 도착 알림</div>
                <ol className="mt-1.5 space-y-0.5 text-[12.5px] text-foreground/80 leading-relaxed list-decimal pl-4">
                  <li>손님이 도착 10분 전과 도착했을 때 버튼을 누르면 이 번호로 문자가 와요.</li>
                  <li>문자를 받으면 입구로 마중 나가주세요.</li>
                  <li>입장시킨 뒤 아래 &quot;입장 완료&quot;를 눌러주세요.</li>
                </ol>
              </div>
            )}

            {/* 도착 신호 — 손님이 누르면 여기 표시된다 */}
            {p.arrivedPings.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
                <div className="text-[13px] font-bold text-brand-amber">
                  {p.arrivedPings.includes("arrived")
                    ? "🎉 손님이 도착했습니다"
                    : "🚗 손님이 곧 도착합니다"}
                </div>
              </div>
            )}

            {isCancelled && (
              <p className="mt-4 pt-3.5 border-t border-border text-[13px] text-muted-foreground">
                취소된 예약입니다. 손님과 나플 담당자에게 알림이 갔어요.
              </p>
            )}

            {!isCancelled && (
              <div className="mt-4 pt-3.5 border-t border-border">
                {step === "done" ? (
                  <div
                    className={`flex items-center gap-2 h-12 rounded-xl border px-4 ${
                      warned
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-green-500/10 border-green-500/30"
                    }`}
                  >
                    <Check className={`w-4 h-4 shrink-0 ${warned ? "text-brand-amber" : "text-money"}`} />
                    <span className={`text-[13.5px] font-bold ${warned ? "text-brand-amber" : "text-money"}`}>
                      {warned ? "입장 완료 (도착 신호 없음 · 운영자 확인중)" : "입장 완료"}
                    </span>
                    <button
                      onClick={doUndo}
                      disabled={busy}
                      className="ml-auto h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                ) : step === "confirm" ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
                    <p className="text-[13px] leading-relaxed text-foreground/90 mb-3">
                      입장 완료를 누르시면 나이트플로우에 기록돼요.
                      확인하셨나요?
                      {!hasArrivedPing && (
                        <span className="block mt-1.5 text-brand-amber font-semibold">
                          ⚠️ 아직 손님의 도착 신호가 없어요 — 그래도 처리하면 운영자에게 확인 문자가 갑니다.
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={doCheckin}
                        disabled={busy}
                        className="flex-1 h-11 rounded-lg bg-money text-black text-[13.5px] font-bold disabled:opacity-50"
                      >
                        {busy ? "처리 중…" : "네, 입장했어요"}
                      </button>
                      <button
                        onClick={() => setStep("idle")}
                        disabled={busy}
                        className="w-[88px] h-11 rounded-lg border border-border text-[13.5px] font-bold text-muted-foreground disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                    {checkErr && <p className="text-[12px] text-red-400 mt-2">{checkErr}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setStep("confirm")}
                    className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground text-[14.5px] font-bold"
                  >
                    입장 완료
                  </button>
                )}

                {/* 자리가 밀릴 것 같아요 — 외국인 요청만(손님 메일로 유지/취소를 묻는다). 입장 전까지. */}
                {p.canBump && step !== "done" && (
                  bumpStep === "sent" ? (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
                      <p className="text-[13px] font-bold text-foreground">손님에게 물어봤어요{p.bumpAmount ? ` · ${p.bumpAmount.toLocaleString()}원` : ""}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">손님이 답하면 알려드릴게요. 유지하면 예약 확인서가 자동으로 바뀌어요.</p>
                    </div>
                  ) : bumpStep === "form" ? (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5 space-y-2.5">
                      <p className="text-[13px] font-bold text-foreground">자리를 유지하려면 얼마가 필요한가요?</p>
                      <input
                        inputMode="numeric"
                        value={bumpAmt}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, "");
                          setBumpAmt(raw ? Number(raw).toLocaleString("en-US") : "");
                        }}
                        placeholder="총액 예) 1,750,000"
                        className="w-full h-11 px-3 rounded-lg bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500"
                      />
                      <textarea
                        value={bumpItems}
                        onChange={(e) => setBumpItems(e.target.value)}
                        rows={2}
                        placeholder={"바뀌는 구성 (선택, 한 줄에 하나씩)\n예) 샴페인 5병"}
                        className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-[14px] text-foreground outline-none focus:border-amber-500 resize-none"
                      />
                      <div>
                        <p className="text-[11.5px] text-muted-foreground mb-1">손님이 언제까지 답해야 하나요?</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {([["0.5", "30분"], ["1", "1시간"], ["2", "2시간"], ["evening", "영업 전"]] as const).map(([k, label]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setBumpHours(k)}
                              className={`h-9 rounded-lg border text-[12.5px] font-bold ${bumpHours === k ? "border-amber-500 bg-amber-500/15 text-brand-amber" : "border-border text-foreground/80"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={doBump} disabled={busy || !bumpAmt} className="flex-1 h-11 rounded-lg bg-amber-500 text-black text-[13.5px] font-bold disabled:opacity-40">
                          {busy ? "보내는 중…" : "손님에게 물어보기"}
                        </button>
                        <button onClick={() => { setBumpStep("idle"); setBumpErr(null); }} disabled={busy} className="w-[88px] h-11 rounded-lg border border-border text-[13.5px] font-bold text-muted-foreground disabled:opacity-50">
                          닫기
                        </button>
                      </div>
                      {bumpErr && <p className="text-[12px] text-red-400">{bumpErr}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => setBumpStep("form")}
                      className="w-full h-11 mt-3 rounded-xl border border-amber-500/40 text-brand-amber text-[13.5px] font-bold"
                    >
                      자리가 밀릴 것 같아요
                    </button>
                  )
                )}

                {/* 예약 취소 — 입장 완료된 건은 서버가 막는다(현장 진행 중). */}
                {step !== "done" && (
                  cancelStep === "confirm" ? (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3.5">
                      <p className="text-[13px] font-bold text-foreground mb-1">정말 이 예약을 취소할까요?</p>
                      <p className="text-[11.5px] text-muted-foreground mb-2 leading-relaxed">
                        손님에게는 &ldquo;클럽 사정으로 취소됐다&rdquo;고만 안내되고, 사유는 나플 담당자에게만 전달돼요.
                      </p>
                      <input
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        maxLength={200}
                        placeholder="취소 사유 (예: 그날 단체 대관이 잡혔어요)"
                        className="w-full h-11 px-3 rounded-lg bg-card border border-border text-[14px] text-foreground outline-none focus:border-red-400"
                      />
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={doCancel}
                          disabled={busy || !cancelReason.trim()}
                          className="flex-1 h-11 rounded-lg bg-red-500 text-white text-[13.5px] font-bold disabled:opacity-40"
                        >
                          {busy ? "취소하는 중…" : "예약 취소하기"}
                        </button>
                        <button
                          onClick={() => {
                            setCancelStep("idle");
                            setCancelErr(null);
                          }}
                          disabled={busy}
                          className="w-[88px] h-11 rounded-lg border border-border text-[13.5px] font-bold text-muted-foreground disabled:opacity-50"
                        >
                          닫기
                        </button>
                      </div>
                      {cancelErr && <p className="text-[12px] text-red-400 mt-2">{cancelErr}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelStep("confirm")}
                      className="w-full h-11 mt-3 rounded-xl border border-red-500/30 text-red-400 text-[13.5px] font-bold"
                    >
                      예약 취소
                    </button>
                  )
                )}

                <div className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t border-border">
                  <span className="text-[11.5px] text-muted-foreground">나플 담당자</span>
                  <a
                    href="tel:01022051052"
                    className="flex items-center gap-1.5 font-mono text-[15px] font-bold text-foreground tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    010-2205-1052
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
