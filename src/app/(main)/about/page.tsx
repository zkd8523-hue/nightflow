import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle, Mail, Sparkles } from "lucide-react";
import Link from "next/link";

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
                        배달시킬 때는 배민, 숙박잡을 때는 여기어때.<br />
                        근데 놀러 나갈 때는 이런 서비스가 없더라고요.<br />
                        그래서 그냥 제가 한 번 만들어 보기로 했습니다.
                    </p>

                    <p>
                        <span className="text-white font-semibold whitespace-nowrap">&ldquo;더 많은 사람들이, 더 똑똑하게 클럽을 즐기도록 돕자&rdquo;</span>는 사명을 갖고 서비스를 꾸려가고 있습니다.
                    </p>

                    <p>
                        NightFlow는 단순한 예약 플랫폼을 넘어, 유저와 MD, 그리고 클럽 점주님이 매일 밤마다 더 편해지고, 더 즐거워지는 건강한 대한민국을 꿈꿉니다.
                    </p>

                    <p className="text-white font-semibold">
                        부족한 점이 많습니다. 언제든 여러분의 목소리에 귀 기울이겠습니다.
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
