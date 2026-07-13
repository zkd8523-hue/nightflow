import Image from "next/image";
import { MapPin, ExternalLink } from "lucide-react";
import { DrinkMenuViewer } from "@/components/clubs/DrinkMenuViewer";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";
import { clubFeatureLabels } from "@/lib/clubs/tagLabelsI18n";
import { type Lang, makeT, areaLabel as areaI18n } from "@/lib/i18n";

export type GoogleReview = {
  author_name: string | null;
  rating: number | null;
  relative_time: string | null;
  text: string | null;
};

export type ForeignClubDetail = {
  id: string;
  name: string;
  /** 외국인 트랙 표시용 이름. NULL이면 name(한글) 그대로 사용 — displayClubName() 참고 */
  name_en?: string | null;
  area: string;
  address: string | null;
  thumbnail_url: string | null;
  drink_menu_url: string | null;
  drink_menu_updated_at: string | null;
  drink_menu_urls: string[] | null;
  floor_plan_url: string | null;
  floor_plan_urls: string[] | null;
  operating_hours: string | null;
  entry_fee_detail: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  instagram: string | null;
  dresscode: string | null;
  tags: string[] | null;
  google_reviews: GoogleReview[] | null;
  /** club_partners에 담당 MD가 있는지 — "Recommend" 정렬용 (표시용 아님, 옵셔널) */
  has_md?: boolean;
};

// 레거시 스톱갭 — DB clubs.name_en(Migration 460)이 진짜 소스. 아직 값 안 채운 클럽만 여기로 fallback.
// name_en이 채워지면 이 표는 안 쓰이니 자연히 죽는 코드가 됨 (지금은 안전망으로 유지).
const CLUB_NAME_EN_FALLBACK: Record<string, string> = {
  "컬러 압구": "Color Apgu",
  "컬러압구": "Color Apgu",
  "도깨비": "Dokkebi",
  "K-bat 빠따": "K-Bat",
  "K-bat빠따": "K-Bat",
};

/** 외국인 트랙 표시용 클럽명 — name_en(DB) → 레거시 하드코딩 fallback → name(한글) 순. */
export function displayClubName(club: Pick<ForeignClubDetail, "name" | "name_en">): string {
  return club.name_en?.trim() || CLUB_NAME_EN_FALLBACK[club.name.trim()] || club.name;
}

/**
 * 외국인 트랙 클럽 상세 정보 패널 (컨시어지 "Browse clubs" 팝업 전용, 꾹 눌러서 오픈).
 * ⚠️ src/components/clubs/ClubDetailContent.tsx(한국어 /clubs/[id] 페이지 본체, 완전히 다른 컴포넌트)와 이름 헷갈리지 말 것.
 * CTA(이 클럽 선택하기 등)는 caller가 `cta`로 주입.
 */
export function ForeignClubDetailPanel({
  club,
  lang,
  cta,
}: {
  club: ForeignClubDetail;
  lang: Lang;
  cta: React.ReactNode;
}) {
  const t = makeT(lang);
  const googleReviewsLabel = t("구글 리뷰", "Google reviews", "Googleレビュー", "谷歌评价");
  const googleLabel = t("구글", "Google", "Google", "Google");
  const searchReviewsLabel = t("구글에서 리뷰 검색", "Search reviews on Google", "Googleでレビュー検索", "在谷歌搜索评价");

  const hasDrinkMenu = club.drink_menu_url || (club.drink_menu_urls && club.drink_menu_urls.length > 0);
  // 구글 지도 검색은 실제 등록명(한글)이 정확도 높음 — 표시명(name_en)과 분리
  const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, lang);
  const name = displayClubName(club);

  return (
    <div className="pb-8">
      {club.thumbnail_url && (
        <div className="relative w-full h-48">
          <Image src={club.thumbnail_url} alt={name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 512px" />
        </div>
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-black text-[20px] text-white leading-tight">{name}</p>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
            {areaI18n(club.area, lang)}
          </span>
        </div>

        {club.google_rating != null && (
          <a href={googleUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-amber-400 hover:text-amber-300 transition-colors">
            ⭐ {club.google_rating.toFixed(1)}
            {club.google_review_count != null && (
              <span className="text-neutral-500">· {club.google_review_count.toLocaleString()} {googleReviewsLabel} →</span>
            )}
          </a>
        )}

        {/* 구글 리뷰 미리보기 — 최대 5개, ingest-google-ratings.mjs가 월 1회 갱신(영어 자동번역) */}
        {club.google_reviews && club.google_reviews.length > 0 && (
          <div className="-mx-5 px-5 flex gap-2.5 overflow-x-auto no-scrollbar snap-x">
            {club.google_reviews.map((r, i) => (
              <div
                key={i}
                className="shrink-0 w-[220px] snap-start rounded-xl bg-neutral-900 border border-neutral-800 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-amber-400">
                    {"★".repeat(Math.round(r.rating ?? 0))}
                    <span className="text-neutral-700">{"★".repeat(5 - Math.round(r.rating ?? 0))}</span>
                  </span>
                  {r.relative_time && (
                    <span className="text-[10px] text-neutral-600 shrink-0">{r.relative_time}</span>
                  )}
                </div>
                {r.text && (
                  <p className="text-[12px] text-neutral-300 leading-relaxed line-clamp-5">{r.text}</p>
                )}
                {r.author_name && (
                  <p className="text-[11px] text-neutral-600 truncate">— {r.author_name}, {googleLabel}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 주소 + 구글맵 — 외국인은 카카오맵을 못 쓰므로 구글맵으로. 여행자에게 위치는 최우선 정보. */}
        {club.address && (
          <a
            href={getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, lang)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[13px] text-neutral-400 hover:text-white transition-colors group"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{club.address}</span>
            <ExternalLink className="w-3 h-3 shrink-0 text-neutral-500 group-hover:text-white" aria-hidden="true" />
          </a>
        )}
        {club.entry_fee_detail && (
          <p className="text-[13px] text-neutral-400">🎟️ {translateClubMeta(club.entry_fee_detail, lang)}</p>
        )}
        {club.operating_hours && (
          <p className="text-[13px] text-neutral-400">🕐 {translateClubMeta(club.operating_hours, lang)}</p>
        )}
        {club.dresscode && (
          <p className="text-[13px] text-neutral-400">👗 {translateClubMeta(club.dresscode, lang)}</p>
        )}
        {/* 특성 배지 — 타입·음악장르·흡연. 외국인이 취향 맞는 클럽 고르는 핵심 정보. */}
        {clubFeatureLabels(club.tags, lang).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {clubFeatureLabels(club.tags, lang).map((label) => (
              <span
                key={label}
                className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300"
              >
                {label}
              </span>
            ))}
          </div>
        )}
        {club.instagram && (
          <a href={`https://instagram.com/${club.instagram}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center text-[13px] text-blue-400 hover:text-blue-300 transition-colors">
            @{club.instagram}
          </a>
        )}

        {hasDrinkMenu && (
          <DrinkMenuViewer
            urls={club.drink_menu_urls ?? undefined}
            url={club.drink_menu_url}
            updatedAt={club.drink_menu_updated_at ?? null}
            clubName={name}
            floorPlanUrl={club.floor_plan_url}
            floorPlanUrls={club.floor_plan_urls ?? undefined}
            lang={lang}
          />
        )}

        {cta}

        {/* 별점 있는 클럽은 상단 링크(별점+리뷰수)로 충분 → 하단 버튼 중복 제거.
            별점 없는 클럽만 정보 접근용 fallback으로 노출. */}
        {club.google_rating == null && (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-[14px] font-bold text-neutral-200 hover:bg-neutral-700/60 transition-colors"
          >
            🔍 {searchReviewsLabel}
          </a>
        )}
      </div>
    </div>
  );
}
