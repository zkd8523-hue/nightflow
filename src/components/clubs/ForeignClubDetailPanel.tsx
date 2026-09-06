import Image from "next/image";
import { MapPin, ExternalLink } from "lucide-react";
import { DrinkMenuViewer } from "@/components/clubs/DrinkMenuViewer";
import { SaveClubButton } from "@/components/clubs/SaveClubButton";
import { getGoogleReviewsUrl } from "@/lib/utils/clubReviews";
import { translateClubMeta } from "@/lib/utils/clubMetaI18n";
import { clubFeatureLabels } from "@/lib/clubs/tagLabelsI18n";
import { clubTagline } from "@/lib/clubs/bookable";
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
  /** 주대 등록 여부. has_md와 둘 다 true여야 실제로 예약을 잡아줄 수 있다. */
  has_menu?: boolean;
  /** 한 줄 소개(Migration 650) — 언어별로 따로 쓴 문장. */
  tagline_ko?: string | null;
  tagline_en?: string | null;
  tagline_ja?: string | null;
  tagline_zh?: string | null;
  tagline_zh_tw?: string | null;
  /** 상위노출 랭크 — 지역 내 "고정 노출 위치"(1-based). Recommend 정렬에서만 적용. (Promoted Listings) */
  featured_rank?: number | null;
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
  showSave = true,
}: {
  club: ForeignClubDetail;
  lang: Lang;
  cta: React.ReactNode;
  /** 찜(하트) 버튼 노출. 이미 "선택하기" 액션이 있는 컨시어지 폼에서는 중복이라 끔. */
  showSave?: boolean;
}) {
  const t = makeT(lang);
  const googleReviewsLabel = t("구글 리뷰", "Google reviews", "Googleレビュー", "谷歌评价");
  const googleLabel = t("구글", "Google", "Google", "Google");
  const searchReviewsLabel = t("구글에서 리뷰 검색", "Search reviews on Google", "Googleでレビュー検索", "在谷歌搜索评价");

  const hasDrinkMenu = club.drink_menu_url || (club.drink_menu_urls && club.drink_menu_urls.length > 0);
  // 구글 지도 검색은 실제 등록명(한글)이 정확도 높음 — 표시명(name_en)과 분리
  const googleUrl = getGoogleReviewsUrl({ name: club.name, address: club.address, area: club.area }, lang);
  const name = displayClubName(club);
  // 홈 그리드에서는 이 문구를 뺐다(2026-09-06) — 훑어보는 화면에서는 노이즈였다.
  // 클릭해서 관심을 보인 뒤인 여기 상세 시트에서만 보여준다.
  const tagline = clubTagline(club, lang);

  return (
    <div>
      {club.thumbnail_url && (
        <div className="relative w-full h-48">
          <Image src={club.thumbnail_url} alt={name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 512px" />
        </div>
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* 클럽명이 이 시트에서 가장 중요한 정보인데 20px/13px는 소개 문구와
                무게 차이가 거의 없었다(2026-09-06 지적). 이름을 확실히 키우고
                소개 문구는 크기·색을 더 낮춰 한눈에 위계가 갈리게 한다. */}
            <p className="font-black text-[26px] text-foreground leading-[1.15] tracking-tight break-keep">{name}</p>
            {tagline && (
              <p className="text-[12.5px] text-muted-foreground/70 mt-1.5 leading-snug break-keep">{tagline}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {areaI18n(club.area, lang)}
          </span>
        </div>


        {club.google_rating != null && (
          <a href={googleUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-brand-amber hover:text-brand-amber transition-colors">
            ⭐ {club.google_rating.toFixed(1)}
            {club.google_review_count != null && (
              <span className="text-muted-foreground">· {club.google_review_count.toLocaleString()} {googleReviewsLabel} →</span>
            )}
          </a>
        )}

        {/* 구글 리뷰 미리보기 — 최대 5개, ingest-google-ratings.mjs가 월 1회 갱신(영어 자동번역).
            평점 높은 순으로 보여준다 — 구글이 주는 순서는 뒤죽박죽이라 첫 카드가 1점짜리면
            클럽을 열어본 사람이 바로 닫는다(카드→예약 전환이 병목이었음). */}
        {club.google_reviews && club.google_reviews.length > 0 && (
          <div className="-mx-5 px-5 flex gap-2.5 overflow-x-auto no-scrollbar snap-x">
            {[...club.google_reviews]
              .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
              .map((r, i) => (
              <div
                key={i}
                className="shrink-0 w-[220px] snap-start rounded-xl bg-card border border-border p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-brand-amber">
                    {"★".repeat(Math.round(r.rating ?? 0))}
                    <span className="text-muted-foreground">{"★".repeat(5 - Math.round(r.rating ?? 0))}</span>
                  </span>
                  {r.relative_time && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{r.relative_time}</span>
                  )}
                </div>
                {r.text && (
                  <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-5">{r.text}</p>
                )}
                {r.author_name && (
                  <p className="text-[11px] text-muted-foreground truncate">— {r.author_name}, {googleLabel}</p>
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
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors group"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{club.address}</span>
            <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
          </a>
        )}
        {club.entry_fee_detail && (
          <p className="text-[13px] text-muted-foreground">🎟️ {translateClubMeta(club.entry_fee_detail, lang)}</p>
        )}
        {club.operating_hours && (
          <p className="text-[13px] text-muted-foreground">🕐 {translateClubMeta(club.operating_hours, lang)}</p>
        )}
        {club.dresscode && (
          <p className="text-[13px] text-muted-foreground">👗 {translateClubMeta(club.dresscode, lang)}</p>
        )}
        {/* 특성 배지 — 타입·음악장르·흡연. 외국인이 취향 맞는 클럽 고르는 핵심 정보. */}
        {clubFeatureLabels(club.tags, lang).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {clubFeatureLabels(club.tags, lang).map((label) => (
              <span
                key={label}
                className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-foreground/80"
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

        {/* 별점 있는 클럽은 상단 링크(별점+리뷰수)로 충분 → 하단 버튼 중복 제거.
            별점 없는 클럽만 정보 접근용 fallback으로 노출. */}
        {club.google_rating == null && (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-3 rounded-xl bg-muted border border-border text-[14px] font-bold text-foreground hover:bg-muted/60 transition-colors"
          >
            🔍 {searchReviewsLabel}
          </a>
        )}
      </div>

      {/* CTA — 클럽마다 리뷰·태그 등 위쪽 콘텐츠 길이가 달라 본문 흐름 안에 두면 버튼이
          안 보이거나(스크롤 필요) 위치가 계속 바뀜. 시트 스크롤 컨테이너 하단에 고정. */}
      <div className="sticky bottom-0 px-5 pt-3 pb-5 bg-card/95 backdrop-blur-sm border-t border-border">
        {showSave ? (
          // 예약(8) : 찜(2). 찜을 예약 버튼 바로 옆에 둬야 "지금은 아니지만 기억해두기"가
          // 예약과 동등한 선택지로 보임 — 상세 상단에 있으면 스크롤 밖으로 밀려 안 눌림.
          <div className="flex items-stretch gap-2">
            <div className="flex-[8] min-w-0">{cta}</div>
            <SaveClubButton
              variant="cta"
              className="flex-[2] min-w-0 mt-2"
              club={{
                id: club.id,
                name: club.name,
                name_en: club.name_en,
                area: club.area,
                thumbnail_url: club.thumbnail_url,
              }}
              lang={lang}
            />
          </div>
        ) : (
          cta
        )}
      </div>
    </div>
  );
}
