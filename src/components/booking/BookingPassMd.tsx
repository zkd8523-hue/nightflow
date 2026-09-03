"use client";

// MD용 확정서. 손님용과 보여주는 정보가 다르다 —
// 수령액·준비 내역·응대 언어를 보여주고, 손님 연락처는 넘기지 않는다.

import { useState } from "react";
import { Check, Phone } from "lucide-react";

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
  hostName: string | null;
  arrivedPings: string[];
};

function fmtDateKo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

export function BookingPassMd(p: Props) {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");

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
        <div className="rounded-3xl bg-card border border-border overflow-hidden">
          <div className="bg-muted/40 px-5 pt-5 pb-4 text-center">
            <div className="text-[10.5px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              NightFlow
            </div>
            <div
              className={`inline-flex items-center gap-1.5 mt-2.5 text-[11px] font-bold tracking-wider uppercase rounded-full px-3 py-1 border ${
                p.cancelled
                  ? "text-red-400 bg-red-500/10 border-red-500/30"
                  : "text-money bg-green-500/10 border-green-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {p.cancelled ? "취소됨" : "확정"}
            </div>
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

            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[11px] font-bold text-muted-foreground mb-1.5">
                준비
              </div>
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
                <Row k="수령액">
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

            {!p.cancelled && (
              <div className="mt-4 pt-3.5 border-t border-border">
                {step === "done" ? (
                  <div className="flex items-center gap-2 h-12 rounded-xl bg-green-500/10 border border-green-500/30 px-4">
                    <Check className="w-4 h-4 text-money shrink-0" />
                    <span className="text-[13.5px] font-bold text-money">
                      입장 완료 · 메시지 전송됨
                    </span>
                    <button
                      onClick={() => setStep("idle")}
                      className="ml-auto h-8 px-3 rounded-lg border border-border text-[12px] font-semibold text-muted-foreground"
                    >
                      취소
                    </button>
                  </div>
                ) : step === "confirm" ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5">
                    <p className="text-[13px] leading-relaxed text-foreground/90 mb-3">
                      입장 완료를 누르시면 고객과 나이트플로우에 완료 메시지가 전송돼요.
                      확인하셨나요?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStep("done")}
                        className="flex-1 h-11 rounded-lg bg-money text-black text-[13.5px] font-bold"
                      >
                        네, 입장했어요
                      </button>
                      <button
                        onClick={() => setStep("idle")}
                        className="w-[88px] h-11 rounded-lg border border-border text-[13.5px] font-bold text-muted-foreground"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setStep("confirm")}
                    className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground text-[14.5px] font-bold"
                  >
                    입장 완료
                  </button>
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
