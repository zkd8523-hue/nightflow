import { memo } from "react";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color?: string;
    description?: string;
}

export const StatsCard = memo(function StatsCard({ label, value, icon: Icon, color = "text-white", description }: StatsCardProps) {
    return (
        <Card className="bg-[#1C1C1E] border-neutral-800/50 rounded-2xl p-4 space-y-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{label}</p>
            <p className={`text-[20px] font-black ${color}`}>{value}</p>
            {description && (
                <p className="text-[11px] text-neutral-600 font-medium">{description}</p>
            )}
        </Card>
    );
});
