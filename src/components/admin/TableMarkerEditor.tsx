"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { MapPin, Trash2, RotateCcw, Save, Monitor, Smartphone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TablePosition, TableType } from "@/types/database";

interface TableMarkerEditorProps {
    clubId: string;
    floorPlanUrl: string;
    initialPositions: TablePosition[];
    onSave: (positions: TablePosition[]) => Promise<void>;
}

const TABLE_TYPES: { value: TableType; label: string; prefix: string; color: string }[] = [
    { value: "Standard", label: "일반", prefix: "S", color: "bg-white/20 border-white/30 text-white/80" },
    { value: "VIP", label: "VIP", prefix: "V", color: "bg-purple-500/40 border-purple-500/60 text-purple-300" },
    { value: "Premium", label: "프리미엄", prefix: "P", color: "bg-amber-500/30 border-amber-500/50 text-amber-400" },
];

const MAX_MARKERS = 50;
const OVERLAP_THRESHOLD = 5; // percent

function getNextLabel(positions: TablePosition[], type: TableType): string {
    const prefix = TABLE_TYPES.find(t => t.value === type)?.prefix || "S";
    const existing = positions
        .filter(p => p.label.startsWith(prefix))
        .map(p => parseInt(p.label.slice(prefix.length), 10))
        .filter(n => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}${next}`;
}

function getEditorMarkerStyle(type: TableType, isDeleting: boolean) {
    if (isDeleting) return "bg-red-500/60 border-red-400 text-white ring-2 ring-red-500/50";
    switch (type) {
        case "VIP":
            return "bg-purple-500/40 border-purple-500/60 text-purple-300";
        case "Premium":
            return "bg-amber-500/30 border-amber-500/50 text-amber-400";
        default:
            return "bg-white/20 border-white/30 text-white/80";
    }
}

function checkOverlap(
    positions: TablePosition[],
    newX: number,
    newY: number,
    excludeId?: string
): TablePosition | null {
    for (const p of positions) {
        if (excludeId && p.id === excludeId) continue;
        const dist = Math.sqrt((p.x - newX) ** 2 + (p.y - newY) ** 2);
        if (dist < OVERLAP_THRESHOLD) return p;
    }
    return null;
}

export function TableMarkerEditor({
    clubId,
    floorPlanUrl,
    initialPositions,
    onSave,
}: TableMarkerEditorProps) {
    const [positions, setPositions] = useState<TablePosition[]>(initialPositions);
    const [saving, setSaving] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [isMobileWarning] = useState(
        typeof window !== "undefined" && window.innerWidth < 768
    );

    // New marker dialog
    const [dialogOpen, setDialogOpen] = useState(false);
    const [pendingCoord, setPendingCoord] = useState<{ x: number; y: number } | null>(null);
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState<TableType>("Standard");

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    const hasChanges = JSON.stringify(positions) !== JSON.stringify(initialPositions);

    const handleImageClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!imageLoaded) return;
            if (positions.length >= MAX_MARKERS) {
                toast.error(`최대 ${MAX_MARKERS}개까지 등록할 수 있습니다.`);
                return;
            }

            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const rawX = ((e.clientX - rect.left) / rect.width) * 100;
            const rawY = ((e.clientY - rect.top) / rect.height) * 100;
            const x = Math.max(0, Math.min(100, rawX));
            const y = Math.max(0, Math.min(100, rawY));

            // Auto-generate label
            const autoLabel = getNextLabel(positions, newType);
            setNewLabel(autoLabel);
            setPendingCoord({ x, y });
            setDialogOpen(true);
        },
        [imageLoaded, positions, newType]
    );

    const handleConfirmMarker = () => {
        if (!pendingCoord || !newLabel.trim()) return;

        const overlap = checkOverlap(positions, pendingCoord.x, pendingCoord.y);
        if (overlap) {
            toast.warning(`"${overlap.label}" 마커와 너무 가깝습니다 (${OVERLAP_THRESHOLD}% 이내)`);
        }

        const newMarker: TablePosition = {
            id: crypto.randomUUID(),
            x: Math.round(pendingCoord.x * 100) / 100,
            y: Math.round(pendingCoord.y * 100) / 100,
            label: newLabel.trim(),
            type: newType,
        };

        setPositions(prev => [...prev, newMarker]);
        setDialogOpen(false);
        setPendingCoord(null);
        setNewLabel("");
    };

    const handleDeleteMarker = (id: string) => {
        if (deleteTarget === id) {
            // Second click — confirm delete
            setPositions(prev => prev.filter(p => p.id !== id));
            setDeleteTarget(null);
            toast.success("마커가 삭제되었습니다");
        } else {
            // First click — highlight for confirm
            setDeleteTarget(id);
            toast.info("한 번 더 클릭하면 삭제됩니다", { duration: 2000 });
        }
    };

    const handleReset = () => {
        if (!confirm("모든 마커를 초기 상태로 되돌리시겠습니까?")) return;
        setPositions(initialPositions);
        setDeleteTarget(null);
        toast.info("초기 상태로 복원되었습니다");
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(positions);
            toast.success(`${positions.length}개 마커가 저장되었습니다`);
        } catch {
            toast.error("저장에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setSaving(false);
        }
    };

    // Mobile warning
    if (isMobileWarning) {
        return (
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-8 text-center space-y-4">
                <Monitor className="w-12 h-12 text-neutral-500 mx-auto" />
                <div>
                    <h3 className="text-white font-bold text-lg">데스크톱에서 사용해주세요</h3>
                    <p className="text-neutral-500 text-sm mt-2">
                        테이블 마커 배치는 정밀한 클릭이 필요합니다.<br />
                        PC 또는 태블릿 가로 모드에서 접속해주세요.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
                <p className="text-sm text-amber-400 font-bold">📍 마커 배치 도구</p>
                <p className="text-xs text-amber-400/80">
                    이미지를 클릭하여 테이블 위치를 지정하세요. 마커를 클릭하면 삭제할 수 있습니다.
                </p>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 font-bold">
                        {positions.length} / {MAX_MARKERS} 마커
                    </span>
                    {/* Type quick selector */}
                    <div className="flex gap-1 ml-2">
                        {TABLE_TYPES.map(t => (
                            <button
                                key={t.value}
                                type="button"
                                onClick={() => setNewType(t.value)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${newType === t.value
                                        ? "bg-white text-black border-white"
                                        : `${t.color} hover:opacity-80`
                                    }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        disabled={!hasChanges}
                        className="h-8 text-xs border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        초기화
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white font-bold"
                    >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {saving ? "저장 중..." : "저장하기"}
                    </Button>
                </div>
            </div>

            {/* Editor Canvas — Desktop view */}
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs font-bold">
                    <Monitor className="w-4 h-4" />
                    <span>편집 뷰</span>
                </div>

                <div
                    ref={containerRef}
                    className="relative rounded-xl overflow-hidden border-2 border-neutral-700 cursor-crosshair"
                    style={{ minWidth: 600 }}
                    onClick={handleImageClick}
                >
                    <img
                        src={floorPlanUrl}
                        alt="클럽 플로어맵"
                        className="w-full h-auto block select-none pointer-events-none"
                        draggable={false}
                        onLoad={() => setImageLoaded(true)}
                    />

                    {!imageLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80">
                            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}

                    {positions.map((marker) => (
                        <button
                            key={marker.id}
                            type="button"
                            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 min-w-[36px] min-h-[36px] flex items-center justify-center group"
                            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMarker(marker.id);
                            }}
                        >
                            <div
                                className={`flex items-center gap-1 px-2 py-1 rounded-full border-2 transition-all duration-200 group-hover:ring-2 group-hover:ring-red-500/40 ${getEditorMarkerStyle(marker.type, deleteTarget === marker.id)}`}
                            >
                                <span className="text-[10px] font-black leading-none">
                                    {marker.label}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Mobile Preview */}
            <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs font-bold">
                    <Smartphone className="w-4 h-4" />
                    <span>모바일 미리보기 (375px)</span>
                </div>

                <div className="mx-auto" style={{ maxWidth: 375 }}>
                    <div className="relative rounded-xl overflow-hidden border border-neutral-700">
                        <img
                            src={floorPlanUrl}
                            alt="모바일 미리보기"
                            className="w-full h-auto block select-none pointer-events-none"
                            draggable={false}
                        />
                        {positions.map((marker) => (
                            <div
                                key={marker.id}
                                className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                            >
                                <div
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all ${getEditorMarkerStyle(marker.type, false)}`}
                                >
                                    <span className="text-[8px] font-black leading-none">
                                        {marker.label}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Marker List Summary */}
            {positions.length > 0 && (
                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-neutral-400 font-bold">등록된 마커 목록</p>
                    <div className="flex flex-wrap gap-1.5">
                        {positions.map(marker => (
                            <span
                                key={marker.id}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold ${marker.type === "VIP"
                                        ? "bg-purple-500/20 border-purple-500/30 text-purple-400"
                                        : marker.type === "Premium"
                                            ? "bg-amber-500/15 border-amber-500/25 text-amber-400"
                                            : "bg-white/10 border-white/20 text-white/60"
                                    }`}
                            >
                                {marker.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* New Marker Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-[#1C1C1E] border-neutral-800 text-white sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-amber-500" />
                            마커 추가
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-neutral-400 text-xs font-bold">테이블 타입</Label>
                            <div className="flex gap-2">
                                {TABLE_TYPES.map(t => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => {
                                            setNewType(t.value);
                                            // Auto-update label when type changes
                                            setNewLabel(getNextLabel(positions, t.value));
                                        }}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all border ${newType === t.value
                                                ? "bg-white text-black border-white"
                                                : `bg-neutral-900 text-neutral-500 border-neutral-700 hover:text-white`
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-neutral-400 text-xs font-bold">라벨 (자동 생성 / 수정 가능)</Label>
                            <Input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="예: S1, V2, VIP-A"
                                className="bg-neutral-900 border-neutral-800 text-white h-10"
                                autoFocus
                            />
                        </div>

                        {pendingCoord && (
                            <p className="text-[10px] text-neutral-600">
                                좌표: ({pendingCoord.x.toFixed(1)}%, {pendingCoord.y.toFixed(1)}%)
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => { setDialogOpen(false); setPendingCoord(null); }}
                            className="border-neutral-700 text-white hover:bg-neutral-800"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={handleConfirmMarker}
                            disabled={!newLabel.trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
                        >
                            <MapPin className="w-4 h-4 mr-1" />
                            마커 추가
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
