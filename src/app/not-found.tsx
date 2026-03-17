import { Button } from "@/components/ui/button";
import { Search, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full space-y-8 text-center">
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
                    <div className="relative w-24 h-24 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
                        <Search className="w-10 h-10 text-amber-500" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-4xl font-black text-white tracking-tighter">404</h1>
                    <h2 className="text-xl font-bold text-neutral-200">페이지를 찾을 수 없습니다</h2>
                    <p className="text-neutral-500 font-medium leading-relaxed">
                        요청하신 페이지가 삭제되었거나<br />
                        주소가 잘못되었습니다.
                    </p>
                </div>

                <div className="space-y-3 pt-4">
                    <Link href="/">
                        <Button className="w-full h-14 bg-white text-black font-black rounded-2xl hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 shadow-lg">
                            <Home className="w-5 h-5" />
                            메인으로 돌아가기
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
