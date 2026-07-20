import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";
import { ForeignRequestForm } from "@/components/foreign/ForeignRequestForm";
import type { ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { getLang, makeT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; area?: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await searchParams;
  const lang = getLang(raw);
  if (lang === "ko") {
    return {
      title: "깃발 꽂기",
      description: "날짜·지역·예산 정하면 강남·홍대 클럽 파트너들이 시크릿오퍼를 보내요.",
      alternates: { canonical: "https://nightflow.kr/flags/new" },
      openGraph: {
        title: "깃발 꽂기 — 시크릿오퍼 받기",
        description: "예산만 정하면 클럽에서 시크릿오퍼를 보내요. 100% 기밀, 맞춤 패키지.",
        url: "https://nightflow.kr/flags/new",
        siteName: "나플",
        locale: "ko_KR",
        type: "website",
        images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "나플 — 깃발 꽂기" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "깃발 꽂기 — 시크릿오퍼 받기",
        description: "예산만 정하면 클럽에서 시크릿오퍼를 보내요. 100% 기밀, 맞춤 패키지.",
        images: ["/og-image.png"],
      },
    };
  }
  const t = makeT(lang);
  const title = t(
    "깃발 꽂기",
    "Book with NightFlow",
    "NightFlowで予約する",
    "通过 NightFlow 预订"
  );
  return { title: { absolute: `${title} | NightFlow` } };
}

// country_code → 언어 매핑. 회원가입 완료 후 lang 파라미터 없이 도착한 외국인을 위한 폴백.
// 실제 이탈 사례: en 유저 signup_completed 직후 /flags/new(lang 없음) → getLang="ko" → 한국어 폼.
function inferLangFromCountry(countryCode: string | null | undefined): "ko" | "en" | "ja" | "zh" | null {
  if (!countryCode) return null;
  const c = countryCode.toUpperCase();
  if (c === "KR") return "ko";
  if (c === "JP") return "ja";
  if (c === "CN" || c === "TW" || c === "HK" || c === "MO") return "zh";
  return "en"; // 그 외 국가는 영어 폴백
}

export default async function PuzzleNewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; area?: string; club?: string }>;
}) {
  const { lang: raw, area, club } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 로그인 유저의 country_code로 언어 폴백 (URL에 lang 없을 때만).
  // 외국인 유저가 회원가입 직후 /flags/new로 오는 흐름에서 한국어 폼 노출을 방지.
  let profile: { role: string | null; country_code: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("role, country_code")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const inferred = inferLangFromCountry(profile?.country_code);
  const lang = raw ? getLang(raw) : (inferred ?? getLang(raw));
  const isForeigner = lang !== "ko";
  const t = makeT(lang);
  // 외국인 트랙 홈 (lang에 따라 /en, /ja, /zh)
  const foreignHome = lang === "ko" ? "/en" : `/${lang}`;

  // 비로그인 → 로그인 후 깃발 등록으로 복귀(redirect 보존). 외국인은 lang(en/ja/zh) + area(강남 등) 유지.
  if (!user) {
    if (isForeigner) {
      const returnParams = new URLSearchParams();
      returnParams.set("lang", lang);
      if (area) returnParams.set("area", area);
      const returnPath = `/flags/new?${returnParams.toString()}`;
      redirect(`/login?lang=${lang}&redirect=${encodeURIComponent(returnPath)}`);
    }
    const koParams = new URLSearchParams();
    if (area) koParams.set("area", area);
    const koReturn = koParams.toString() ? `/flags/new?${koParams.toString()}` : "/flags/new";
    redirect(`/login?redirect=${encodeURIComponent(koReturn)}`);
  }

  if (profile?.role === "md") redirect("/?tab=puzzle");

  // 외국인 컨시어지 폼용 클럽 목록 (강남·홍대·이태원, 썸네일 있는 것 — /en 클럽과 동일 필터).
  // ClubsClient(/en/clubs)와 동일한 전체 필드 — "Browse clubs" 팝업의 클럽상세 시트에서 재사용.
  // club_partners 조인 → has_md("Recommend" 정렬: 담당 MD 있는 클럽 우선, 그다음 리뷰 많은 순).
  let foreignClubs: ForeignClubDetail[] = [];
  if (isForeigner) {
    const { data } = await supabase
      .from("clubs")
      .select(
        "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, partners:club_partners(md_id)"
      )
      .in("area", ["강남", "홍대", "이태원"])
      .is("deleted_at", null)
      .eq("is_test", false)
      .not("thumbnail_url", "is", null)
      .order("google_review_count", { ascending: false, nullsFirst: false });
    foreignClubs = (data ?? []).map((c) => ({
      ...c,
      has_md: (c.partners?.length ?? 0) > 0,
    }));
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 외국인은 글로벌 헤더가 숨겨지므로 폼 자체에 외국인 홈(/en, /ja, /zh) 복귀 링크 제공 */}
        {isForeigner && (
          <Link
            href={foreignHome}
            aria-label={t("뒤로", "Back", "戻る", "返回")}
            className="inline-flex items-center gap-1 -ml-1 mb-4 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[14px] font-bold">{t("뒤로", "Back", "戻る", "返回")}</span>
          </Link>
        )}

        {/* 외국인만 헤더 유지(자체 chrome이라 타이틀 필요). 한국인은 게이트/폼이 헤더 역할 */}
        {isForeigner && (
          <div className="mb-8">
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              {t(
                "🚩 깃발",
                "Pick your club",
                "クラブを選ぶ",
                "选择夜店"
              )}
            </h1>
            <p className="text-muted-foreground text-sm font-medium mt-0.5 break-keep">
              {t(
                "클럽 골라주면 우리가 연결해드려요",
                "Pick your clubs — we'll get you in",
                "クラブを選べば、私たちがつなぎます",
                "选好夜店,我们帮你连接"
              )}
            </p>
          </div>
        )}

        {isForeigner ? (
          <ForeignRequestForm
            userId={user.id}
            lang={lang}
            clubs={foreignClubs}
            presetArea={area}
            presetClubId={club}
          />
        ) : (
          <PuzzleForm userId={user.id} />
        )}
      </div>
    </div>
  );
}
