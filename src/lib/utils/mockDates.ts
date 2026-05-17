import dayjs from "dayjs";

export function adjustMockAuctionDates(auction: any) {
  if (!auction) return auction;
  
  const mockId1 = "126a7cde-3978-40f0-944e-ac9e9b5b2ef4";
  const mockId2 = "6a1159bd-d726-475a-8066-17f583151eda";
  const mockId3 = "f58bef43-6521-4c89-a014-af519c8486e7";

  const isMock = auction.id === mockId1 || auction.id === mockId2 || auction.id === mockId3;
  if (!isMock) return auction;

  // Clone to avoid mutating original state incorrectly
  const adjusted = { ...auction };

  // Set created_at to a few hours ago so it shows "방금 전" or "2시간 전"
  adjusted.created_at = dayjs().subtract(2, "hour").toISOString();

  if (auction.id === mockId1) {
    // Today
    adjusted.event_date = dayjs().format("YYYY-MM-DD");
    adjusted.share_deadline = dayjs().endOf("day").toISOString();
    adjusted.auction_end_at = dayjs().endOf("day").toISOString();
  } else if (auction.id === mockId2) {
    // Tomorrow
    adjusted.event_date = dayjs().add(1, "day").format("YYYY-MM-DD");
    adjusted.share_deadline = dayjs().add(1, "day").endOf("day").toISOString();
    adjusted.auction_end_at = dayjs().add(1, "day").endOf("day").toISOString();
  } else if (auction.id === mockId3) {
    // Day after tomorrow
    adjusted.event_date = dayjs().add(2, "day").format("YYYY-MM-DD");
    adjusted.share_deadline = dayjs().add(2, "day").endOf("day").toISOString();
    adjusted.auction_end_at = dayjs().add(2, "day").endOf("day").toISOString();
  }

  return adjusted;
}
