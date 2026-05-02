const SEOUL_HOTSPOTS = ["강남", "홍대", "이태원", "건대"];

export function matchesArea(itemArea: string | null | undefined, selectedArea: string | null): boolean {
  if (!selectedArea) return true;
  if (!itemArea) return false;
  if (itemArea === "서울 어디든" && SEOUL_HOTSPOTS.includes(selectedArea)) return true;
  return itemArea === selectedArea;
}
