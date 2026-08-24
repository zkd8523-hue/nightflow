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

  // 외국인 컨시어지 폼용 클럽 목록 (강남·홍대·이태원, 썸네일 있는 것 — /en 클럽과 동일 필터).
  // ClubsClient(/en/clubs)와 동일한 전체 필드 — "Browse clubs" 팝업의 클럽상세 시트에서 재사용.
  // club_partners 조인 → has_md("Recommend" 정렬: 담당 MD 있는 클럽 우선, 그다음 리뷰 많은 순).
  let foreignClubs: ForeignClubDetail[] = [];
  if (isForeigner) {
    const { data } = await supabase
      .from("clubs")
      .select(
        "id, name, name_en, area, address, thumbnail_url, drink_menu_url, drink_menu_updated_at, drink_menu_urls, floor_plan_url, floor_plan_urls, operating_hours, entry_fee_detail, google_rating, google_review_count, instagram, dresscode, tags, google_reviews, featured_rank, partners:club_partners(md_id)"
      )
      .in("area", ["강남", "홍대", "이태원"])
      .is("deleted_at", null)
      .eq("is_test", false)
      .eq("hidden_from_guide", false)
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
            {/* 제목=결과, 부제=무엇을 하면 무슨 일이 일어나는지 + 여러 개 고를 이유("up to 5"의 근거).
                이전 문구는 제목·부제가 "클럽을 고르세요"를 두 번 말하고 이유를 안 줬음. */}
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              {t(
                "서울의 밤 예약하기",
                "Book your Seoul night",
                "ソウルの夜を予約",
                "预订你的首尔夜晚"
              )}
            </h1>
            <p className="text-muted-foreground text-sm font-medium mt-1 break-keep leading-relaxed">
              {t(
                "가고 싶은 클럽을 고르면 우리가 직접 연락해 테이블을 잡아드려요. 여러 곳 고를수록 붐비는 날 성공률이 올라가요.",
                "Pick the clubs you want — we contact them directly and lock in your table, in English. More picks, better odds on a busy night.",
                "行きたいクラブを選べば、私たちが直接連絡してテーブルを確保します。複数選ぶほど、混雑する日に取れる可能性が上がります。",
                "选好想去的夜店,我们直接联系并帮你锁定卡座。多选几家,人多的日子成功率更高。"
              )}
            </p>
          </div>
        )}

        {isForeigner ? (
          <ForeignRequestForm
            userId={user?.id ?? null}
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
