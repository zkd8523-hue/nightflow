import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, AlertCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: "환불·취소 정책",
  description:
    "나이트플로우(NightFlow) 환불 및 취소 정책. 외국인 사용자 선결제 환불 정책, 청약철회, 분쟁 처리.",
  alternates: {
    canonical: "https://nightflow.kr/refund-policy",
    languages: {
      "ko-KR": "https://nightflow.kr/refund-policy",
      "en-US": "https://nightflow.kr/en/refund-policy",
      "zh-CN": "https://nightflow.kr/zh/refund-policy",
      "ja-JP": "https://nightflow.kr/ja/refund-policy",
    },
  },
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <BackButton />
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-amber" />
            환불·취소 정책
          </h1>
        </div>

        {/* 다국어 안내 박스 */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-[13px] text-brand-amber leading-relaxed">
          <p className="font-bold mb-2">🌐 Multilingual / 多语言 / 多言語</p>
          <p>
            <Link href="/en/refund-policy" className="underline hover:text-brand-amber">English</Link>
            {" · "}
            <Link href="/zh/refund-policy" className="underline hover:text-brand-amber">中文</Link>
            {" · "}
            <Link href="/ja/refund-policy" className="underline hover:text-brand-amber">日本語</Link>
          </p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 space-y-8 text-foreground/80 text-[15px] leading-relaxed font-medium">

          {/* 제1조: 적용 범위 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 1조 (적용 범위)</h2>
            <p>
              본 환불·취소 정책은 NightFlow(나이트플로우, 이하 "회사")가 운영하는 플랫폼을 통해
              외국인 사용자가 선결제한 모든 거래에 적용됩니다. 한국 내국인 사용자의 경우 별도의
              직거래 방식으로 운영되며, 회사는 결제 중개에 관여하지 않습니다.
            </p>
            <p className="text-[13px] text-muted-foreground">
              ※ 외국인 사용자 = NightFlow 사이트에서 영어(/en), 중국어(/zh), 일본어(/ja) 트랙으로
              가입한 사용자
            </p>
          </section>

          {/* 제2조: 환불 정책 */}
          <section className="space-y-4">
            <h2 className="text-lg font-black text-foreground">제 2조 (환불 기준)</h2>
            <p>
              외국인 사용자의 깃발 매칭 선결제 거래에 대해 다음과 같이 환불을 진행합니다.
              환불 기준 시점은 <span className="text-foreground font-bold">예약 이벤트 일시</span>입니다.
            </p>

            <div className="space-y-3 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-money mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-money">방문 48시간 이전 취소</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    결제 금액의 <span className="text-foreground font-bold">100% 환불</span>
                    {" "}(PG 결제 수수료는 회사가 부담)
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-brand-amber mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-brand-amber">방문 24~48시간 전 취소</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    결제 금액의 <span className="text-foreground font-bold">50% 환불</span>
                  </p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-300">방문 24시간 이내 취소 또는 미방문 (노쇼)</p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    환불 <span className="text-foreground font-bold">불가 (0%)</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 제3조: 환불 처리 절차 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 3조 (환불 처리 절차)</h2>
            <ol className="space-y-2 list-decimal pl-5">
              <li>사용자가 마이페이지 또는 고객센터를 통해 취소 신청</li>
              <li>회사가 시각 기준(예약 이벤트 일시 대비)으로 환불 비율 자동 산정</li>
              <li>회사는 <span className="text-foreground font-bold">취소 승인 후 영업일 기준 3일 이내</span>에 환불을 진행합니다.
                {" "}(「전자상거래 등에서의 소비자보호에 관한 법률」 제18조 준수)</li>
              <li>승인된 환불액은 결제 시 사용한 카드/결제수단으로 환급됩니다.</li>
              <li>실제 카드사 계좌 반영은 카드사 정책에 따라 추가로 3~5영업일이 소요될 수 있습니다.</li>
              <li>국제 결제(WeChat Pay, Alipay+ 등) 환불은 글로벌 결제망 정책상 추가 7~14일이 소요될 수 있으며,
                이는 사용자가 결제 시 동의한 것으로 간주됩니다.</li>
            </ol>
          </section>

          {/* 제4조: 청약철회 권리 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 4조 (청약철회의 제한)</h2>
            <p>
              「전자상거래 등에서의 소비자 보호에 관한 법률」 제17조에 따라 다음과 같은 경우 청약철회가 제한됩니다.
            </p>
            <ul className="space-y-2 list-disc pl-5 text-[14px]">
              <li>예약된 클럽 방문일이 이미 경과한 경우</li>
              <li>방문일까지 24시간 이내인 경우 (해당 시점부터 서비스 제공이 즉시 시작되는 것으로 간주)</li>
              <li>사용자의 책임 있는 사유로 매칭이 실패하거나 무효가 된 경우</li>
            </ul>
            <p className="text-[13px] text-muted-foreground mt-2">
              ※ 단, 회사 또는 MD의 책임 있는 사유(예: 클럽 일방적 취소, MD 응답 불가)로
              매칭이 무효가 된 경우 100% 환불됩니다.
            </p>
          </section>

          {/* 제5조: MD 측 취소 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 5조 (MD 측 취소)</h2>
            <p>
              매칭 후 클럽(MD)의 사유로 거래가 취소된 경우, 사용자는 결제 금액의 100%를 환불 받습니다.
              해당 MD에게는 회사의 정책에 따라 별도의 패널티가 부과될 수 있습니다.
            </p>
          </section>

          {/* 제6조: 결제대행사 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 6조 (결제대행사)</h2>
            <p>
              외국인 사용자의 결제는 회사가 지정한 결제대행사(PG)를 통해 안전하게 처리됩니다.
              회사는 사용자의 카드 정보를 직접 저장하지 않으며, 모든 결제 정보는 PCI DSS 표준을
              준수하는 결제대행사에서 안전하게 관리됩니다.
            </p>
            <ul className="space-y-1 list-disc pl-5 text-[14px] mt-2">
              <li>주요 결제 수단: 해외 신용카드(VISA, MasterCard, JCB, AMEX, UnionPay)</li>
              <li>간편결제: WeChat Pay, Alipay+, PayPal</li>
              <li>결제 통화: KRW, USD, JPY, TWD, HKD 등</li>
            </ul>
          </section>

          {/* 제7조: 분쟁 처리 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 7조 (분쟁 처리)</h2>
            <p>
              환불·취소와 관련한 분쟁이 발생한 경우 다음 절차에 따라 처리됩니다.
            </p>
            <ol className="space-y-2 list-decimal pl-5">
              <li>1차: 회사 고객센터({BUSINESS_INFO.email})로 분쟁 신청</li>
              <li>2차: 7일 이내 회사 검토 및 답변</li>
              <li>3차: 합의가 이루어지지 않을 경우 한국소비자원 또는 전자거래분쟁조정위원회를 통한 조정</li>
            </ol>
          </section>

          {/* 제8조: 정책 변경 */}
          <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground">제 8조 (정책 변경)</h2>
            <p>
              회사는 관련 법령 및 정책 변경, 서비스 운영상의 필요에 따라 본 환불·취소 정책을
              변경할 수 있으며, 변경 시 시행일 7일 전까지 사이트 내 공지합니다.
              단, 사용자에게 불리한 변경의 경우 30일 전에 공지합니다.
            </p>
          </section>

          {/* 사업자 정보 */}
          <section className="space-y-3 pt-6 border-t border-border">
            <h2 className="text-lg font-black text-foreground">사업자 정보</h2>
            <div className="text-[13px] text-muted-foreground space-y-1">
              <p>상호: {BUSINESS_INFO.companyName}</p>
              <p>대표자: {BUSINESS_INFO.ceo}</p>
              <p>사업자등록번호: {BUSINESS_INFO.businessNumber}</p>
              <p>통신판매업 신고번호: {BUSINESS_INFO.mailOrderSalesNumber}</p>
              <p>주소: {BUSINESS_INFO.address}</p>
              <p>고객센터: {BUSINESS_INFO.tel}</p>
              <p>이메일: {BUSINESS_INFO.email}</p>
            </div>
          </section>

          {/* 시행일 */}
          <section className="space-y-2 pt-4 border-t border-border">
            <p className="text-[13px] text-muted-foreground">
              본 정책은 2026년 6월 30일부터 시행됩니다.
            </p>
          </section>
        </div>

        {/* CTA */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-amber mt-0.5 flex-shrink-0" />
          <div className="text-[13px] text-foreground/80">
            <p className="font-bold text-brand-amber mb-1">고객 지원이 필요하신가요?</p>
            <p>
              환불·취소 관련 문의는{" "}
              <Link href="/contact" className="text-brand-amber underline hover:text-brand-amber">
                고객문의
              </Link>{" "}
              또는 <a href={`mailto:${BUSINESS_INFO.email}`} className="text-brand-amber underline hover:text-brand-amber">
                {BUSINESS_INFO.email}
              </a>로 연락해주세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
