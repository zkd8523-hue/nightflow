import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: { absolute: "退款与取消政策 — NightFlow 首尔" },
  description: "NightFlow 外国用户退款政策。活动前48小时取消100%退款；24-48小时50%；24小时内或未到场不退款。",
  alternates: {
    canonical: "https://nightflow.kr/zh/refund-policy",
    languages: {
      "ko-KR": "https://nightflow.kr/refund-policy",
      "en-US": "https://nightflow.kr/en/refund-policy",
      "zh-CN": "https://nightflow.kr/zh/refund-policy",
      "ja-JP": "https://nightflow.kr/ja/refund-policy",
    },
  },
};

export default function ZhRefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh" className="text-[14px] text-muted-foreground hover:text-foreground">← 返回</Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            退款与取消政策
          </h1>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-8 text-foreground/80 text-[15px] leading-relaxed font-medium">

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">1. 适用范围</h2>
            <p>本政策适用于外国用户通过 NightFlow 平台进行的所有预付款交易。韩国国内用户直接与俱乐部MD交易，不适用本退款政策。</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-black text-foreground">2. 退款时间表</h2>
            <p>外国用户预订的退款依据距离<span className="text-foreground font-bold">活动时间</span>剩余时间计算。</p>

            <div className="space-y-3 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-money mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-money">活动前48小时以上取消</p>
                  <p className="text-[13px] text-muted-foreground mt-1"><span className="text-foreground font-bold">100% 退款</span>（PG 手续费由 NightFlow 承担）</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-brand-amber mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-brand-amber">活动前24-48小时取消</p>
                  <p className="text-[13px] text-muted-foreground mt-1"><span className="text-foreground font-bold">50% 退款</span></p>
                </div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-300">活动前24小时内或未到场</p>
                  <p className="text-[13px] text-muted-foreground mt-1"><span className="text-foreground font-bold">不予退款 (0%)</span></p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">3. 退款流程</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>通过账户或客服申请取消</li>
              <li>系统根据时间自动计算退款比例</li>
              <li>NightFlow 在 <span className="text-foreground font-bold">3 个工作日内</span>处理已批准的退款（依据韩国《电子商务消费者保护法》第18条）</li>
              <li>退款将退还至原支付方式</li>
              <li>实际入账时间因银行政策可能额外需要 3-5 个工作日</li>
              <li>WeChat Pay、Alipay+ 退款因国际支付网络政策，可能额外需要 7-14 天，用户在支付时已知悉</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">4. 俱乐部方取消</h2>
            <p>若因俱乐部方面原因取消预订，用户可获得<span className="text-foreground font-bold">100%退款</span>。相关 MD 可能依据公司政策承担违约责任。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">5. 支付处理</h2>
            <p>所有外国用户支付均通过认证的支付服务商处理。NightFlow 不直接存储您的卡片信息，所有数据由符合 PCI DSS 标准的支付处理商安全管理。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px] mt-2">
              <li>信用卡：VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>移动支付：WeChat Pay、Alipay+、PayPal</li>
              <li>支持货币：KRW、USD、JPY、TWD、HKD 等</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">6. 争议解决</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>联系客服 {BUSINESS_INFO.email}</li>
              <li>NightFlow 将在 7 个工作日内审核并回复</li>
              <li>未解决的争议将通过韩国消费者院或电子商务争议调解委员会处理</li>
            </ol>
          </section>

          <section className="space-y-3 pt-6 border-t border-border">
            <h2 className="text-lg font-black text-foreground">公司信息</h2>
            <div className="text-[13px] text-muted-foreground space-y-1">
              <p>公司：{BUSINESS_INFO.companyName} (MadDawid)</p>
              <p>法人代表：{BUSINESS_INFO.ceo}</p>
              <p>营业执照号：{BUSINESS_INFO.businessNumber}</p>
              <p>电子商务备案号：{BUSINESS_INFO.mailOrderSalesNumber}</p>
              <p>地址：{BUSINESS_INFO.address}</p>
              <p>客服电话：{BUSINESS_INFO.tel}</p>
              <p>邮箱：{BUSINESS_INFO.email}</p>
            </div>
          </section>

          <section className="space-y-2 pt-4 border-t border-border">
            <p className="text-[13px] text-muted-foreground">本政策自 2026年6月30日起生效。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
