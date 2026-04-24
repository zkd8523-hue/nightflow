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

const COLORS = [
  "빨간", "파란", "초록", "노란", "보라", "주황", "분홍", "하얀", "검은", "회색",
  "하늘빛", "민트빛", "청록빛", "자주빛", "연두빛", "산호빛", "금빛", "은빛", "에메랄드빛", "남색빛",
  "크림빛", "인디고빛", "새빨간", "새파란", "샛노란", "옥빛", "호박빛", "루비빛", "자수정빛", "진주빛",
  "황금빛", "달빛", "별빛", "노을빛", "새벽빛", "여명빛", "석양빛", "밤하늘빛", "오로라빛", "형광빛",
  "코발트빛", "라벤더빛", "살구빛", "카키빛", "마젠타빛", "사파이어빛", "터키석빛", "홍옥빛", "백금빛", "구리빛",
];

const ADJECTIVES = [
  "신나는", "빛나는", "화려한", "자유로운", "멋진", "당당한", "설레는", "뜨거운", "찬란한", "유쾌한",
  "활기찬", "용감한", "씩씩한", "느긋한", "열정적인", "명랑한", "귀여운", "상쾌한", "날렵한", "우아한",
  "재빠른", "의젓한", "다정한", "영리한", "용맹한", "대담한", "쾌활한", "활발한", "늠름한", "사랑스러운",
  "강인한", "민첩한", "슬기로운", "따뜻한", "예리한", "당찬", "발랄한", "산뜻한", "들뜬", "기운찬",
  "호기심많은", "엉뚱한", "능청스러운", "의기양양한", "태평한", "재치있는", "패기있는", "야무진", "깜찍한", "똑부러진",
];

const ANIMALS = [
  "재규어", "표범", "독수리", "나비", "여우", "늑대", "치타", "호랑이", "사자", "팬더",
  "코알라", "펭귄", "돌고래", "고래", "상어", "매", "올빼미", "토끼", "고양이", "곰",
  "다람쥐", "오리", "두루미", "공작", "홍학", "코끼리", "기린", "얼룩말", "악어", "앵무새",
  "문어", "해마", "거북이", "수달", "라쿤", "알파카", "카피바라", "페넥여우", "미어캣", "비버",
  "캥거루", "코뿔소", "바다사자", "하이에나", "치킨", "도마뱀", "카멜레온", "황새", "물범", "스라소니",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateRandomNickname(supabase: SupabaseClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const prefix = Math.random() < 0.5 ? pick(COLORS) : pick(ADJECTIVES);
    const animal = pick(ANIMALS);
    const name = `${prefix}${animal}`;
    const taken = await isDisplayNameTaken(supabase, name);
    if (!taken) return name;
  }
  // 충돌 극단적으로 많을 때 fallback
  return `나플러${Date.now().toString().slice(-5)}`;
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

