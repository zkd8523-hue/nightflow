import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "服务条款 — NightFlow 首尔" },
  description: "NightFlow 服务条款中文摘要。完整条款以韩文版本为准。",
  alternates: {
    canonical: "https://nightflow.kr/zh/terms",
    languages: {
      "ko-KR": "https://nightflow.kr/terms",
      "en-US": "https://nightflow.kr/en/terms",
      "zh-CN": "https://nightflow.kr/zh/terms",
    },
  },
};

export default function ZhTermsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/zh" className="text-[14px] text-muted-foreground hover:text-foreground">← 返回</Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            服务条款（摘要）
          </h1>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-brand-amber">
          <p className="font-bold mb-2">完整韩文版本</p>
          <p>具有法律效力的完整条款为韩文版：<Link href="/terms" className="underline">nightflow.kr/terms</Link></p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-6 text-foreground/80 text-[15px] leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">1. 服务说明</h2>
            <p>NightFlow（运营公司：MadDawid，韩国）是首尔夜店预订中介平台。我们将国际游客与韩国夜店管理者（MD）连接，提供包间和VIP桌预订服务。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">2. 使用资格</h2>
            <p>用户必须年满 19 周岁（韩国法定饮酒年龄）。注册即视为确认符合此要求。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">3. 外国用户支付（Escrow）</h2>
            <p>外国用户（en/zh/ja 语言版本）通过认证支付服务商（如 Eximbay）进行预付款。</p>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>支付款项由 NightFlow 托管，待用户访问确认后释放</li>
              <li>NightFlow 平台费：交易金额的 9%</li>
              <li>剩余金额在访问确认后结算给 MD</li>
              <li>退款政策：活动前 48 小时 100%、24-48 小时 50%、24 小时内或未到场 0%</li>
              <li>详见 <Link href="/zh/refund-policy" className="text-brand-amber underline">退款政策</Link></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">4. 预订与取消</h2>
            <p>
              所有预订均取决于库存情况以及夜店 MD 的确认。取消权利与退款政策详见退款政策文档。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">5. 用户责任</h2>
            <ul className="space-y-1 list-disc pl-5 text-[14px]">
              <li>提供准确的个人信息</li>
              <li>按约定时间到达夜店</li>
              <li>遵守夜店规定和韩国法律</li>
              <li>现场费用（额外酒水、食物等）直接向夜店支付</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">6. 争议解决</h2>
            <p>争议首先由 NightFlow 客服处理，未解决的争议依据韩国法律，可提交至韩国消费者院或电子商务争议调解委员会。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">7. 适用法律</h2>
            <p>本服务由韩国运营，适用韩国法律。</p>
          </section>

          <section className="space-y-3 pt-6 border-t border-border">
            <p className="text-[13px] text-muted-foreground">本中文版本为摘要。法律效力以韩文版本为准。自 2026年6月30日 起施行。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
