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

export const StatsCard = memo(function StatsCard({ label, value, icon: Icon, color = "text-foreground", description }: StatsCardProps) {
    return (
        <Card className="bg-card border-border/50 rounded-2xl p-4 space-y-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{label}</p>
            <p className={`text-[20px] font-black ${color}`}>{value}</p>
            {description && (
                <p className="text-[11px] text-muted-foreground font-medium">{description}</p>
            )}
        </Card>
    );
});
