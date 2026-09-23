import { makeT, type Lang } from "@/lib/i18n";
import { getAreaProfile } from "@/lib/clubs/areaProfile";

// 지역 페이지 상단 "이 지역은 이런 곳" — 인용 슬라이드 → ✓ 맞는 사람 → ✗ 아닌 사람(있을 때만).
//
// 배경(2026-09-23): 지역 페이지의 intro/vibe 산문은 전부 sr-only라 화면에 아무것도 없었다.
// 지역을 누르면 클럽 그리드만 떴다. 오가닉 세션 271건 실측 — 클럽 상세는 잘 읽는데(이탈 3%)
// 어느 지역이 자기한테 맞는지 판단할 근거가 없어 못 고르고 나갔다. 이 블록이 그 답이다.
//
// 인용이 맨 위인 이유: 첫 줄부터 "남이 한 말"이라 우리 주장으로 시작하지 않는다. ✓/✗는
// 우리가 단정하는 결론이고, 인용이 그 영수증. 인용은 클럽 상세의 구글 리뷰 캐러셀과 같은
// 스냅 스크롤 — 여러 개를 넘겨보면 "우리가 고른 한 마디"가 아니라 "사람들이 이렇게 말한다"가 된다.
//
// 데이터·사실 확인 메모는 lib/clubs/areaProfile.ts 상단. 서버 컴포넌트 — 훅 없음.
export function AreaProfile({ slug, lang }: { slug: string; lang: Lang }) {
  const p = getAreaProfile(slug, lang);
  if (!p) return null;
  const t = makeT(lang);
  const hasSkip = p.skip.length > 0;

  return (
    <section className="px-4 pt-4 pb-1 space-y-3" aria-label={t("지역 소개", "About this area", "このエリアについて", "关于这个区域", "關於這個區域")}>
      {/* 인용 슬라이드 — 한 번에 하나만(2026-09-23: 3개를 나란히 보여주니 노이즈였다).
          점으로 "더 있다"는 신호만 남긴다. */}
      <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {p.quotes.map((q, i) => (
          <blockquote
            key={i}
            className="shrink-0 w-full snap-start rounded-r-xl border-l-[3px] border-amber-500 bg-card px-4 py-3 space-y-1.5"
          >
            <p className="text-[13px] leading-relaxed text-foreground">"{q.text}"</p>
            <cite className="block not-italic text-[11px] text-muted-foreground">— {q.source}</cite>
          </blockquote>
        ))}
      </div>
      {p.quotes.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 -mt-1">
          {p.quotes.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === 0 ? "w-4 bg-amber-500" : "w-1.5 bg-border"}`} />
          ))}
        </div>
      )}

      {/* ✓ / ✗ — ✗가 없으면 ✓가 전체 폭. "안 되는 게 없는 지역"이 구조로 보인다. */}
      <div className={`grid gap-2.5 ${hasSkip ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-xl bg-card border border-emerald-500/40 px-3.5 py-3">
          <p className="text-[12px] font-extrabold text-emerald-400 mb-1.5">
            ✓ {t("이런 분께 맞아요", "You'll fit here if", "こんな人に合う", "适合这样的你", "適合這樣的你")}
          </p>
          <ul className="list-disc pl-4 text-[13px] leading-relaxed space-y-0.5">
            {p.fit.map((line, i) => (
              <li key={i} className={i === 0 ? "font-bold" : undefined}>{line}</li>
            ))}
          </ul>
        </div>
        {hasSkip && (
          <div className="rounded-xl bg-card border border-red-400/35 px-3.5 py-3">
            <p className="text-[12px] font-extrabold text-red-400 mb-1.5">
              ✗ {t("이런 경우엔 다른 곳을", "Skip it if", "こんな場合は他へ", "这些情况请选别处", "這些情況請選別處")}
            </p>
            <ul className="list-disc pl-4 text-[13px] leading-relaxed space-y-0.5">
              {p.skip.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
