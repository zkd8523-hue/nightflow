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
 * 착지점이 여기다.
 *
 * ⚠️ 표본 최소치 가드 없음(의도적으로 제거, 사용자 확정) — 우승비율·승률 둘 다
 * 판수·등장 횟수와 무관하게 항상 % 그대로 보여준다. 예전엔 "표본이 적으면
 * 과장으로 읽힌다"는 이유로 우승비율은 전체 5판 미만이면 횟수로, 승률은
 * 등장 5회 미만이면 —로 가렸는데, 사용자가 "판이 더 쌓이면 공개돼요" 같은
 * 문구와 가려지는 동작 자체를 명시적으로 없애라고 요청해 제거했다.
 * 다시 가드가 필요해지면(예: 1전 1승 100%가 신뢰도를 깎는다는 피드백이
 * 나오면) 이 커밋을 되돌아볼 것 — git blame으로 이 주석을 찾으면 된다.
 *
 * 막대바는 승률에만 amber(§3 "색은 한 곳에만")로 채운다. 우승비율에는 넣지
 * 않는다 — 분모(전체 게임수)가 승률의 분모(DJ별 등장 수)보다 훨씬 커서 같은
 * %라도 막대 길이의 의미가 달라, 나란히 두면 오히려 헷갈린다.
 *
 * 헤더의 계산식 부연설명("최종 우승 횟수 / 전체 게임수")은 레퍼런스(이상형
 * 월드컵)를 따른 것. 컬럼 폭이 좁으면(92px 시도) 이 문구가 5줄로 쌓여 빡빡해져서,
 * 대신 표 자체에 `min-w-[560px]`을 주고 숫자 컬럼을 각 130px로 넓혀 부제가
 * 한 줄(`whitespace-nowrap`)로 들어가게 했다 — 좁은 화면에서는 표가
 * 가로 스크롤된다(`overflow-x-auto`).
 */
export function DjCupRankingTable({ rows }: { rows: DjCupRankingRow[] }) {
  return (
    // min-w를 줘서 숫자 컬럼(계산식 부제 포함)에 늘어질 공간을 확보한다.
    // DJ 컬럼(max-w-0 w-full)이 나머지를 다 먹는 구조라, 표 자체를 좁게
    // 두면 부제가 92px 안에 5줄로 쌓여 빡빡해진다 — 표를 스크롤시키는 대신
    // 부제 컬럼에 폭을 주는 쪽을 택한다.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
            <th className="py-3 pl-1 pr-2 w-6">#</th>
            <th className="py-3 pr-2 pl-0">DJ</th>
            <th className="py-3 pl-1 pr-2 text-right w-[130px]">
              <span className="block whitespace-nowrap">우승비율</span>
              <span className="block whitespace-nowrap normal-case font-normal text-[9.5px] text-muted-foreground/70 tracking-normal mt-0.5">
                (최종 우승 횟수 / 전체 게임수)
              </span>
            </th>
            <th className="py-3 pl-1 pr-1 text-right w-[130px]">
              <span className="block whitespace-nowrap">승률</span>
              <span className="block whitespace-nowrap normal-case font-normal text-[9.5px] text-muted-foreground/70 tracking-normal mt-0.5">
                (승리 횟수 / 전체 1:1 대결수)
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.dj_id} className="border-b border-border hover:bg-card/50 transition-colors">
              <td className="py-2 pl-1 pr-2 font-bold text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="py-2 pr-2 pl-0 max-w-0 w-full">
                <Link href={`/dj/${row.slug}`} className="flex items-center gap-3 group min-w-0">
                  <span className="relative w-[54px] h-[72px] overflow-hidden shrink-0 bg-[#1C1C1E]">
                    {row.artwork_url ? (
                      <Image src={row.artwork_url} alt="" fill sizes="54px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[20px] font-black text-white/70">
                        {row.display_name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </span>
                  <span className="font-bold text-foreground truncate group-hover:text-amber-400 transition-colors">
                    {row.display_name}
                  </span>
                </Link>
              </td>
              <td className="py-2 pl-1 pr-2 text-right font-bold tabular-nums whitespace-nowrap">
                {row.champion_rate !== null ? `${row.champion_rate}%` : "—"}
              </td>
              <td className="py-2 pl-1 pr-1 text-right whitespace-nowrap">
                {row.win_rate === null ? (
                  <span className="text-muted-foreground tabular-nums">—</span>
                ) : (
                  <div className="inline-flex flex-col items-end gap-1 w-full">
                    <span className="text-muted-foreground font-bold tabular-nums">{row.win_rate}%</span>
                    <span className="block w-full h-1 rounded-full bg-white/10 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, Math.max(0, row.win_rate))}%` }}
                      />
                    </span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
