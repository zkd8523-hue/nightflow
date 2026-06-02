import type { Metadata } from "next";
import { ArrowLeft, Instagram, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "나플(나이트플로우) 소개 - 강남·홍대 클럽 테이블 예약",
  description:
    "나플은 나이트플로우(NightFlow)의 줄임말입니다. 강남·홍대 클럽 MD가 잔여 테이블을 올리면 회원이 입찰로 가격을 정해 예약하는 서비스. 나플을 만든 이유와 운영 방식을 소개합니다.",
  alternates: { canonical: "https://nightflow.kr/vision" },
  openGraph: {
    title: "나플(나이트플로우) 소개",
    description:
      "나플은 나이트플로우의 줄임말. 강남·홍대 클럽 테이블을 실시간 경매로 예약하는 플랫폼.",
    url: "https://nightflow.kr/vision",
    type: "website",
  },
};

export default function AboutPage() {
    return (
        <div className="relative min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 py-12">

            {/* 뒤로가기 (좌상단 고정) */}
            <Link
                href="/"
                aria-label="홈으로 돌아가기"
                className="absolute top-5 left-5 z-10 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-white/5 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="max-w-sm w-full space-y-14 text-center">

                {/* 아이콘 */}
                <div className="flex justify-center">
                    <Sparkles className="w-10 h-10 text-amber-500" />
                </div>

                {/* 매니페스토 */}
                <div className="space-y-6 py-2">
                    <h1 className="sr-only">
                        나플(나이트플로우) - 강남·홍대 클럽 테이블 예약 서비스
                    </h1>
                    <p aria-hidden="true" className="text-[22px] font-black text-white leading-snug tracking-tight whitespace-nowrap">
                        “밤을 더 아름답게 만든다.”
                    </p>
                    <div className="-mt-3 h-[2px] w-8 bg-amber-500 mx-auto rounded-full" />
                    <p className="text-[16px] leading-[1.9] text-neutral-300 break-keep">
                        음악이 있고, 웃음이 있고, 추억이 있는 밤.<br />
                        책임이 있고, 자유가 있고, 내일을 위한 밤.
                    </p>
                    <p className="-mt-2 text-[17px] leading-[1.5] text-neutral-300 break-keep">
                        그 밤을 위해 우리는 움직입니다.
                    </p>
                </div>

                {/* 인스타 버튼 */}
                <div className="flex justify-center pt-6 pb-2">
                    <a
                        href="https://instagram.com/nightflow.kr"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="나이트플로우 인스타그램"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-700 text-neutral-400 hover:border-white hover:text-white transition-colors"
                    >
                        <Instagram className="w-5 h-5" />
                    </a>
                </div>

            </div>
        </div>
    );
}
