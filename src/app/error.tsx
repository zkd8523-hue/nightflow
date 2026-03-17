"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";
import { logger } from "@/lib/utils/logger";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        logger.error("Global Error Boundary caught:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full space-y-8 text-center">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-black text-white tracking-tighter">오류가 발생했습니다</h1>
                    <p className="text-neutral-500 font-medium leading-relaxed">
                        서비스 이용 중 예상치 못한 문제가 발생했습니다.<br />
                        잠시 후 다시 시도해주세요.
                    </p>
                    {error.digest && (
                        <p className="text-[10px] text-neutral-700 font-mono">Error ID: {error.digest}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                    <Button
                        variant="outline"
                        onClick={() => reset()}
                        className="h-14 border-neutral-800 text-neutral-400 font-black rounded-2xl hover:bg-neutral-900 transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCcw className="w-5 h-5" />
                        다시 시도
                    </Button>
                    <Link href="/">
                        <Button className="w-full h-14 bg-white text-black font-black rounded-2xl hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 shadow-lg">
                            <Home className="w-5 h-5" />
                            홈으로 이동
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
