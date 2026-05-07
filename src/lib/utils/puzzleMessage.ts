type PuzzleLite = {
  id: string;
  event_date: string;
  area: string;
  target_count: number;
  current_count: number;
  is_recruiting_party: boolean;
};

type AcceptedOfferLite = {
  proposed_price: number;
  includes: string[];
  club?: { name: string } | null;
} | null | undefined;

function formatMsgDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day}(${days[d.getDay()]})`;
}

export function buildAcceptedFlagMessage(
  puzzle: PuzzleLite,
  offer: AcceptedOfferLite,
  origin: string,
): string {
  const date = formatMsgDate(puzzle.event_date);
  const headcount = puzzle.is_recruiting_party
    ? `${puzzle.current_count}명`
    : `${puzzle.target_count}명`;
  const url = `${origin}/flags/${puzzle.id}`;

  const lines: string[] = [`[NightFlow 🚩 깃발 수락!]`, ``];
  lines.push(`${date} · ${puzzle.area} · ${headcount}`);

  if (offer) {
    const club = offer.club?.name ?? "클럽";
    lines.push(`${club} · ${offer.proposed_price.toLocaleString()}원`);
    if (offer.includes.length > 0) {
      lines.push(offer.includes.join(", "));
    }
  }

  lines.push(``, `예약 안내 부탁드려요!`, url);
  return lines.join("\n");
}
