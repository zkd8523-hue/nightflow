"use client";

import { useRouter } from "next/navigation";

interface Props {
  from: string;
  to: string;
  /** 현재 URL의 다른 쿼리 파라미터 (trigger, category 등) — 그대로 유지 */
  preservedParams: Record<string, string>;
}

export function SurveyDateRangeFilter({ from, to, preservedParams }: Props) {
  const router = useRouter();

  const navigate = (overrides: { from?: string; to?: string }) => {
    const params = new URLSearchParams({ tab: "surveys", ...preservedParams });
    params.set("from", overrides.from ?? from);
    params.set("to", overrides.to ?? to);
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground font-bold w-8">기간</span>
      <input
        type="date"
        defaultValue={from}
        className="bg-muted text-foreground text-[12px] rounded-lg px-2 py-1 border border-border outline-none"
        onChange={(e) => navigate({ from: e.target.value })}
      />
      <span className="text-muted-foreground text-[12px]">~</span>
      <input
        type="date"
        defaultValue={to}
        className="bg-muted text-foreground text-[12px] rounded-lg px-2 py-1 border border-border outline-none"
        onChange={(e) => navigate({ to: e.target.value })}
      />
    </div>
  );
}
