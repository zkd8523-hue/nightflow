/**
 * 한국어 조사 분기 — "홍대를 / 부산을", "강남이에요 / 홍대예요".
 * ChatRoom.tsx 의 hasJongseong 과 같은 판정(받침 유무). 지역명이 변수인 문장은
 * 이걸 거쳐야 "부산를"이 안 나온다.
 */
export function hasJongseong(text: string): boolean {
  if (!text) return false;
  const last = text.charCodeAt(text.length - 1);
  // 한글 가(0xAC00) ~ 힣(0xD7A3). 영문·숫자로 끝나면 받침 없음으로 본다
  if (last < 0xac00 || last > 0xd7a3) return false;
  return (last - 0xac00) % 28 !== 0;
}

/** 단어 뒤에 맞는 조사를 붙인다. josa 는 "을/를", "이/가", "은/는" 처럼 "받침O/받침X" 순. */
export function withJosa(word: string, josa: `${string}/${string}`): string {
  const [withBatchim, without] = josa.split("/");
  return `${word}${hasJongseong(word) ? withBatchim : without}`;
}
