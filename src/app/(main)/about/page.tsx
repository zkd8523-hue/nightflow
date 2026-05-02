import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "회사소개",
  description:
    "나이트플로우(나플)는 강남·홍대 클럽 테이블을 실시간 경매로 예약하는 플랫폼입니다. 클럽 MD가 직접 올리는 잔여 테이블을 합리적인 가격에 낙찰받으세요.",
  alternates: { canonical: "https://nightflow.kr/about" },
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 py-12">
            <div className="max-w-sm w-full space-y-14 text-center">

                {/* 아이콘 */}
                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20">
                    <Sparkles className="w-8 h-8 text-amber-500" />
                </div>

                {/* 헤드라인 */}
                <div className="space-y-5">
                    <h1 className="text-[28px] font-black text-white leading-[1.3] tracking-tight">
                        더 많은 사람들이<br />
                        더 똑똑하게 클럽을 즐기도록
                    </h1>
                    <div className="h-[2px] w-8 bg-amber-500 mx-auto rounded-full" />
                </div>

                {/* 본문 */}
                <div className="space-y-6 text-[15px] leading-[1.8] text-neutral-400 break-keep">
                    <p>
                        안녕하세요, NightFlow를 만들고 있는 개발자 김민기입니다.
                    </p>

                    <p>
                        배달시킬 때는 배민, 숙박 잡을 때는 여기어때.<br />
                        근데 놀러 나갈 때는 이런 서비스가 없더라고요.<br />
                        그래서 그냥 제가 한 번 만들어 보기로 했습니다.
                    </p>

                    <p>
                        클럽에 가고 싶은 사람은 더 쉽게,<br />
                        MD는 더 빠르게 손님을 만날 수 있도록.<br />
                        그 연결을 돕는 게 NightFlow가 하고 싶은 일입니다.
                    </p>

                    <p className="text-white font-semibold">
                        부족한 점이 많습니다.<br />
                        언제든 여러분의 목소리에 귀 기울이겠습니다.
                    </p>
                </div>

                {/* 서명 */}
                <div className="flex flex-col items-center pt-6 pb-2">
                    <p className="text-[32px] text-neutral-400 -rotate-2" style={{ fontFamily: "var(--font-nanum-pen)" }}>
                        매드다윗
                    </p>
                </div>

                {/* CTA 버튼 */}
                <div className="space-y-3">
                    <Button
                        asChild
                        className="w-full h-13 bg-[#FEE500] text-[#191919] font-black rounded-2xl hover:bg-[#FEE500]/90 transition-all"
                    >
                        <a href="http://pf.kakao.com/_ilSqX" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2.5">
                            <MessageCircle className="w-[18px] h-[18px] fill-[#191919] stroke-none" />
                            카카오톡으로 피드백 주기
                        </a>
                    </Button>

                    <Button
                        variant="outline"
                        asChild
                        className="w-full h-13 bg-transparent border-neutral-800 text-neutral-300 font-semibold rounded-2xl hover:bg-neutral-900 hover:text-white transition-all"
                    >
                        <a href="mailto:maddawids@gmail.com" className="flex items-center justify-center gap-2.5">
                            <Mail className="w-[18px] h-[18px] text-neutral-500" />
                            이메일로 제안하기
                        </a>
                    </Button>
                </div>

                {/* 뒤로가기 */}
                <Link href="/" className="flex items-center justify-center gap-1.5 text-[13px] text-neutral-600 hover:text-neutral-400 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    홈으로 돌아가기
                </Link>

            </div>
        </div>
    );
}
