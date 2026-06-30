import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Terms of Service — NightFlow Seoul" },
  description: "NightFlow Terms of Service summary in English. Full terms available in Korean.",
  alternates: {
    canonical: "https://nightflow.kr/en/terms",
    languages: {
      "ko-KR": "https://nightflow.kr/terms",
      "en-US": "https://nightflow.kr/en/terms",
    },
  },
};

export default function EnTermsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/en" className="text-[14px] text-neutral-500 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-amber-500" />
            Terms of Service (Summary)
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-amber-300 leading-relaxed">
          <p className="font-bold mb-2">Full Terms in Korean</p>
          <p>
            The legally binding full terms are in Korean. View the full Korean version:{" "}
            <Link href="/terms" className="underline hover:text-amber-200">
              nightflow.kr/terms
            </Link>
          </p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6 text-neutral-300 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. Service Description</h2>
            <p>
              NightFlow (operated by MadDawid, Korea) is a Seoul nightclub reservation
              intermediary platform. We connect international visitors with Korean club
              managers (MDs) for table and VIP room reservations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. Eligibility</h2>
            <p>
              You must be 19 years or older (Korean legal drinking age) to use this service.
              By signing up, you confirm you meet this requirement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. Foreign User Payment (Escrow)</h2>
            <p>Foreign users (en/zh/ja language tracks) use prepayment via certified payment processors (Eximbay, etc.).</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Payment is held in escrow until visit confirmation</li>
              <li>NightFlow platform fee: 9% of transaction amount</li>
              <li>Remaining amount is settled to the MD after visit confirmation</li>
              <li>Refund policy: 48h before event 100%, 24-48h 50%, less than 24h or no-show 0%</li>
              <li>See full <Link href="/en/refund-policy" className="text-amber-400 underline">Refund Policy</Link></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. Booking & Cancellation</h2>
            <p>
              All reservations are subject to availability and confirmation by the club's MD.
              Cancellation rights and refund policy are detailed in the Refund Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. User Responsibilities</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Provide accurate personal information</li>
              <li>Arrive at the club at the agreed time</li>
              <li>Comply with club policies and Korean laws</li>
              <li>Pay any on-site expenses (additional drinks, food, etc.) directly to the club</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. Dispute Resolution</h2>
            <p>
              Disputes are first handled by NightFlow customer service. Unresolved disputes
              follow Korean law and may proceed to the Korea Consumer Agency or Electronic
              Commerce Dispute Resolution Committee.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">7. Governing Law</h2>
            <p>This service is operated from Republic of Korea and governed by Korean law.</p>
          </section>

          <section className="space-y-3 pt-6 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">
              This is an English summary. For legal purposes, the Korean version takes precedence.
              Effective from June 30, 2026.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
