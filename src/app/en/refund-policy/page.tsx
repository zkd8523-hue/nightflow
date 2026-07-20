import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: { absolute: "Refund & Cancellation Policy — NightFlow Seoul" },
  description:
    "NightFlow refund and cancellation policy for foreign users. 48h before event: 100% refund. 24-48h: 50%. Less than 24h or no-show: 0%.",
  alternates: {
    canonical: "https://nightflow.kr/en/refund-policy",
    languages: {
      "ko-KR": "https://nightflow.kr/refund-policy",
      "en-US": "https://nightflow.kr/en/refund-policy",
      "zh-CN": "https://nightflow.kr/zh/refund-policy",
      "ja-JP": "https://nightflow.kr/ja/refund-policy",
    },
  },
};

export default function EnRefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/en" className="text-[14px] text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            Refund & Cancellation Policy
          </h1>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-8 text-foreground/80 text-[15px] leading-relaxed font-medium">

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">1. Scope</h2>
            <p>
              This policy applies to all pre-paid transactions made by foreign users through
              the NightFlow platform. Korean domestic users transact directly with club managers
              under a separate model and are not subject to this refund policy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-black text-foreground">2. Refund Schedule</h2>
            <p>
              Refunds for foreign user reservations are calculated based on the time remaining
              until the <span className="text-foreground font-bold">scheduled event time</span>.
            </p>

            <div className="space-y-3 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-money mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-money">More than 48 hours before event</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    <span className="text-foreground font-bold">100% refund</span>
                    {" "}(payment processing fees absorbed by NightFlow)
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-brand-amber mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-brand-amber">24 to 48 hours before event</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    <span className="text-foreground font-bold">50% refund</span>
                  </p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-300">Less than 24 hours or no-show</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    <span className="text-foreground font-bold">No refund (0%)</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">3. Refund Process</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>Request cancellation through your account or customer support</li>
              <li>Refund rate is calculated automatically based on time until event</li>
              <li>NightFlow processes approved refunds within <span className="text-foreground font-bold">3 business days</span> (compliant with Korean Act on Consumer Protection in Electronic Commerce, Article 18)</li>
              <li>Approved refunds are returned to the original payment method</li>
              <li>Actual settlement to your card account may take an additional 3-5 business days per card issuer policy</li>
              <li>WeChat Pay, Alipay+ refunds may take an additional 7-14 days due to international payment network policies, which the user acknowledges at the time of payment</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">4. Cancellation by Club (MD)</h2>
            <p>
              If a reservation is cancelled due to the club's reasons, the user is entitled to a
              <span className="text-foreground font-bold"> 100% refund</span>. The responsible MD may
              receive penalties under company policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">5. Payment Processing</h2>
            <p>
              All foreign user payments are processed through certified payment service providers.
              NightFlow does not store your card information directly. All payment data is handled
              by PCI DSS compliant payment processors.
            </p>
            <ul className="space-y-1 list-disc pl-5 text-[14px] mt-2">
              <li>Card payments: VISA, MasterCard, JCB, AMEX, UnionPay</li>
              <li>Mobile wallets: WeChat Pay, Alipay+, PayPal</li>
              <li>Currencies supported: KRW, USD, JPY, TWD, HKD and more</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">6. Dispute Resolution</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>Step 1: Contact our customer support at {BUSINESS_INFO.email}</li>
              <li>Step 2: NightFlow will review and respond within 7 business days</li>
              <li>Step 3: For unresolved disputes, mediation through the Korea Consumer Agency or Electronic Commerce Dispute Resolution Committee</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">7. Policy Changes</h2>
            <p>
              NightFlow may update this policy as necessary. Changes will be announced on the
              website at least 7 days before they take effect. Material changes that may
              disadvantage users will be announced 30 days in advance.
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-border">
            <h2 className="text-lg font-black text-foreground">Business Information</h2>
            <div className="text-[13px] text-muted-foreground space-y-1">
              <p>Company: {BUSINESS_INFO.companyName} (MadDawid)</p>
              <p>CEO: {BUSINESS_INFO.ceo}</p>
              <p>Business Registration No.: {BUSINESS_INFO.businessNumber}</p>
              <p>E-commerce Registration No.: {BUSINESS_INFO.mailOrderSalesNumber}</p>
              <p>Address: {BUSINESS_INFO.address}</p>
              <p>Customer Service: {BUSINESS_INFO.tel}</p>
              <p>Email: {BUSINESS_INFO.email}</p>
            </div>
          </section>

          <section className="space-y-2 pt-4 border-t border-border">
            <p className="text-[13px] text-muted-foreground">
              Effective from June 30, 2026.
            </p>
          </section>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-amber mt-0.5 flex-shrink-0" />
          <div className="text-[13px] text-foreground/80">
            <p className="font-bold text-brand-amber mb-1">Need help?</p>
            <p>
              Contact us at{" "}
              <a href={`mailto:${BUSINESS_INFO.email}`} className="text-brand-amber underline hover:text-brand-amber">
                {BUSINESS_INFO.email}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
