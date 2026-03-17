"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { MapPin, Phone, Edit, Map, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { Club } from "@/types/database";

interface ClubListProps {
    initialClubs: Club[];
}

export function ClubList({ initialClubs }: ClubListProps) {
    const [clubs, setClubs] = useState<Club[]>(initialClubs);
    const [deleteTarget, setDeleteTarget] = useState<Club | null>(null);
    const [deleting, setDeleting] = useState(false);
    const supabase = createClient();

    const canDelete = (club: Club) => club.status !== "approved";

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const { error } = await supabase
                .from("clubs")
                .delete()
                .eq("id", deleteTarget.id);

            if (error) throw error;

            setClubs(prev => prev.filter(c => c.id !== deleteTarget.id));
            toast.success(`${deleteTarget.name} 클럽이 삭제되었습니다.`);
        } catch (error: unknown) {
            logError(error, "ClubList.handleDelete");
            toast.error(getErrorMessage(error));
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    return (
        <>
            {clubs.map((club) => (
                <div
                    key={club.id}
                    className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-5 transition-all"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-white font-bold text-lg truncate">{club.name}</h3>
                                    <span className="px-2 py-0.5 bg-neutral-800 text-neutral-400 text-xs rounded-md font-bold flex-shrink-0">
                                        {club.area}
                                    </span>
                                    <StatusBadge status={club.status} size="sm" />
                                </div>

                                <div className="space-y-2 text-sm">
                                    <p className="text-neutral-400 flex items-start gap-2">
                                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                                        <span className="break-words">{club.address}</span>
                                    </p>

                                    {club.phone && (
                                        <p className="text-neutral-400 flex items-center gap-2">
                                            <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                            <span>{club.phone}</span>
                                        </p>
                                    )}

                                    {club.latitude && club.longitude && (
                                        <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg w-fit">
                                            <Map className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                            <span className="text-[11px] text-green-500 font-bold">
                                                좌표 등록됨
                                            </span>
                                        </div>
                                    )}

                                    {club.rejected_reason && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                            <p className="text-[11px] text-red-400 font-bold">거부 사유: {club.rejected_reason}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 flex-shrink-0">
                            <Link href={`/md/clubs/${club.id}/edit`}>
                                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:border-neutral-600 transition-colors">
                                    <Edit className="w-4 h-4 text-neutral-500" />
                                </div>
                            </Link>
                            {canDelete(club) && (
                                <button
                                    onClick={() => setDeleteTarget(club)}
                                    className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4 text-neutral-500 hover:text-red-500" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
                title="클럽 삭제"
                description={`"${deleteTarget?.name}" 클럽을 삭제하시겠습니까? 이 클럽과 관련된 경매는 유지되지만, 새 경매를 등록할 수 없게 됩니다.`}
                confirmText="삭제하기"
                cancelText="취소"
                variant="danger"
            />
        </>
    );
}
