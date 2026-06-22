/** ISO 3166-1 alpha-2 코드 → 이모지 국기 */
export function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0)))
    .join("");
}

export const COUNTRIES = [
  { code: "US", name: "United States", nameKo: "미국" },
  { code: "JP", name: "Japan", nameKo: "일본" },
  { code: "CN", name: "China", nameKo: "중국" },
  { code: "TW", name: "Taiwan", nameKo: "대만" },
  { code: "HK", name: "Hong Kong", nameKo: "홍콩" },
  { code: "SG", name: "Singapore", nameKo: "싱가포르" },
  { code: "TH", name: "Thailand", nameKo: "태국" },
  { code: "VN", name: "Vietnam", nameKo: "베트남" },
  { code: "PH", name: "Philippines", nameKo: "필리핀" },
  { code: "MY", name: "Malaysia", nameKo: "말레이시아" },
  { code: "AU", name: "Australia", nameKo: "호주" },
  { code: "GB", name: "United Kingdom", nameKo: "영국" },
  { code: "FR", name: "France", nameKo: "프랑스" },
  { code: "DE", name: "Germany", nameKo: "독일" },
  { code: "NL", name: "Netherlands", nameKo: "네덜란드" },
  { code: "CA", name: "Canada", nameKo: "캐나다" },
  { code: "MX", name: "Mexico", nameKo: "멕시코" },
  { code: "BR", name: "Brazil", nameKo: "브라질" },
  { code: "IN", name: "India", nameKo: "인도" },
  { code: "OTHER", name: "Other", nameKo: "기타" },
] as const;

/** ISO alpha-2 코드 → 한국어 국가명 (없으면 코드 그대로) */
export function countryNameKo(code: string): string {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.nameKo ?? code;
}
