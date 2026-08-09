import { Button } from "@/components/ui/button";
import { Search, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ⚠️ loading.tsx 를 라우트 세그먼트에 추가할 때 주의 (2026-08-09 소프트 404 장애).
//
// loading.tsx가 있으면 Next.js가 해당 세그먼트에 Suspense 경계를 만들고, 로딩 UI를
// HTTP 200으로 먼저 흘려보낸다. 헤더가 이미 나간 뒤라 하위 페이지에서 notFound()를
// 호출해도 상태코드를 404로 바꾸지 못한다 → 본문은 이 404 페이지인데 응답은 200인
// "소프트 404". 구글이 가장 싫어하는 신호라 색인 점수가 떨어진다.
//
// 실제로 (main)/loading.tsx 하나 때문에 /clubs/[id], /auctions/[id], /hotdeal/[id],
// /u/[userId] 등 sitemap에 올라간 상세 페이지 전부가 소프트 404였다(GSC에서 발견).
// notFound()를 호출하는 페이지가 하위에 있는 세그먼트에는 loading.tsx를 두지 말 것.
// 로딩 UI가 필요하면 페이지 안에서 <Suspense>로 감싸면 된다(라우트 경계를 안 만듦).
export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full space-y-8 text-center">
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
                    <div className="relative w-24 h-24 bg-card rounded-full flex items-center justify-center border border-border">
                        <Search className="w-10 h-10 text-brand-amber" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-4xl font-black text-foreground tracking-tighter">404</h1>
                    <h2 className="text-xl font-bold text-foreground">
                        페이지를 찾을 수 없습니다
                    </h2>
                    <p className="text-[13px] text-muted-foreground">
                        Page not found · ページが見つかりません · 找不到页面
                    </p>
                    <p className="text-muted-foreground font-medium leading-relaxed">
                        요청하신 페이지가 삭제되었거나<br />
                        주소가 잘못되었습니다.
                    </p>
                </div>

                <div className="space-y-3 pt-4">
                    <Link href="/">
                        <Button className="w-full h-14 bg-inverse text-inverse-foreground font-black rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg">
                            <Home className="w-5 h-5" />
                            메인으로 돌아가기
                        </Button>
                    </Link>
                    {/* 외국인 트랙 진입 안내 (lang별 폴백) */}
                    <div className="flex flex-wrap gap-2 justify-center text-[12px] pt-2">
                        <Link href="/en" className="text-muted-foreground hover:text-foreground underline">
                            English
                        </Link>
                        <span className="text-muted-foreground">·</span>
                        <Link href="/ja" className="text-muted-foreground hover:text-foreground underline">
                            日本語
                        </Link>
                        <span className="text-muted-foreground">·</span>
                        <Link href="/zh" className="text-muted-foreground hover:text-foreground underline">
                            中文
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
