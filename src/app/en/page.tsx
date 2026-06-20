import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NightFlow — The easy way into Seoul's clubs",
  description:
    "No club connections? No problem. Tell NightFlow your plan and clubs in Gangnam & Hongdae send you private, fair-price offers. Best tables, no broker, no guesswork.",
  openGraph: {
    title: "NightFlow — The easy way into Seoul's clubs",
    description:
      "Best tables, fair prices, no broker. Clubs in Seoul send you private offers.",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

// 외국인이 한국 클럽에서 겪는 진짜 고통 3가지
const PAINS = [
  {
    icon: "🤷",
    title: "Which club is even good?",
    body: "You don't speak the scene. Reviews are in Korean. You have no idea which club fits your night.",
  },
  {
    icon: "💸",
    title: "Is this price fair?",
    body: "Walk-in or broker, you never know if you're being overcharged. No way to compare, no way to haggle.",
  },
  {
    icon: "🚷",
    title: "Stuck with touts & brokers",
    body: "Street touts, shady middlemen, hidden fees. You just want a great table without the hassle.",
  },
];

// 깃발 3단계 — 위 3고통의 해결
const STEPS = [
  {
    n: "1",
    title: "Tell us your plan",
    body: "Date, budget, how many of you. That's it — no need to know a single club name.",
  },
  {
    n: "2",
    title: "Clubs come to you",
    body: "Clubs in Gangnam & Hongdae send private offers — real packages at real prices. They compete; you compare.",
  },
  {
    n: "3",
    title: "Pick & walk in like a VIP",
    body: "Accept the offer you like, message the club on Instagram, show your passport at the door (19+).",
  },
];

export default function EnglishLanding() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        {/* Brand */}
        <div className="text-center">
          <span className="text-2xl font-black tracking-tight text-white">
            NightFlow
          </span>
        </div>

        {/* Hero */}
        <header className="space-y-5 text-center">
          <h1 className="text-[34px] font-black tracking-tight leading-[1.15]">
            The easy way into
            <br />
            Seoul&apos;s best clubs
          </h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">
            No connections, no Korean, no broker. Tell us your night and clubs
            come to you — with the best tables at fair, upfront prices.
          </p>
          <div className="pt-3">
            <Link
              href="/login?lang=en"
              className="block w-full py-4 rounded-xl bg-white text-black font-black text-base hover:bg-neutral-200 transition-colors"
            >
              🚩 Plant your flag
            </Link>
          </div>
        </header>

        {/* Pain — Sound familiar? */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-center">
            Sound familiar?
          </h2>
          <div className="space-y-4">
            {PAINS.map((p) => (
              <div
                key={p.title}
                className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800"
              >
                <div className="shrink-0 text-2xl leading-none pt-0.5">
                  {p.icon}
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px] text-neutral-200">
                    {p.title}
                  </p>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[14px] text-neutral-400">
            NightFlow fixes all three. Here&apos;s how.
          </p>
        </section>

        {/* How it works */}
        <section className="space-y-6">
          <h2 className="text-[13px] font-bold tracking-[0.2em] text-neutral-500 uppercase text-center">
            How it works
          </h2>
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="flex gap-4 p-5 rounded-2xl bg-[#1C1C1E] border border-neutral-800"
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-white text-black font-black flex items-center justify-center">
                  {s.n}
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[15px]">{s.title}</p>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust — private offers */}
        <section className="space-y-4 text-center">
          <h2 className="text-2xl font-black tracking-tight">
            Fair prices, in the open
          </h2>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Every offer is private — clubs can&apos;t see each other&apos;s
            bids, so they compete on the deal, not on who shouts loudest. You
            see the price upfront and pay the club directly. No booking fee, no
            broker cut.
          </p>
        </section>

        {/* CTA */}
        <section className="space-y-3 pt-2">
          <Link
            href="/login?lang=en"
            className="block w-full py-4 rounded-xl bg-white text-black font-black text-base text-center hover:bg-neutral-200 transition-colors"
          >
            Sign up with Google or Apple
          </Link>
          <p className="text-[12px] text-neutral-600 text-center leading-relaxed">
            19+ only · Bring your passport to the venue.
            <br />
            Make the night more beautiful.
          </p>
        </section>
      </div>
    </div>
  );
}
