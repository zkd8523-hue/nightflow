"use client";

// 손님용 확인서. 도착 버튼이 핵심 — 누르면 운영자와 담당 MD에게 즉시 알림이 간다.
// 같은 버튼은 서버에서 UNIQUE(request_id, kind)로 1회만 발송된다.

import { useState, useEffect } from "react";
import { MapPin, Check } from "lucide-react";

type Props = {
  requestId: string;
  refNo: string;
  guestName: string | null;
  eventDate: string;
  groupSize: number | string;
  cancelled: boolean;
  clubName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  operatingHours: string | null;
  tableInfo: string | null;
  includes: string[];
  totalPrice: number | null;
  guestRequest: string | null;
  hostName: string | null;
};

// operating_hours는 자유 텍스트다("금/토 22:00-05:00", "화~일 23:00~", "매일 22:00 OPEN" 등
// DB에 15가지 넘는 형식이 있다). 요일 조합까지 다 옮기려면 파싱이 끝이 없어서
// 첫 번째 시각만 뽑아 "Open HH:MM"으로 단순화한다 — 손님은 몇 시부터 여는지만
// 알면 되고, 요일별 세부 사항은 어차피 도어에서 확인하게 된다.
function toEnHours(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `Open ${match[1].padStart(2, "0")}:${match[2]}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingPass(p: Props) {
  // "10분 전"과 "도착"은 서로 다른 신호라 각각 독립적으로 완료 상태를 가져야 한다.
  // 하나로 합치면 "10분 전"을 누른 순간 화면이 통째로 "완료"로 바뀌어서
  // 실제로 도착했을 때 누를 버튼이 사라지는 문제가 있었다.
  //
  // sentAt에는 마지막으로 보낸 시각을 저장한다(Set이 아니라 timestamp) — 서버가
  // 같은 kind를 5분 쿨다운으로 재발송 허용하므로, 화면도 5분 지나면 다시
  // 버튼으로 돌아가야 실제로 재발송이 눌린다. 안 그러면 서버는 되는데 버튼이
  // 계속 "Sent" 상태라 재발송할 방법이 없다.
  const COOLDOWN_MS = 5 * 60 * 1000;
  const [sentAt, setSentAt] = useState<Partial<Record<"soon" | "arrived", number>>>({});
  const [busyKind, setBusyKind] = useState<"soon" | "arrived" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 쿨다운이 끝나는 시점에 버튼을 다시 그리기 위한 강제 리렌더 트리거.
  const [, forceTick] = useState(0);

  const isSent = (kind: "soon" | "arrived") => {
    const t = sentAt[kind];
    return t != null && Date.now() - t < COOLDOWN_MS;
  };

  useEffect(() => {
    const timers = Object.entries(sentAt).map(([kind, t]) => {
      const remain = COOLDOWN_MS - (Date.now() - t);
      if (remain <= 0) return null;
      return setTimeout(() => forceTick((n) => n + 1), remain + 100);
    });
    return () => timers.forEach((id) => id && clearTimeout(id));
  }, [sentAt]);

  const ping = async (kind: "soon" | "arrived") => {
    setBusyKind(kind);
    setErr(null);
    try {
      const res = await fetch("/api/arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: p.requestId, kind }),
      });
      if (res.ok) {
        setSentAt((prev) => ({ ...prev, [kind]: Date.now() }));
      } else if (res.status === 409) {
        // 쿨다운 중 — 서버가 거부했으니 마지막 발송 시각을 지금으로 갱신해
        // 화면도 "아직 대기 중"으로 정확히 맞춘다.
        setSentAt((prev) => ({ ...prev, [kind]: Date.now() }));
        setErr("Already sent recently — try again in a few minutes.");
      } else {
        setErr("Could not send. Please call your host.");
      }
    } catch {
      setErr("Could not send. Please call your host.");
    }
    setBusyKind(null);
  };

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="flex gap-3 py-2.5 border-t border-border/60 first:border-t-0">
      <div className="shrink-0 w-[86px] text-[10px] font-semibold tracking-wider uppercase text-muted-foreground pt-0.5">
        {k}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground py-7 px-4">
      <div className="max-w-md mx-auto">
        <div className="rounded-3xl bg-card border border-border overflow-hidden">
          {/* 스텁 */}
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
              {p.cancelled ? "Cancelled" : "Confirmed"}
            </div>
            <div className="font-mono font-bold text-[34px] tracking-wide text-brand-amber mt-3 tabular-nums">
              {p.refNo}
            </div>
            {p.hostName && (
              <div className="text-[13.5px] font-bold text-foreground mt-1.5">
                <span className="text-[11.5px] font-medium text-muted-foreground">Your host </span>
                {p.hostName}
              </div>
            )}
          </div>

          <div className="px-5 py-4">
            <Row k="Date">
              <div className="text-[18px] font-bold">{fmtDate(p.eventDate)}</div>
            </Row>
            {p.clubName && (
              <Row k="Venue">
                <div className="text-[18px] font-bold">{p.clubName}</div>
                {toEnHours(p.operatingHours) && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {toEnHours(p.operatingHours)}
                  </div>
                )}
              </Row>
            )}
            <Row k="Party">
              <div className="text-[18px] font-bold">{p.groupSize} guests</div>
            </Row>
            {p.guestName && (
              <Row k="Name">
                <div className="text-[14.5px] font-semibold">{p.guestName}</div>
              </Row>
            )}

            {(p.tableInfo || p.includes.length > 0 || p.totalPrice) && (
              <div className="mt-4 pt-3 border-t border-border">
                {p.tableInfo && (
                  <Row k="Seating">
                    <div className="text-[14.5px] font-semibold">{p.tableInfo}</div>
                  </Row>
                )}
                {p.includes.length > 0 && (
                  <Row k="Included">
                    <ul className="space-y-0.5">
                      {p.includes.map((it) => (
                        <li key={it} className="text-[14px] text-foreground/90">
                          {it}
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}
                {p.totalPrice != null && (
                  <Row k="Total">
                    <div className="font-mono text-[21px] font-bold text-money tabular-nums">
                      KRW {p.totalPrice.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Pay at venue · NightFlow takes no payment
                    </div>
                  </Row>
                )}
                {p.guestRequest && (
                  <Row k="Request">
                    <div className="text-[14px] text-foreground/90">{p.guestRequest}</div>
                  </Row>
                )}
              </div>
            )}

            {p.address && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
                  On arrival
                </div>
                <div className="text-[14px] font-semibold">{p.address}</div>
                {/* 좌표(lat/lng)는 DB 입력 시점 오차가 있을 수 있어 신뢰도가 낮다.
                    사람이 직접 적은 주소 텍스트로 검색하는 게 훨씬 정확하다 —
                    클럽명을 같이 넣으면 구글 지도가 정확한 업체를 바로 찾아준다. */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${p.clubName ?? ""} ${p.address}`.trim()
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 mt-3 h-12 rounded-xl bg-inverse text-inverse-foreground text-[14px] font-bold"
                >
                  <MapPin className="w-4 h-4" />
                  Open in Google Maps
                </a>
              </div>
            )}

            {/* 도착 알림 — 확인서의 실질 기능. 두 버튼은 서로 독립이라
                "10분 전"을 눌러도 "도착"은 그대로 눌러야 완료된다. */}
            {!p.cancelled && (
              <div className="mt-4 pt-3.5 border-t border-border">
                {!isSent("soon") && !isSent("arrived") && (
                  <p className="text-center text-[12px] text-muted-foreground mb-2">
                    Let your host know you&apos;re coming
                  </p>
                )}
                <div className="flex gap-2">
                  {isSent("soon") ? (
                    <div className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl bg-green-500/10 border border-green-500/30">
                      <Check className="w-4 h-4 text-money" />
                      <span className="text-[13px] font-bold text-money">Sent</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => ping("soon")}
                      disabled={busyKind === "soon"}
                      className="flex-1 h-12 rounded-xl border border-amber-500/40 bg-amber-500/10 text-brand-amber text-[14px] font-bold disabled:opacity-50"
                    >
                      10 min away
                    </button>
                  )}
                  {isSent("arrived") ? (
                    <div className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl bg-green-500/10 border border-green-500/30">
                      <Check className="w-4 h-4 text-money" />
                      <span className="text-[13px] font-bold text-money">Sent</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => ping("arrived")}
                      disabled={busyKind === "arrived"}
                      className="flex-1 h-12 rounded-xl border border-amber-500/40 bg-amber-500/10 text-brand-amber text-[14px] font-bold disabled:opacity-50"
                    >
                      I&apos;m here
                    </button>
                  )}
                </div>
                {(isSent("soon") || isSent("arrived")) && (
                  <p className="text-center text-[12px] text-money font-semibold mt-2">
                    {p.hostName ? `${p.hostName} has been notified` : "Your host has been notified"}
                  </p>
                )}
                {err && <p className="text-center text-[12px] text-red-400 mt-2">{err}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
