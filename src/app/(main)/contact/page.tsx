import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "고객 문의",
  description:
    "나이트플로우(나플) 고객센터. 이메일·인스타그램 DM으로 24시간 문의 가능합니다.",
  alternates: { canonical: "https://nightflow.kr/contact" },
};

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full space-y-8 text-center">
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
                    <Mail className="w-10 h-10 text-blue-500" />
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-black text-white tracking-tighter">고객 문의</h1>
                    <p className="text-neutral-500 font-medium">
                        NightFlow 이용 중 궁금하신 점이나<br />불편사항이 있다면 말씀해주세요.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-4">
                    <Button
                        asChild
                        className="h-14 bg-[#FEE500] text-[#191919] font-black rounded-2xl hover:bg-[#FEE500]/90 transition-all flex items-center justify-center gap-3"
                    >
                        <a href="http://pf.kakao.com/_ilSqX" target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="w-5 h-5 fill-[#191919] stroke-none" />
                            카카오톡 채널 문의하기
                        </a>
                    </Button>

                    <Button
                        variant="outline"
                        asChild
                        className="h-14 bg-transparent border-neutral-800 text-white font-bold rounded-2xl hover:bg-neutral-900 transition-all flex items-center justify-center gap-3"
                    >
                        <a href="mailto:maddawids@gmail.com">
                            <Mail className="w-5 h-5 text-neutral-400" />
                            이메일 문의하기
                        </a>
                    </Button>
                </div>

                <div className="pt-8">
                    <Link href="/">
                        <Button variant="link" className="text-neutral-500 hover:text-white transition-colors">
                            홈으로 돌아가기
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
