"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface UpdatePayload {
  external_attendees: number;
  external_male: number;
  external_female: number;
}

export async function updateShareAttendees(
  auctionId: string,
  payload: UpdatePayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("auctions")
    .update(payload)
    .eq("id", auctionId);

  if (error) {
    return { ok: false, error: error.message };
  }

  // ISR 캐시 무효화 — 직접 모집 반영 후 홈/상세 둘 다 fresh
  revalidatePath("/");
  revalidatePath(`/auctions/${auctionId}`);
  revalidatePath("/clubs");

  return { ok: true };
}
