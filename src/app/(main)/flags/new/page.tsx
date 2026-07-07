import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PuzzleForm } from "@/components/puzzles/PuzzleForm";
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
      description: "날짜·지역·예산 정하면 강남·홍대 클럽 MD들이 시크릿오퍼를 보내요.",
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
    "Get VIP offers",
    "VIPオファーを獲得",
    "获取 VIP 报价"
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
  searchParams: Promise<{ lang?: string; area?: string }>;
}) {
  const { lang: raw, area } = await searchParams;

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

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-lg mx-auto p-6">
        {/* 외국인은 글로벌 헤더가 숨겨지므로 폼 자체에 외국인 홈(/en, /ja, /zh) 복귀 링크 제공 */}
        {isForeigner && (
          <Link
            href={foreignHome}
            aria-label={t("뒤로", "Back", "戻る", "返回")}
            className="inline-flex items-center gap-1 -ml-1 mb-4 px-2 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[14px] font-bold">{t("뒤로", "Back", "戻る", "返回")}</span>
          </Link>
        )}

        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white tracking-tight">
            {t(
              "🚩 깃발",
              "Tell us your night",
              "あなたの夜を教えて",
              "告诉我们您的夜晚"
            )}
          </h1>
          <p className="text-neutral-500 text-sm font-medium mt-0.5 break-keep">
            {t(
              "예산만 정하면 클럽에서 시크릿오퍼를 제안해요",
              "Set your budget — Seoul's clubs send you private VIP offers",
              "予算を設定 — ソウルのクラブからプライベートVIPオファーが届きます",
              "设置预算 — 首尔的夜店为您发送专属 VIP 报价"
            )}
          </p>
        </div>

        <PuzzleForm userId={user.id} />
      </div>
    </div>
  );
}
