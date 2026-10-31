// 클럽 자리 목록(clubs.seat_zones, Migration 704) 공용 처리.
//
// 담당자는 제안서에서 구역 전체 가능 / 일부 가능으로 자리를 고르고, 고른 자리는 손님 메일의
// 버튼(영어)으로 그대로 바뀐다. 구역 전체를 고르면 버튼 하나로 묶는다 — T1~T12 열두 개가 아니라
// "T tables (T1–T12)" 하나. 정확한 번호는 당일 담당자가 배정한다.

export type SeatZone = {
  key: string;
  label: string;
  label_en: string;
  /** 공간이 둘인 클럽(Ace: EDM존·힙합존) — 담당자 화면에서 구역을 묶어 보여준다 */
  space: string | null;
  seats: string[];
};

export function parseSeatZones(raw: unknown): SeatZone[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (z): z is SeatZone =>
      !!z && typeof z.key === "string" && typeof z.label === "string" && Array.isArray(z.seats) && z.seats.length > 0,
  );
}

/** 손님에게 보여줄 선택지 — 구역 전체면 묶음 하나, 아니면 자리 하나씩. value는 손님이 고르면 저장되는 값. */
export type SeatOption = { value: string; label: string; labelKo: string };

export function seatOptions(zones: SeatZone[], picked: string[]): SeatOption[] {
  const set = new Set(picked);
  const out: SeatOption[] = [];
  const known = new Set<string>();
  for (const z of zones) {
    z.seats.forEach((s) => known.add(s));
    const mine = z.seats.filter((s) => set.has(s));
    if (mine.length === 0) continue;
    if (mine.length === z.seats.length) {
      const range = `${z.seats[0]}–${z.seats[z.seats.length - 1]}`;
      out.push({ value: `zone:${z.key}`, label: `${z.label_en} (${range})`, labelKo: `${z.label} 전체 (${range})` });
    } else {
      mine.forEach((s) => out.push({ value: s, label: `Table ${s}`, labelKo: s }));
    }
  }
  // 자리 목록에 없는 값(예전 자유 입력 등)도 버리지 않는다.
  picked.filter((s) => !known.has(s)).forEach((s) => out.push({ value: s, label: s, labelKo: s }));
  return out;
}

/** 선택지 값 → 사람이 읽는 이름(확인서 "자리" 칸 등). */
export function seatValueLabel(zones: SeatZone[], value: string, ko = false): string {
  if (value.startsWith("zone:")) {
    const z = zones.find((x) => x.key === value.slice(5));
    if (!z) return value.slice(5);
    const range = `${z.seats[0]}–${z.seats[z.seats.length - 1]}`;
    return ko ? `${z.label} (${range})` : `${z.label_en} (${range})`;
  }
  return ko ? value : `Table ${value}`;
}

/** 선택지 값이 가리키는 실제 자리들 — 담당자가 "안 돼요"를 누른 뒤 남은 자리 계산용. */
export function seatsOfValue(zones: SeatZone[], value: string): string[] {
  if (value.startsWith("zone:")) return zones.find((z) => z.key === value.slice(5))?.seats ?? [];
  return [value];
}
