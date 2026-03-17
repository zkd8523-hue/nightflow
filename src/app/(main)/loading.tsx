import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="container mx-auto max-w-lg px-4 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="space-y-2 px-1">
                <Skeleton className="h-6 w-32 rounded-lg bg-neutral-900" />
                <Skeleton className="h-4 w-48 rounded-lg bg-neutral-900/50" />
            </div>

            {/* Tabs Skeleton */}
            <div className="flex gap-2 bg-neutral-900/50 p-1 rounded-xl border border-neutral-800/30">
                <Skeleton className="h-9 flex-1 rounded-lg bg-neutral-800/50" />
                <Skeleton className="h-9 flex-1 rounded-lg bg-neutral-800/50" />
                <Skeleton className="h-9 flex-1 rounded-lg bg-neutral-800/50" />
            </div>

            {/* Cards Skeleton Grid */}
            <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-[#1C1C1E] border border-neutral-800/50 rounded-3xl p-4 space-y-4">
                        <div className="flex gap-4">
                            <Skeleton className="w-[120px] h-24 rounded-2xl bg-neutral-900" />
                            <div className="flex-1 space-y-2 py-1">
                                <Skeleton className="h-4 w-24 bg-neutral-900" />
                                <Skeleton className="h-6 w-full bg-neutral-900" />
                                <Skeleton className="h-4 w-32 bg-neutral-900/50" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
