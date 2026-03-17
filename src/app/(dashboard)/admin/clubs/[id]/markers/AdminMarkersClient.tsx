"use client";

import { createClient } from "@/lib/supabase/client";
import { TableMarkerEditor } from "@/components/admin/TableMarkerEditor";
import type { TablePosition } from "@/types/database";

interface AdminMarkersClientProps {
    clubId: string;
    clubName: string;
    floorPlanUrl: string;
    initialPositions: TablePosition[];
}

export function AdminMarkersClient({
    clubId,
    clubName,
    floorPlanUrl,
    initialPositions,
}: AdminMarkersClientProps) {
    const supabase = createClient();

    const handleSave = async (positions: TablePosition[]) => {
        const { error } = await supabase
            .from("clubs")
            .update({ table_positions: positions })
            .eq("id", clubId);

        if (error) {
            throw error;
        }
    };

    return (
        <TableMarkerEditor
            clubId={clubId}
            floorPlanUrl={floorPlanUrl}
            initialPositions={initialPositions}
            onSave={handleSave}
        />
    );
}
