"use server";

import { createClient } from "@/lib/supabase/server";

interface RequestClubInput {
  clubName: string;
  area?: string | null;
  note?: string | null;
}

export async function requestClub(
  input: RequestClubInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clubName = input.clubName.trim();
  if (!clubName) return { ok: false, error: "클럽명을 입력해주세요" };
  if (clubName.length > 60) return { ok: false, error: "클럽명이 너무 길어요 (최대 60자)" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from("club_requests").insert({
    user_id: auth.user?.id ?? null,
    club_name: clubName,
    area: input.area?.trim() || null,
    note: input.note?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
