import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_LENGTH = 2;
const MAX_LENGTH = 16;

const RESERVED = [
  "admin",
  "운영자",
  "관리자",
  "nightflow",
  "nightflow팀",
  "official",
  "owner",
  "system",
];

export interface DisplayNameValidation {
  ok: boolean;
  message?: string;
}

export function validateDisplayName(value: string): DisplayNameValidation {
  const trimmed = value.trim();

  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) {
    return { ok: false, message: `닉네임은 ${MIN_LENGTH}-${MAX_LENGTH}자여야 합니다.` };
  }

  const lower = trimmed.toLowerCase();
  if (RESERVED.some((token) => lower.includes(token.toLowerCase()))) {
    return { ok: false, message: "사용할 수 없는 닉네임입니다." };
  }

  return { ok: true };
}

export async function isDisplayNameTaken(
  supabase: SupabaseClient,
  displayName: string,
  excludeUserId?: string
): Promise<boolean> {
  const query = supabase
    .from("users")
    .select("id")
    .ilike("display_name", displayName)
    .is("deleted_at", null)
    .limit(1);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return false;

  if (excludeUserId && data[0].id === excludeUserId) return false;
  return true;
}

