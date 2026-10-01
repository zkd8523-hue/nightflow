// "Night Activities" 공용 조각(서버 컴포넌트). 클릭 계측은 ForeignPageTracker의
// data-nf-track 위임 리스너가 받는다 — book_cta(나플 예약) / viator_tour(제휴) / route / safety.
import Link from "next/link";
import { type Tour, tourHref, img, PLAN_BASE } from "@/lib/planMemory/content";

export function Trust() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {["Zero fee", "No card needed", "No signup", "Pay at club"].map((x) => (
        <div key={x} className="rounded-xl bg-card border border-border py-2 text-center text-[12px] font-bold">
          <span className="block text-green-400 text-[13px]">✓</span>
          {x}
        </div>
      ))}
    </div>
  );
}

/** 실제 예약 폼(ForeignRequestForm)의 흐름 그대로 — 연락 수단 5종, 결제는 클럽 현장. 응답 시간 약속은 없다. */
export function HowBooking() {
  return (
    <div className="rounded-2xl bg-card border border-border px-4 py-3 text-[13px]">
      <p className="font-black">How booking works</p>
      <ol className="mt-1.5 list-decimal pl-5 space-y-0.5 text-foreground/90">
        <li>Pick date, group size, budget</li>
        <li>Leave WhatsApp, LINE, WeChat, Instagram or email</li>
        <li>We contact the club and message you back</li>
        <li>Pay at the club — no card now</li>
      </ol>
    </div>
  );
}

export function BookCta({ href, label, track = "book_cta" }: { href: string; label: string; track?: string }) {
  return (
    <Link
      rel="nofollow"
      data-nf-track={track}
      href={href}
      className="block w-full py-4 rounded-full bg-brand-amber text-black font-black text-[16px] text-center hover:opacity-90 transition-opacity"
    >
      🍾 {label}
    </Link>
  );
}

export function SecondaryCta({ href, label, track = "book_cta_secondary" }: { href: string; label: string; track?: string }) {
  return (
    <Link
      rel="nofollow"
      data-nf-track={track}
      href={href}
      className="block w-full py-3 rounded-full bg-card border border-border font-bold text-[14px] text-center hover:border-foreground/30 transition-colors"
    >
      {label}
    </Link>
  );
}

export function SafetyLink({ label = "🛟 Last train · taxi · help numbers →" }: { label?: string }) {
  return (
    <Link
      data-nf-track="safety"
      href={`${PLAN_BASE}/getting-around`}
      className="block rounded-xl px-4 py-3 bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 font-bold text-[13px]"
    >
      {label}
    </Link>
  );
}

export function Hero({ src, alt, caption, credit }: { src: string; alt: string; caption: string; credit?: string }) {
  return (
    <figure className="relative rounded-2xl overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img(src)} alt={alt} className="w-full aspect-[21/9] object-cover" loading="eager" />
      <figcaption className="absolute right-2 bottom-1.5 text-[10px] text-white/85 bg-black/50 px-1.5 py-0.5 rounded">
        {caption}
        {credit ? ` · ${credit} / Unsplash` : ""}
      </figcaption>
    </figure>
  );
}

export function TourCards({ tours, campaign, compact = false }: { tours: Tour[]; campaign: string; compact?: boolean }) {
  return (
    <div className={`grid gap-2.5 ${compact ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"}`}>
      {tours.map((t) => (
        <a
          key={t.id}
          href={tourHref(t, campaign)}
          target="_blank"
          rel="sponsored nofollow noopener"
          data-nf-track={`viator_tour:${t.id}`}
          className="flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-foreground/30 transition-colors"
        >
          <div className="relative aspect-[4/3] bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${img(t.image, 600)})` }}>
            <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-bold text-white">{t.badge}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <p className={`font-bold leading-snug ${compact ? "text-[12.5px]" : "text-[14px]"}`}>{t.title}</p>
            {!compact && <p className="flex-1 text-[12px] text-muted-foreground">{t.desc}</p>}
            <div className={`mt-1 flex ${compact ? "flex-col items-start gap-1.5" : "items-center justify-between"}`}>
              {t.priceKrw || t.priceUsd ? (
                <span className="font-black text-[14px]">
                  <span className="mr-0.5 text-[10.5px] font-semibold text-muted-foreground">from about</span>
                  {t.priceKrw ? `₩${t.priceKrw.toLocaleString("en-US")}` : `US$${t.priceUsd}`}
                </span>
              ) : (
                <span className="text-[11.5px] font-semibold text-muted-foreground">Price on tour page</span>
              )}
              <span className="rounded-full bg-white px-2.5 py-1 text-[11.5px] font-black text-black">See tour →</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

export function ViatorNote() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Tours are booked on Viator (partner link — NightFlow may earn a commission). Prices rounded from Viator listings, Oct 1 2026 — the tour page shows today&apos;s price.
    </p>
  );
}

export function Tabs({ active }: { active: "routes" | "tours" | "getting" }) {
  const tabs = [
    { key: "tours", label: "Tours", href: PLAN_BASE },
    { key: "routes", label: "Night routes", href: `${PLAN_BASE}/night-routes` },
    { key: "getting", label: "Getting around", href: `${PLAN_BASE}/getting-around` },
  ] as const;
  return (
    <nav className="flex gap-1 border-b border-border overflow-x-auto no-scrollbar">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`whitespace-nowrap px-3 py-2 text-[13.5px] font-bold ${active === t.key ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Crumb({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-[12px] text-muted-foreground hover:text-foreground">
      ← {label}
    </Link>
  );
}
