// 쿠팡 파트너스 상품 카탈로그와 노출 세트.
//
// ⚠️ link·image는 쿠팡 파트너스 화면(링크 생성)에서 받은 값만 넣는다.
//    link가 빈 상품은 화면에 나오지 않는다(미리보기 ?affpreview=1 제외).
//    가격은 바뀌므로 null이면 가격 줄을 숨긴다.
// 상품 후보 근거: ~/Desktop/나플_광고제안/쿠팡_상품후보.md

import type { AffArea } from "./config";

export type CoupangCategory =
  | "hangover" | "battery" | "breath" | "oral" | "deo"
  | "hair" | "lip" | "fixer" | "perfume" | "bag" | "halloween";

export interface CoupangProduct {
  id: string;
  name: string;
  /** 3칸 격자처럼 좁은 칸에서 쓰는 짧은 이름 */
  shortName: string;
  category: CoupangCategory;
  price: number | null;
  priceFrom?: boolean;
  rocket: boolean;
  gender: "m" | "f" | "u";
  /** 쿠팡 파트너스 링크 (https://link.coupang.com/a/...) */
  link: string;
  /** 쿠팡 파트너스가 주는 상품 이미지 URL */
  image: string;
}

export const COUPANG_PRODUCTS: CoupangProduct[] = [
  { id: "sangkwae", name: "상쾌환 스틱 ZERO 납작복숭아맛 숙취해소제, 18g, 10개", shortName: "상쾌환 스틱", category: "hangover", price: 10750, rocket: true, gender: "u", link: "https://link.coupang.com/a/h3xXdL4FJA", image: "https://t3c.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2025/04/15/13/3/c474b78f-d23a-4c2b-8c28-d7a83a101184.jpg" },
  { id: "condition", name: "컨디션 스틱 종류별 1개씩, 40개, 18g", shortName: "컨디션 스틱 세트", category: "hangover", price: 42350, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3xXZ6JNVA", image: "https://thumbnail6.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/image_audit/prod/34faceb4-b0c7-5834-8f3c-52a1dd6ce8a0.png" },
  { id: "readyq", name: "레디큐 드링크 오리지널 120ML 10개입 1개", shortName: "레디큐 드링크", category: "hangover", price: 24000, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3ybQ3uBpI", image: "https://thumbnail4.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/b54c/9121415b5910e463b2f44c5e8e0325a6e22cfd8adceed1e8500f1a457f3f.jpg" },
  { id: "pocketmaster", name: "아이시(isee)맥세이프 준고체 보조배터리 10000mAh CCC 인증 3in1 냉각 15W 무선충전 22.5W 고속충전 애플워치 갤럭시워치 브리즈X, 블랙", shortName: "맥세이프 보조배터리", category: "battery", price: 39800, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3ycyMPbQ4", image: "https://t3a.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/image_audit/stage/manual/6e444eb2441d81566f8cc7befce695e33a375743dcbe2bd47df55ced129c_1790835954638.png" },
  { id: "anker", name: "앤커 맥고 파워뱅크 10000mAh 30W 보조배터리 맥세이프 무선충전 고속충전 qi2 기내용 아이폰 A1664, 블랙", shortName: "앤커 맥고 보조배터리", category: "battery", price: 61900, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3xZIoUYOy", image: "https://t1a.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/1ee2/707f8830279cc8214c2e5ebfcda0ea7a7ee1439f4087209df6803b3c3f5e.jpg" },
  { id: "listerine", name: "[미지의찬장]리스테린 포켓팩_쿨민트 후레쉬 버스트 휴대용 필름 브레스 스트립 구강 청결제 구취 제거제 3팩 입냄새 제거제 먹는 가글 필름형", shortName: "리스테린 포켓팩", category: "breath", price: 27900, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3x0uJeZrg", image: "https://thumbnail4.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/6a83/156afa264cc93fadd2a7184a8abcfb97ff0163e10f3cc7a6815dfb732d93.png" },
  { id: "artepolis", name: "내츄럴파마 호주 프로폴리스 스프레이 고함량 마누카꿀 면역보강, 3개, 30ml", shortName: "프로폴리스 스프레이", category: "oral", price: 46910, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3x1hd5QiG", image: "https://thumbnail1.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/4bd0/fe4fe04d4559a3784e60f01e2bac6fae4ef5d889556340c743413dd8551a.jpg" },
  { id: "soonpi", name: "니베아맨 쿨킥 스프레이 데오드란트, 200ml, 4개", shortName: "니베아맨 데오 스프레이", category: "deo", price: 42320, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3ydgH45lI", image: "https://t2a.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/b748/097d3bfbf1cde9d1881d0941576b93e0bd1bc1faee8b64be03336442af53.png" },
  { id: "dashu", name: "다슈 포 맨 오리지널 슈퍼 매트 헤어왁스, 2개", shortName: "다슈 왁스", category: "hair", price: 17080, rocket: true, gender: "m", link: "https://link.coupang.com/a/h3x2wpjjuC", image: "https://thumbnail9.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/62592731973429-68d7202d-6c22-447e-8dbe-e01c172721db.jpg" },
  { id: "gatsby", name: "갸스비 무빙러버 쿨웨트 헤어왁스, 80g, 2개", shortName: "갸스비 왁스", category: "hair", price: 13140, rocket: true, gender: "m", link: "https://link.coupang.com/a/h3x3iNnDfo", image: "https://thumbnail12.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/528874164096839-74e8a6c3-248e-4712-a4a2-05ab1142dba0.jpg" },
  { id: "grafen", name: "그라펜 해수 포마드 헤어왁스 100g + 스프레이 210ml 세트, 1세트", shortName: "그라펜 포마드", category: "hair", price: 24770, rocket: true, gender: "m", link: "https://link.coupang.com/a/h3x35bVMOa", image: "https://t3c.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2892149365327012-bc0e0dd4-5570-4b05-8ece-724d0eb64155.jpg" },
  { id: "romand", name: "롬앤 더 쥬시 래스팅 틴트, 04 피그피그, 1개", shortName: "롬앤 틴트", category: "lip", price: 5730, rocket: true, gender: "f", link: "https://link.coupang.com/a/h3x4RBabvw", image: "https://t4a.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/109982010791700-b05878a9-653e-4eba-96c8-010aa6f8e918.jpg" },
  { id: "3ce", name: "3CE 벨벳 립 틴트, DAFFODIL, 1개", shortName: "3CE 틴트", category: "lip", price: 14400, rocket: false, gender: "f", link: "https://link.coupang.com/a/h3x5DPlpEO", image: "https://t1c.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/65db/9d20e92d50f2560c7593174d3c7e1948409047b4edaa0993843c3c6d1010.jpg" },
  { id: "allnighter", name: "록키스 쿨 하이드레이팅 픽서 미스트, 100ml, 2개", shortName: "쿨 픽서 미스트", category: "fixer", price: 12800, rocket: false, gender: "f", link: "https://link.coupang.com/a/h3yh4x7IeO", image: "https://t1c.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/5756/acf229564faf4e5c55703931b351003d96c53dd3567fe2e14a42b82f810f.jpg" },
  { id: "ckone", name: "캘빈클라인 CK ONE 오드뚜왈렛 100ml", shortName: "CK ONE 100ml", category: "perfume", price: 28930, priceFrom: true, rocket: false, gender: "u", link: "", image: "" },
  { id: "cleancotton", name: "고급 향수공병 + 클린 웜코튼 edp 60ml 사은품 증정, 1개", shortName: "클린 웜코튼 60ml", category: "perfume", price: 35700, rocket: false, gender: "f", link: "https://link.coupang.com/a/h3x7lMPH3Y", image: "https://t4a.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/a2b7/96cd5e0a74f96fecdc524c8d1b43b97615a79f191935f5b8cf96a52e09cd.jpg" },
  { id: "eros", name: "베르사체 에로스 오 드 뚜왈렛 30 ml + 미니 5 ml 세트, 1개, 30ml", shortName: "베르사체 에로스", category: "perfume", price: 47020, rocket: true, gender: "m", link: "https://link.coupang.com/a/h3x776d3Ke", image: "https://thumbnail3.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2031988824512138-da217c6c-b8ed-46ae-a5f4-c64d4111658e.jpg" },
  { id: "coolwater", name: "쿨워터 맨 EDT 125ml, 1개", shortName: "쿨워터 맨 125ml", category: "perfume", price: 31260, rocket: false, gender: "m", link: "https://link.coupang.com/a/h3x8UL9gGb", image: "https://t5c.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/beb0/239af00311034f79a905a7395c0ac942ac6d0b54f11a0aa632185f5d6c2a.jpg" },
  { id: "gypsy_hand", name: "(백화점정품)바이레도베티버 핸드크림, 1개, 50ml", shortName: "바이레도 핸드크림", category: "perfume", price: 65900, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3ygrUdogS", image: "https://t1c.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/7d96/9d01e635b4f48ed8d6defd81549a73a086bad5d09cd27181d3908faa9b57.png" },
  { id: "arcteryx", name: "아크테릭스 맨티스 2 웨이스트백", shortName: "아크테릭스 웨이스트백", category: "bag", price: 109000, priceFrom: true, rocket: false, gender: "u", link: "", image: "" },
  // 만 원 미만 미끼 — 클릭률용(2026-10-22 운영자: 줄마다 1개 이상, 맨 앞)
  { id: "gagarin", name: "가그린 후레쉬 브레스 구강스프레이, 15ml, 1개", shortName: "가그린 구강스프레이", category: "oral", price: 6350, rocket: true, gender: "u", link: "https://link.coupang.com/a/h3BF2SEJi0", image: "https://thumbnail3.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2023/05/31/14/5/7581202d-c4ab-4d79-9702-fe20fe46aa58.jpg" },
  { id: "artepolis_one", name: "아르테폴리스 구강항균 그린프로폴리스 스프레이, 1개, 30ml", shortName: "프로폴리스 스프레이", category: "oral", price: 6900, rocket: false, gender: "u", link: "https://link.coupang.com/a/h3BGKCpiRU", image: "https://thumbnail4.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/image_audit/prod/8c0edcf4-6895-4bce-a6c4-4dbb44f8884e_fixing_v2.png" },
  { id: "camille", name: "카밀 핸드크림 클래식 미니, 2개, 30ml", shortName: "카밀 미니 핸드크림", category: "perfume", price: 5200, rocket: true, gender: "u", link: "https://link.coupang.com/a/h3BHr32mRg", image: "https://thumbnail12.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/14712791476911-32b37d32-7f0a-4f91-8f37-0c0ef96f861d.jpg" },
  { id: "niveaRoll", name: "니베아 맨 데오드란트 롤온 쿨킥 50ML & 온더바디 생크림 폼 3ML, 1개", shortName: "니베아맨 롤온", category: "deo", price: 9990, rocket: false, gender: "m", link: "https://link.coupang.com/a/h3BH9IBiwK", image: "https://thumbnail5.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/4197/aae631a80c4ea9334fbcc12a34fc47e03667ff0285002fc6f69b2d188038.jpg" },
];

/** 생활용품 묶음(1~2칸) / 향수 묶음(가운데) / 기타 묶음 — 지역별 후보. */
interface AreaPools { daily: string[]; perfume: string[]; extra: string[] }

const POOLS: Record<Exclude<AffArea, "other" | "seoul">, AreaPools> = {
  hongdae: { daily: ["sangkwae", "pocketmaster", "listerine", "artepolis", "gagarin", "camille"], perfume: ["coolwater", "cleancotton"], extra: ["dashu", "romand"] },
  itaewon: { daily: ["sangkwae", "pocketmaster", "listerine", "soonpi", "gagarin", "niveaRoll"], perfume: ["gypsy_hand"], extra: ["dashu", "3ce", "allnighter"] },
  // 강남·부산은 한국어도 기본이 아고다지만, 쿠팡이 필요한 자리(목록 띠 등)를 위해 둔다.
  gangnam: { daily: ["readyq", "condition", "anker", "listerine", "gagarin", "camille"], perfume: ["eros"], extra: ["grafen", "allnighter"] },
  busan: { daily: ["sangkwae", "pocketmaster", "listerine", "artepolis", "gagarin", "camille"], perfume: ["coolwater"], extra: ["gatsby", "romand"] },
};
const DEFAULT_POOL: AreaPools = {
  daily: ["sangkwae", "pocketmaster", "listerine", "artepolis", "soonpi", "gagarin", "camille"],
  perfume: ["coolwater", "cleancotton"],
  extra: ["dashu", "romand"],
};

const byId = new Map(COUPANG_PRODUCTS.map((p) => [p.id, p]));

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 한 줄에 보여줄 상품을 뽑는다(새로고침·페이지 이동마다 섞임).
 * - 1~2칸 생활용품, 3칸 이상이면 가운데 칸에 향수 1개, 나머지 기타.
 * - 회원 성별을 알면 그 성별 + 공용만, 모르면 공용 우선.
 * - usable: 링크가 있는(또는 미리보기) 상품만 후보로.
 */
export function pickCoupangSet(opts: {
  area: AffArea;
  count: number;
  gender?: "male" | "female" | null;
  usable: (p: CoupangProduct) => boolean;
  exclude?: string[];
  rand?: () => number;
}): CoupangProduct[] {
  const { area, count, gender, usable, exclude = [], rand = Math.random } = opts;
  const pool = area === "other" || area === "seoul" ? DEFAULT_POOL : POOLS[area];
  const g = gender === "male" ? "m" : gender === "female" ? "f" : null;
  const fits = (p: CoupangProduct) =>
    usable(p) && !exclude.includes(p.id) && (g ? p.gender === g || p.gender === "u" : p.gender !== "f" || p.category === "perfume");
  const resolve = (ids: string[]) =>
    shuffle(ids.map((id) => byId.get(id)).filter((p): p is CoupangProduct => !!p && fits(p)), rand);

  const daily = resolve(pool.daily);
  const perfume = resolve(pool.perfume);
  const extra = resolve(pool.extra);

  const out: CoupangProduct[] = [];
  const take = (src: CoupangProduct[]) => { const p = src.shift(); if (p) out.push(p); };
  take(daily);
  if (count >= 2) take(daily);
  if (count >= 3 && perfume.length) take(perfume);
  while (out.length < count && (extra.length || daily.length)) take(extra.length ? extra : daily);
  // 만 원 미만 상품을 줄마다 최소 1개 — 부담 없는 가격이 클릭률을 올린다(2026-10-22 운영자)
  const CHEAP = 10000;
  if (!out.some((p) => (p.price ?? Infinity) < CHEAP)) {
    const cheap = shuffle(
      COUPANG_PRODUCTS.filter((p) => (p.price ?? Infinity) < CHEAP && fits(p) && !out.some((o) => o.id === p.id)),
      rand,
    )[0];
    if (cheap) { if (out.length >= count) out.pop(); out.push(cheap); }
  }
  // 맨 앞에 제일 싼 것부터(가격 없는 상품은 뒤로) — 이게 향수를 가운데 두던 규칙보다 우선한다
  out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return out.slice(0, count);
}

/** 키트(TOP10) 페이지용 — 링크 있는 상품 전부, 카테고리 고르게. */
export function kitProducts(usable: (p: CoupangProduct) => boolean): CoupangProduct[] {
  const order: CoupangCategory[] = ["hangover", "battery", "breath", "perfume", "hair", "lip", "fixer", "deo", "oral", "bag"];
  const seen = new Set<CoupangCategory>();
  const first: CoupangProduct[] = [];
  const rest: CoupangProduct[] = [];
  for (const c of order) {
    for (const p of COUPANG_PRODUCTS.filter((x) => x.category === c && usable(x))) {
      if (!seen.has(c)) { seen.add(c); first.push(p); } else rest.push(p);
    }
  }
  return [...first, ...rest].slice(0, 10);
}

/** 미리보기용 대체 링크(수수료 없음) — 실제 운영에선 쓰이지 않는다. */
export function coupangSearchUrl(p: CoupangProduct): string {
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(p.shortName)}`;
}
