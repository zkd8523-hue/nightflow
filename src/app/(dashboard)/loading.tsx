import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 animate-in fade-in duration-700">
            <div className="relative">
                <div className="absolute inset-0 bg-white/10 rounded-full blur-xl animate-pulse" />
                <Loader2 className="w-10 h-10 text-white animate-spin relative" />
            </div>
            <p className="text-sm font-black text-neutral-500 uppercase tracking-widest animate-pulse">
                데이터를 불러오는 중...
            </p>
        </div>
    );
}
