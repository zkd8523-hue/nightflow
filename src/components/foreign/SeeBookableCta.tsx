import Link from "next/link";
import { makeT, type Lang } from "@/lib/i18n";
import { canonicalAreaSlug } from "@/lib/clubs/slug";

// 예약이 안 되는 클럽에서 예약 버튼 자리에 들어가는 "예약 가능한 클럽 보기" 버튼.
//
// 왜 특정 클럽이 아니라 목록인가(2026-09-26 목업 3차): 처음엔 같은 지역 추천 클럽으로
// 바로 보냈다("Book Groove & Spot instead · from ₩500k"). JEJE 페이지 하단에 남의
// 클럽 이름이 뜨는 게 어색했고, 긴 문구가 모바일에서 "…from ₩50"으로 잘렸다.
// 그 지역의 예약 가능 목록(Bookable 탭 = 목록의 기본 탭)으로 보내면 손님이 직접 고른다.
//
// 문구에 숫자·지역명을 넣지 않는다 — 버튼은 짧게, "몇 곳이 되는지"는 페이지 안내 문장이 말한다.
// 서버 페이지(Link)와 클라이언트 시트(onClick) 양쪽에서 쓰므로 훅을 쓰지 않는다.

export function seeBookableLabels(lang: Lang) {
  const t = makeT(lang);
  return {
    kicker: t("아직 예약 불가", "Not bookable yet", "まだ予約できません", "暂不可预订", "暫不可預訂"),
    main: t("예약 가능한 클럽 보기", "See bookable clubs", "予約できるクラブを見る", "查看可订夜店", "查看可訂夜店"),
  };
}

/** 예약 가능 목록 주소. 지역 목록 페이지가 있는 4개 지역만 지역 페이지로, 나머지(대구·광주 등)는 전체 목록. */
export function bookableListHref(lang: Lang, areaKo: string | null | undefined): string {
  const slug = canonicalAreaSlug(areaKo);
  return slug ? `/${lang}/clubs/${slug}` : `/${lang}/clubs`;
}

const BTN = "flex items-center justify-center text-center rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors";

/** 클럽 상세 페이지 하단 고정 바 — 한 줄. */
export function SeeBookableStickyButton({ lang, href, className = "" }: { lang: Lang; href: string; className?: string }) {
  const { main } = seeBookableLabels(lang);
  return (
    <Link href={href} data-nf-track="see_bookable_clubs" className={`${BTN} py-3.5 px-2 font-black text-[15px] ${className}`}>
      {main} →
    </Link>
  );
}

/** 클럽 시트 하단 — 두 줄("아직 예약 불가" / "예약 가능한 클럽 보기 →"). href 대신 onClick이면 버튼. */
export function SeeBookableSheetButton({
  lang,
  href,
  onClick,
}: {
  lang: Lang;
  href?: string;
  onClick?: () => void;
}) {
  const { kicker, main } = seeBookableLabels(lang);
  const inner = (
    <>
      <span className="text-[11.5px] font-bold opacity-70 leading-tight">{kicker}</span>
      <span className="text-[14px] font-black leading-tight">{main} →</span>
    </>
  );
  const cls = `${BTN} mt-2 w-full flex-col gap-0.5 py-2.5 px-2`;
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}
