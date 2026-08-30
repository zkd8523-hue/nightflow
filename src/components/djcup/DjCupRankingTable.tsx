import Link from "next/link";
import Image from "next/image";

export interface DjCupRankingRow {
  dj_id: string;
  display_name: string;
  slug: string;
  artwork_url: string | null;
  champion_count: number;
  win_count: number;
  appear_count: number;
  champion_rate: number | null;
  win_rate: number | null;
  total_plays: number;
}

/**
 * DJ 이상형 월드컵 랭킹 표. admin/insights의 표 규약(생 <table>, shadcn table
 * 컴포넌트는 프로젝트에 없음)을 그대로 따른다 — thead 대문자 라벨, td 우측정렬
 * 숫자, 행 hover.
 *
 * DJ 이름은 전부 /dj/{slug}로 링크된다 — "나플에 DJ DB가 있구나" 각인의 실제
 * 착지점이 여기다. 표본이 적으면(등장 5회 미만) 승률을 —로 가린다.
 */
export function DjCupRankingTable({ rows }: { rows: DjCupRankingRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
            <th className="p-3 w-8">#</th>
            <th className="p-3">DJ</th>
            <th className="p-3 text-right">우승비율</th>
            <th className="p-3 text-right">승률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.dj_id} className="border-b border-border hover:bg-card/50 transition-colors">
              <td className="p-3 font-bold text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="p-3">
                <Link href={`/dj/${row.slug}`} className="flex items-center gap-2.5 group">
                  <span className="relative w-7 h-7 rounded-md overflow-hidden shrink-0 bg-[#1C1C1E]">
                    {row.artwork_url ? (
                      <Image src={row.artwork_url} alt="" fill sizes="28px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white/70">
                        {row.display_name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </span>
                  <span className="font-bold text-foreground truncate group-hover:text-amber-400 transition-colors">
                    {row.display_name}
                  </span>
                </Link>
              </td>
              <td className="p-3 text-right font-bold tabular-nums">
                {row.champion_rate !== null ? `${row.champion_rate}%` : "—"}
              </td>
              <td className="p-3 text-right text-muted-foreground tabular-nums">
                {row.appear_count < 5 ? "—" : row.win_rate !== null ? `${row.win_rate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
