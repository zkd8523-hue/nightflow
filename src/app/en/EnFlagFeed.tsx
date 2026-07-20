"use client";

import Link from "next/link";

const AREA_EN: Record<string, string> = {
  강남: "Gangnam",
  홍대: "Hongdae",
  이태원: "Itaewon",
  건대: "Konkuk",
  부산: "Busan",
  대구: "Daegu",
  인천: "Incheon",
  광주: "Gwangju",
  대전: "Daejeon",
  울산: "Ulsan",
  세종: "Sejong",
};

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  if (isToday) return "Tonight";
  if (isTomorrow) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatBudget(total: number | null, perPerson: number, count: number): string {
  const amount = total ?? perPerson * count;
  if (amount >= 1000000) return `₩${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 10000) return `₩${Math.round(amount / 10000)}万`;
  return `₩${amount.toLocaleString()}`;
}

type FlagItem = {
  id: string;
  area: string;
  event_date: string;
  budget_per_person: number;
  total_budget: number | null;
  target_count: number;
  current_count: number;
  target_male: number;
  target_female: number;
  status: string;
  gender_pref: string;
  notes: string | null;
  leader?: { display_name: string | null; name: string | null; country_code: string | null } | null;
  offerCount?: number;
};

export function EnFlagFeed({ flags }: { flags: FlagItem[] }) {
  if (flags.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Active Flags</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {flags.length} group{flags.length !== 1 ? "s" : ""} waiting for club offers
          </p>
        </div>
        <Link
          href="/login?lang=en"
          className="px-4 py-2 rounded-full bg-inverse text-inverse-foreground font-black text-[12px] hover:opacity-90 transition-colors whitespace-nowrap"
        >
          🚩 Plant yours
        </Link>
      </div>

      <div className="space-y-3">
        {flags.map((flag) => {
          const area = AREA_EN[flag.area] ?? flag.area;
          const date = formatEventDate(flag.event_date);
          const budget = formatBudget(flag.total_budget, flag.budget_per_person, flag.target_count);
          const spotsLeft = flag.target_count - flag.current_count;
          const isSelecting = flag.status === "selecting";

          return (
            <div
              key={flag.id}
              className="rounded-2xl bg-card border border-border p-4 space-y-3"
            >
              {/* Top row: area + date + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[15px]">{area}</span>
                    <span className="text-muted-foreground text-[13px]">·</span>
                    <span className="text-[13px] text-foreground/80 font-medium">{date}</span>
                  </div>
                  {flag.notes && (
                    <p className="text-[12px] text-muted-foreground line-clamp-1">{flag.notes}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    isSelecting
                      ? "bg-amber-500/20 text-brand-amber border border-amber-500/30"
                      : "bg-green-500/20 text-money border border-green-500/30"
                  }`}
                >
                  {isSelecting ? "Reviewing" : "Open"}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-[13px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-black text-brand-amber">{budget}</span>
                </div>
                <span className="text-muted-foreground">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Group</span>
                  <span className="font-bold text-foreground">
                    {flag.target_male > 0 || flag.target_female > 0 ? (
                      <>
                        {flag.target_male > 0 && <span className="text-blue-400">{flag.target_male}M</span>}
                        {flag.target_male > 0 && flag.target_female > 0 && <span className="text-muted-foreground"> + </span>}
                        {flag.target_female > 0 && <span className="text-pink-400">{flag.target_female}F</span>}
                      </>
                    ) : (
                      `${flag.target_count} ppl`
                    )}
                  </span>
                </div>
                {(flag.offerCount ?? 0) > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">{flag.offerCount} offer{(flag.offerCount ?? 0) !== 1 ? "s" : ""}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[12px] text-muted-foreground leading-relaxed">
        These groups are waiting for club offers. Plant your own flag and clubs compete to host you.
      </p>
    </section>
  );
}
