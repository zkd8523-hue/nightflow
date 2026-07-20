import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "隐私政策 — NightFlow 首尔" },
  description: "NightFlow 隐私政策中文摘要。完整政策以韩文版本为准。",
  alternates: {
    canonical: "https://nightflow.kr/zh/privacy",
    languages: {
      "ko-KR": "https://nightflow.kr/privacy",
      "en-US": "https://nightflow.kr/en/privacy",
      "zh-CN": "https://nightflow.kr/zh/privacy",
    },
  },
};

export default function ZhPrivacyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh" className="text-[14px] text-muted-foreground hover:text-foreground">← 返回</Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            隐私政策（摘要）
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-brand-amber">
          <p className="font-bold mb-2">完整韩文版本</p>
          <p><Link href="/privacy" className="underline">nightflow.kr/privacy</Link></p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-6 text-foreground/80 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">1. 收集的数据</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>账户信息：姓名、电子邮件、电话（通过 Kakao/Google OAuth）</li>
              <li>个人资料：昵称、头像</li>
              <li>交易数据：预订、支付、退款</li>
              <li>与 MD 和客服的通信记录</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">2. 支付数据（重要）</h2>
            <p>NightFlow 不直接存储您的信用卡信息。所有支付数据由符合 PCI DSS 标准的支付处理商管理：</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>Eximbay（韩国认证 PG）</li>
              <li>VISA、MasterCard、JCB、AMEX、UnionPay</li>
              <li>WeChat Pay、Alipay+、PayPal</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">3. 数据用途</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>账户管理和身份验证</li>
              <li>与韩国夜店管理者（MD）匹配</li>
              <li>支付处理和结算</li>
              <li>客户支持和争议解决</li>
              <li>服务改进和分析</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">4. 数据共享</h2>
            <p>我们仅在以下情况共享数据：</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>匹配的夜店 MD（仅限预订详情）</li>
              <li>支付处理商（Eximbay 等）</li>
              <li>韩国税务机关（法律要求时）</li>
            </ul>
            <p className="text-[13px] text-muted-foreground mt-2">我们不向第三方出售您的个人数据。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">5. 数据保留</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>账户数据：账户删除后保留 30 天恢复期</li>
              <li>交易记录：5 年（韩国税法）</li>
              <li>通信记录：3 年</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">6. 您的权利</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>访问您的个人数据</li>
              <li>更正不准确的数据</li>
              <li>请求删除账户</li>
              <li>撤回营销同意</li>
              <li>数据可移植性</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">7. 联系</h2>
            <p>隐私相关问题：<a href="mailto:maddawids@gmail.com" className="text-brand-amber underline">maddawids@gmail.com</a></p>
          </section>

          <section className="space-y-3 pt-6 border-t border-border">
            <p className="text-[13px] text-muted-foreground">本中文版本为摘要。法律效力以韩文版本为准。自 2026年6月30日 起施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
