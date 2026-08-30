import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy — NightFlow Seoul" },
  description: "NightFlow Privacy Policy summary in English. Full policy available in Korean.",
  alternates: {
    canonical: "https://nightflow.kr/en/privacy",
    languages: {
      "ko-KR": "https://nightflow.kr/privacy",
      "en-US": "https://nightflow.kr/en/privacy",
    },
  },
};

export default function EnPrivacyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/en" className="text-[14px] text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            Privacy Policy (Summary)
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-brand-amber leading-relaxed">
          <p className="font-bold mb-2">Full Policy in Korean</p>
          <p>
            The legally binding full privacy policy is in Korean:{" "}
            <Link href="/privacy" className="underline hover:text-brand-amber">
              nightflow.kr/privacy
            </Link>
          </p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-6 text-foreground/80 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">1. Data We Collect</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Account information: nickname, date of birth, email (via Kakao/Google OAuth)</li>
              <li>Profile information: nickname, profile photo</li>
              <li>Transaction data: reservations, payments, refunds</li>
              <li>Communication records with MDs and customer support</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">2. Payment Data (Important)</h2>
            <p>
              NightFlow does NOT store your credit card information directly. All payment
              data is handled by PCI DSS compliant payment processors:
            </p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Eximbay (Korea-based, certified PG)</li>
              <li>VISA, MasterCard, JCB, AMEX, UnionPay</li>
              <li>WeChat Pay, Alipay+, PayPal</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">3. How We Use Your Data</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Account management and authentication</li>
              <li>Matching with Korean nightclub managers (MDs)</li>
              <li>Payment processing and settlement</li>
              <li>Customer support and dispute resolution</li>
              <li>Service improvements and analytics</li>
              <li>Marketing communications (with your consent)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">4. Data Sharing</h2>
            <p>We share data only with:</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Matched club MDs (limited to reservation details)</li>
              <li>Payment processors (Eximbay, etc.)</li>
              <li>Korean tax authorities when legally required</li>
            </ul>
            <p className="text-[13px] text-muted-foreground mt-2">
              We do NOT sell your personal data to third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">5. Data Retention</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Account data: until account deletion + 30 days recovery period</li>
              <li>Transaction records: 5 years (Korean tax law)</li>
              <li>Communication logs: 3 years</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">6. Your Rights</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request account deletion (soft delete + 30 day recovery)</li>
              <li>Withdraw consent for marketing</li>
              <li>Data portability (export your data)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">7. Security</h2>
            <p>
              We use industry-standard encryption (HTTPS, TLS) and follow Korean Personal
              Information Protection Act (PIPA) requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">8. Contact</h2>
            <p>
              For privacy inquiries: <a href="mailto:maddawids@gmail.com" className="text-brand-amber underline">maddawids@gmail.com</a>
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-border">
            <p className="text-[13px] text-muted-foreground">
              This is an English summary. For legal purposes, the Korean version takes precedence.
              Effective from June 30, 2026.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
