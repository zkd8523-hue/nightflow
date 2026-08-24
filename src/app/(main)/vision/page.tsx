import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Instagram, Sparkles, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "소개 - 강남·홍대 클럽 테이블 예약",
  description:
    "나플은 강남·홍대·이태원 클럽 정보와 무료입장·프리드링크 게스트 간판, 파티(합석)를 한곳에 모은 클럽 플랫폼. 밤에 어디로 갈지 고르는 시간을 줄이는 게 목표입니다. 미션은 \"밤을 더 아름답게\".",
  alternates: { canonical: "https://nightflow.kr/vision" },
  openGraph: {
    title: "소개 - 강남·홍대 클럽 테이블 예약",
    description:
      "나플은 클럽 정보·무료입장 게스트 간판·파티를 한곳에 모은 플랫폼. 미션은 \"밤을 더 아름답게\".",
    url: "https://nightflow.kr/vision",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

export default function AboutPage() {
    return (
        <div className="relative min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">

            {/* 뒤로가기 (좌상단 고정) */}
            <Link
                href="/"
                aria-label="홈으로 돌아가기"
                className="absolute top-5 left-5 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
                <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="max-w-sm w-full space-y-14 text-center">

                {/* 아이콘 */}
                <div className="flex justify-center">
                    <Sparkles className="w-10 h-10 text-brand-amber" />
                </div>

                {/* 매니페스토 */}
                <div className="space-y-6 py-2">
                    <h1 className="sr-only">
                        나플 - 밤을 더 아름답게 만든다 (나이트플로우 매니페스토)
                    </h1>
                    <p aria-hidden="true" className="text-[22px] font-black text-foreground leading-snug tracking-tight whitespace-nowrap">
                        “밤을 더 아름답게 만든다.”
                    </p>
                    <div className="-mt-3 h-[2px] w-8 bg-amber-500 mx-auto rounded-full" />
                    <p className="text-[16px] leading-[1.9] text-foreground/80 break-keep">
                        음악이 있고, 웃음이 있고, 추억이 있는 밤.<br />
                        책임이 있고, 자유가 있고, 내일을 위한 밤.
                    </p>
                    <p className="-mt-2 text-[17px] leading-[1.5] text-foreground/80 break-keep">
                        그 밤을 위해 우리는 움직입니다.
                    </p>
                </div>

                {/* 홈으로 CTA */}
                <div className="pt-8 space-y-3">
                    <Link
                        href="/"
                        className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-background px-5 py-5 hover:border-amber-500/50 hover:bg-card transition-colors"
                    >
                        <div className="text-center">
                            <p className="text-[13px] text-muted-foreground leading-tight">
                                전국 클럽지도 · 예약 · 파티 · 게스트
                            </p>
                            <p className="text-[15px] font-black text-foreground leading-tight mt-1">
                                한눈에 보러가기
                            </p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-black group-hover:scale-105 transition-transform">
                            <ArrowRight className="w-5 h-5" />
                        </div>
                    </Link>
                </div>

                {/* 인스타 버튼 */}
                <div className="flex justify-center pt-4 pb-2">
                    <a
                        href="https://instagram.com/nightflow.kr"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="나이트플로우 인스타그램"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-white hover:text-foreground transition-colors"
                    >
                        <Instagram className="w-5 h-5" />
                    </a>
                </div>

            </div>
        </div>
    );
}
