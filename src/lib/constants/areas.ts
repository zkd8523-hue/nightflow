export const MAIN_AREAS = ["강남", "홍대", "이태원", "건대"] as const;
export type MainArea = (typeof MAIN_AREAS)[number];

export const OTHER_CITIES = ["부산", "대구", "인천", "광주", "대전", "울산", "세종"] as const;
export const ALL_AREAS = [...MAIN_AREAS, ...OTHER_CITIES] as const;
