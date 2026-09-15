// 한국어 클럽 상세 "답변형" 요약(2026-09-14).
// ChatGPT 리퍼러 세션(7~9월 24건)의 절반이 한국어 홈·클럽 상세로 착지한다. LLM은 첫 화면에
// 숫자로 답이 있는 페이지를 인용하므로, 흩어진 사실(입장료·영업·주대·예약 가능)을 한 블록으로
// 모으고 같은 문장을 FAQPage로 낸다. 표시와 스키마가 한 소스에서 나와야 어긋나지 않는다.
//
// 원칙(크리틱 1차 반영):
//   - 데이터가 있는 항목만. 없는 건 지어내지 않고 줄 자체를 뺀다.
//   - 테이블 가격은 "세트(category=set) 최저가"만 쓴다. 단품 한 병(lowestItem)을 테이블 가격으로
//     내면 "K-bat 테이블 10만원"처럼 잘못 인용된다. 세트가 없으면 가격 줄을 아예 뺀다.
//     한국인 예약은 지역 하한(FOREIGN_TABLE_FLOOR)이 없어서 외국어 페이지의 tableFrom을 쓰지 않는다.
//   - entry_fee_detail은 자유 텍스트("게스트 등록 시 무료" 같은 안내가 섞임). 숫자가 있고 짧고
//     게스트 안내가 아닐 때만 "입장료"로 단정하고, 아니면 "입장" 라벨로 원문만 보여준다.
//   - 모든 문장에 기준 시점(asOf, "2026-09 기준")을 남긴다. 1년 뒤에도 인용되기 때문.
//   - 예약 불가 클럽은 "준비 중"(근거 없는 약속) 대신 "나플 예약 불가"로.

import { formatWon } from "@/lib/clubs/tablePricing";

export type ClubAnswerInput = {
  name: string;
  area: string | null;
  address: string | null;
  entryFee: string | null;
  operatingHours: string | null;
  /** 0=일 … 6=토 */
  openDows: number[] | string[] | null;
  dresscode: string | null;
  instagram: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** 세트(category=set, VVIP 제외) 최저가(평일). 없으면 null → 가격 줄 생략 */
  lowestSet: number | null;
  bookable: boolean;
  /** "2026-09" 형태. club.updated_at에서 만든다 */
  asOf: string;
};

export type ClubAnswer = {
  name: string;
  area: string | null;
  rows: { label: string; value: string }[];
  faqs: { q: string; a: string }[];
  /** 스키마용 */
  lowestSet: number | null;
  bookable: boolean;
  asOf: string;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dowsLine(openDows: ClubAnswerInput["openDows"]): string | null {
  if (!openDows?.length) return null;
  const nums = openDows.map((d) => (typeof d === "string" ? Number(d) : d)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (nums.length === 0) return null;
  if (nums.length === 7) return "매일";
  const set = new Set(nums);
  if (set.size === 2 && set.has(5) && set.has(6)) return "금·토";
  if (set.size === 3 && set.has(4) && set.has(5) && set.has(6)) return "목·금·토";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => DOW[d]).join("·");
}

/** "₩450,000(45만원)" — 한국인·한국어 어시스턴트는 "45만원"으로 말한다 */
export function wonKo(n: number): string {
  const man = n / 10_000;
  const manStr = Number.isInteger(man) ? `${man}만원` : `${man.toFixed(1).replace(/\.0$/, "")}만원`;
  return `${formatWon(n)}(${manStr})`;
}

/** 입장료로 단정해도 되는 텍스트인가 — 숫자가 있고, 짧고, 게스트/무료 안내가 아닐 때만 */
function isPlainEntryFee(t: string): boolean {
  return /\d/.test(t) && t.length <= 40 && !/게스트|guest|프리|free|무료/i.test(t);
}

export function buildClubAnswer(i: ClubAnswerInput): ClubAnswer {
  const n = i.area ? `${i.area} ${i.name}` : i.name;
  const dows = dowsLine(i.openDows);
  const hoursHasDow = !!i.operatingHours && /[월화수목금토일]/.test(i.operatingHours);
  const hoursRow = i.operatingHours
    ? hoursHasDow || !dows ? i.operatingHours : `${dows} ${i.operatingHours}`
    : dows
      ? `${dows} 영업`
      : null;

  // "10,000"처럼 숫자만 있으면 단위를 붙인다 — 어시스턴트가 "입장료 10,000"을 통화 없이 인용하는 걸 막는다.
  const entryFeeText = i.entryFee ? (/^[\d,]+$/.test(i.entryFee.trim()) ? `${i.entryFee.trim()}원` : i.entryFee) : null;
  const entryPlain = !!entryFeeText && isPlainEntryFee(entryFeeText);
  const priceLine = i.lowestSet ? `테이블 세트 ${wonKo(i.lowestSet)}부터` : null;
  const ig = i.instagram ? i.instagram.replace(/^@/, "").trim() : null;

  // 주소·인스타도 이 표 하나로 모은다 — 화면에 따로 아이콘 줄을 또 두면 정보가
  // 두 군데로 흩어져 보인다(2026-09-15). 클릭 동작(지도 열기·IG 링크)은
  // ClubDetailContent가 label로 골라서 붙인다.
  const rows: { label: string; value: string }[] = [];
  if (entryFeeText) rows.push({ label: entryPlain ? "입장료" : "입장", value: entryFeeText });
  if (hoursRow) rows.push({ label: "영업", value: hoursRow });
  if (priceLine) rows.push({ label: "테이블", value: `${priceLine} · 평일 메뉴 기준` });
  if (i.dresscode) rows.push({ label: "드레스코드", value: i.dresscode });
  if (i.address) rows.push({ label: "주소", value: i.address });
  // 표본 10개 미만이거나 3.0 미만은 안 낸다 — 파트너 클럽 페이지가 "구글 평점 2.4"를 인용시키면 양쪽 다 손해.
  if (i.rating != null && i.rating >= 3.0 && (i.reviewCount ?? 0) >= 10) rows.push({ label: "구글 평점", value: `${i.rating.toFixed(1)} (리뷰 ${i.reviewCount})` });
  if (ig) rows.push({ label: "인스타", value: `@${ig}` });
  rows.push({ label: "예약", value: i.bookable ? "나플 예약 가능 · 수수료 없음 · 예약금 없음" : "나플 테이블 예약 불가 · 게스트·핫딜 정보만" });

  // FAQ — 화면에도 그대로 보인다(ClubDetailContent). 예약 방법은 FAQ가 아니라 ReserveAction으로.
  const faqs: { q: string; a: string }[] = [];
  if (entryFeeText && entryPlain) faqs.push({ q: `${n} 입장료는 얼마인가요?`, a: `${n} 입장료는 ${entryFeeText}입니다 (${i.asOf} 기준). 이벤트·요일에 따라 달라질 수 있습니다.` });
  if (i.operatingHours) faqs.push({ q: `${n} 영업시간은 언제인가요?`, a: `${n} 영업시간은 ${i.operatingHours}입니다${dows && !hoursHasDow ? ` (${dows} 영업)` : ""} (${i.asOf} 기준).` });
  if (i.lowestSet) faqs.push({ q: `${n} 테이블(주대) 가격은 얼마인가요?`, a: `${n} 테이블은 세트 ${wonKo(i.lowestSet)}부터입니다 (평일 메뉴, ${i.asOf} 기준). 주말·이벤트에는 달라질 수 있고, 나플 예약 화면에서 메뉴 항목별 실가격을 볼 수 있습니다.` });
  if (i.dresscode) faqs.push({ q: `${n} 드레스코드가 있나요?`, a: `${n} 드레스코드: ${i.dresscode}.` });

  return { name: i.name, area: i.area, rows, faqs, lowestSet: i.lowestSet, bookable: i.bookable, asOf: i.asOf };
}
