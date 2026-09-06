"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    const router = useRouter();
    const [retrying, setRetrying] = useState(false);

    // 앱을 오래 켜둔 채 방치하면 그 사이 새 배포가 나가면서 WebView/탭이 들고 있던
    // 빌드의 청크(/_next/static/...)가 서버에서 사라진다. 복귀해서 화면을 이동하는
    // 순간 없는 청크를 요청해 ChunkLoadError가 터진다 — "오래 안 쓰다 켜면 에러"의 정체.
    //
    // 이 경우 reset()도 router.refresh()도 소용없다. 둘 다 여전히 옛 빌드 ID로
    // 같은 청크를 다시 요청하므로 즉시 같은 에러로 되돌아온다(= 버튼이 안 먹는 것처럼 보임).
    // 새 빌드 HTML을 받아오는 하드 리로드만이 복구 수단이다.
    const isStaleBuildError =
        /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(
            `${error?.name ?? ""} ${error?.message ?? ""}`
        );

    useEffect(() => {
        logger.error("Global Error Boundary caught:", error);
    }, [error]);

    // 낡은 빌드로 판정되면 유저가 버튼을 누르길 기다리지 않고 즉시 새 빌드로 갈아탄다.
    // 무한 리로드 방지: 세션당 1회만 자동 리로드하고, 그래도 안 되면 수동 버튼에 맡긴다.
    useEffect(() => {
        if (!isStaleBuildError) return;
        const KEY = "nf_stale_build_reloaded";
        try {
            if (sessionStorage.getItem(KEY)) return;
            sessionStorage.setItem(KEY, "1");
        } catch {
            // sessionStorage 차단 환경 — 자동 리로드는 포기하고 수동 버튼으로
            return;
        }
        setRetrying(true);
        window.location.reload();
    }, [isStaleBuildError]);

    const handleRetry = () => {
        if (retrying) return;
        setRetrying(true);

        // 낡은 빌드는 reset/refresh로 절대 복구되지 않는다 — 바로 하드 리로드.
        if (isStaleBuildError) {
            window.location.reload();
            return;
        }

        // 그 외(서버 데이터 fetch 실패 등)는 reset()만으로는 서버 컴포넌트가
        // 재요청되지 않으므로 router.refresh()를 함께 친다.
        // 그래도 복구되지 않으면 하드 리로드로 폴백.
        const fallback = setTimeout(() => {
            window.location.reload();
        }, 3000);

        try {
            router.refresh();
            reset();
        } catch {
            clearTimeout(fallback);
            window.location.reload();
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full space-y-8 text-center">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-black text-foreground tracking-tighter">오류가 발생했습니다</h1>
                    <p className="text-muted-foreground font-medium leading-relaxed">
                        서비스 이용 중 예상치 못한 문제가 발생했습니다.<br />
                        잠시 후 다시 시도해주세요.
                    </p>
                    {error.digest && (
                        <p className="text-[10px] text-muted-foreground font-mono">Error ID: {error.digest}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                    <Button
                        variant="outline"
                        onClick={handleRetry}
                        disabled={retrying}
                        className="h-14 border-border text-muted-foreground font-black rounded-2xl hover:bg-card transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        <RefreshCcw className={`w-5 h-5 ${retrying ? "animate-spin" : ""}`} />
                        {retrying ? "재시도 중" : "다시 시도"}
                    </Button>
                    <Link href="/">
                        <Button className="w-full h-14 bg-inverse text-inverse-foreground font-black rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg">
                            <Home className="w-5 h-5" />
                            홈으로 이동
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
