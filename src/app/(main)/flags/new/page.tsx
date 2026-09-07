import type { Metadata } from "next";
import { BackButton } from "@/components/foreign/BackButton";
import { FOREIGN_BOOKING_DRAFT_KEY } from "@/lib/utils/formDraft";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";
import { ForeignRequestForm } from "@/components/foreign/ForeignRequestForm";
import type { ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import { getLang, makeT } from "@/lib/i18n";
import { ForeignShell } from "@/components/foreign/ForeignShell";

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
        images: [{ url: "/og-image-v2.png", width: 1200, height: 630, alt: "나플 — 깃발 꽂기" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "깃발 꽂기 — 시크릿오퍼 받기",
        description: "예산만 정하면 클럽에서 시크릿오퍼를 보내요. 100% 기밀, 맞춤 패키지.",
        images: ["/og-image-v2.png"],
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
//
// TW·HK·MO는 번체(zh-tw)다 — 예전엔 CN과 함께 zh(간체)로 보냈는데, 대만 189만 명(방한 3위)과
// 홍콩 62만 명(5위)이 간체 화면을 받고 있었다. /zh-tw 라우트는 이미 있다.
function inferLangFromCountry(countryCode: string | null | undefined): "ko" | "en" | "ja" | "zh" | "zh-tw" | null {
  if (!countryCode) return null;
  const c = countryCode.toUpperCase();
  if (c === "KR") return "ko";
  if (c === "JP") return "ja";
  if (c === "CN") return "zh";
  if (c === "TW" || c === "HK" || c === "MO") return "zh-tw";
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

  // URL에 lang이 없어 country_code로 추론한 경우, URL 자체도 갱신해줘야 함 — 안 그러면
  // 루트 레이아웃의 <html lang>(미들웨어가 URL의 ?lang=만 보고 결정, 이 페이지의 추론 로직을 모름)이
  // 여전히 "ko"로 남아 날짜 입력 같은 브라우저 네이티브 UI가 한국어로 새는 버그가 있었음.
  if (!raw && inferred && inferred !== "ko") {
    const params = new URLSearchParams();
    params.set("lang", inferred);
    if (area) params.set("area", area);
    if (club) params.set("club", club);
    redirect(`/flags/new?${params.toString()}`);
  }

  // 한국어 트랙은 깃발 신규 생성 중단 — UI에서 진입점을 모두 제거했으므로 직접 URL 접근도 홈으로 보낸다.
  // 외국어 트랙(en/ja/zh)은 깃발(컨시어지 신청)이 유일한 예약 수단이라 그대로 통과시킨다.
  if (!isForeigner) redirect("/");

  // 외국인(컨시어지)은 로그인 없이 접근 — 익명 신청 허용(Mig 489). 이메일/WhatsApp만으로 신청.
  // 배경: 로그인 벽에서 80% 이탈(login_view 93 → 로그인 클릭 19). 외국인은 카카오 없고,
  //       소셜 로그인 강제 자체가 마찰 → 컨시어지 폼을 로그인 없이 열어줌.

  // 외국인 컨시어지 폼용 클럽 목록 (썸네일 있는 것 — /en 클럽과 동일 필터).
  // ClubsClient(/en/clubs)와 동일한 전체 필드 — "Browse clubs" 팝업의 클럽상세 시트에서 재사용.
  // club_partners 조인 → has_md("Recommend" 정렬: 담당 MD 있는 클럽 우선, 그다음 리뷰 많은 순).
  //
  // ⚠️ 폼에는 isBookable(MD + 주대) 클럽만 넘긴다. 외국인 트랙은 손님이 그 클럽의
  // 메뉴를 직접 담아 총액을 확정하는 구조라, 주대 없는 클럽을 고르면 예산을 손으로
  // 적게 되고(시세를 모르는 외국인에겐 그게 곧 이탈) 성사도 안 된다.
  // 카탈로그(/en/clubs 등)는 SEO 유입 통로라 그대로 두고, 예약 폼만 좁힌다.
  let foreignClubs: ForeignClubDetail[] = [];
  if (isForeigner) {
    const menuIds = await fetchMenuClubIds(supabase);
    const { data } = await supabase
      .from("clubs")
      .select(
        "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, open_dows, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, featured_rank, partners:club_partners(md_id)"
      )
      // 지역 화이트리스트(강남·홍대·이태원)는 뺐다(2026-09-07). 예약 가능 판정을
      // isBookable(MD + 주대)로 옮긴 뒤로 이 목록은 "예약 중개가 되는 곳" 그 자체라
      // 지역으로 또 거를 이유가 없다. 오히려 부산·대구·광주의 예약 가능한 클럽 6곳이
      // 조용히 빠져서, /en/clubs/busan 상세에서 "예약" CTA를 눌러 폼에 와도
      // presetClubId가 clubs에 없어 선택이 증발하고 클럽 선택창으로 떨어졌다.
      .is("deleted_at", null)
      .eq("is_test", false)
      .eq("hidden_from_guide", false)
      .not("thumbnail_url", "is", null)
      .order("google_review_count", { ascending: false, nullsFirst: false });
    foreignClubs = (data ?? [])
      .map((c) => ({
        ...c,
        has_md: (c.partners?.length ?? 0) > 0,
        has_menu: menuIds.has(c.id),
      }))
      .filter(isBookable);
  }

  return (
    <ForeignShell lang={lang}>
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg lg:max-w-[900px] mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* 외국인은 글로벌 헤더가 숨겨지므로 폼 자체에 외국인 홈(/en, /ja, /zh) 복귀 링크 제공 */}
        {isForeigner && (
          <BackButton
            label={t("뒤로", "Back", "戻る", "返回")}
            fallbackHref={foreignHome}
            guardDraftKey={FOREIGN_BOOKING_DRAFT_KEY}
          />
        )}

        {isForeigner ? (
          <ForeignRequestForm
            userId={user?.id ?? null}
            lang={lang}
            /* 표시 통화 추정용. /en에는 미국·홍콩·싱가포르가 섞여 있어
               lang만으로는 USD 하나로 뭉개진다. */
            countryCode={profile?.country_code ?? null}
            clubs={foreignClubs}
            presetArea={area}
            presetClubId={club}
          />
        ) : (
          <PuzzleForm userId={user.id} />
        )}
      </div>
    </div>
    </ForeignShell>
  );
}
