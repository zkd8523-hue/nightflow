import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NightFlow — Clubs in Seoul bid for your night",
  description:
    "Tell NightFlow your night — date, budget, crew. Clubs in Gangnam & Hongdae send you private offers. You pick the best. No booking fee, no agency.",
  openGraph: {
    title: "NightFlow — Clubs in Seoul bid for your night",
    description:
      "Post your plan, get private offers from Seoul clubs, pick the best. No booking fee.",
    locale: "en_US",
  },
};

const STEPS = [
  {
    n: "1",
    emoji: "🚩",
    title: "Plant your flag",
    body: "Tell us your night — the date, your budget, how many of you. That's it. No need to know a single club.",
  },
  {
    n: "2",
    emoji: "💌",
    title: "Clubs bid for you",
    body: "Clubs in Gangnam & Hongdae send you private offers — tailored packages, just for you. They never see each other's bids.",
  },
  {
    n: "3",
    emoji: "🎉",
    title: "Pick the best",
    body: "Accept the offer you like. Message the club directly on Instagram and show your passport at the door (19+).",
  },
];

export default function EnglishLanding() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-lg mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <header className="space-y-5 text-center">
          <p className="text-[13px] font-bold tracking-[0.25em] text-neutral-500 uppercase">
            Seoul Nightlife
          </p>
          <h1 className="text-4xl font-black tracking-tight leading-tight">
            Seoul clubs
            <br />
            bid for your night
          </h1>
          <p className="text-[15px] text-neutral-400 leading-relaxed">
            Don&apos;t know which club to pick? Don&apos;t. Just tell us your
            plan, and clubs in Gangnam &amp; Hongdae compete to host you — with
            private offers only you can see.
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
                  <p className="font-bold text-[15px]">
                    {s.emoji} {s.title}
                  </p>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why secret offers */}
        <section className="space-y-4 text-center">
          <h2 className="text-2xl font-black tracking-tight">
            Private offers, real competition
          </h2>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Every offer is yours alone — clubs can&apos;t see what the others
            offered. So they compete on the deal, not the noise. You get the
            best night for your budget.
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
            No booking fee. You deal with the club directly.
            <br />
            19+ only · Bring your passport · Make the night more beautiful.
          </p>
        </section>
      </div>
    </div>
  );
}
