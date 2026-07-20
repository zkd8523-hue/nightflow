"use client";

import { useRef } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertCircle, HelpCircle, Sparkles, type LucideIcon } from "lucide-react";

interface ConfirmDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    onCancel?: () => void;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "danger" | "celebrate";
}

export function ConfirmDialog({
    isOpen,
    onOpenChange,
    onConfirm,
    onCancel,
    title,
    description,
    confirmText = "확인",
    cancelText = "취소",
    variant = "default",
}: ConfirmDialogProps) {
    const isDanger = variant === "danger";
    const isCelebrate = variant === "celebrate";
    const handledByButton = useRef(false);

    // ESC 키, 외부 클릭 등으로 Sheet가 닫힐 때도 onCancel 호출 보장
    // 버튼 클릭으로 닫힌 경우 이중 호출 방지
    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if (!open && !handledByButton.current) {
            onCancel?.();
        }
        handledByButton.current = false;
    };

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <SheetContent side="bottom" className="h-auto bg-card border-border rounded-t-[32px] p-6 pb-12 outline-none">
                <SheetHeader className="text-left space-y-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDanger ? "bg-red-500/10" : isCelebrate ? "bg-amber-500/10" : "bg-blue-500/10"}`}>
                            {isDanger ? (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                            ) : isCelebrate ? (
                                <Sparkles className="w-5 h-5 text-brand-amber" />
                            ) : (
                                <HelpCircle className="w-5 h-5 text-blue-500" />
                            )}
                        </div>
                        <SheetTitle className="text-foreground font-black text-xl tracking-tight">
                            {title}
                        </SheetTitle>
                    </div>
                    {description && (
                        <SheetDescription className="text-muted-foreground font-medium leading-relaxed mt-1 whitespace-pre-line">
                            {description}
                        </SheetDescription>
                    )}
                </SheetHeader>

                <div className="grid grid-cols-2 gap-3 mt-8">
                    <Button
                        variant="outline"
                        onClick={() => {
                            handledByButton.current = true;
                            onCancel?.();
                            onOpenChange(false);
                        }}
                        className="h-14 rounded-2xl border-border bg-card/50 text-muted-foreground font-bold hover:bg-muted"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={() => {
                            handledByButton.current = true;
                            onConfirm();
                            onOpenChange(false);
                        }}
                        className={`h-14 rounded-2xl font-black text-lg ${isDanger
                                ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                                : "bg-inverse hover:opacity-90 text-inverse-foreground shadow-lg"
                            }`}
                    >
                        {confirmText}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
