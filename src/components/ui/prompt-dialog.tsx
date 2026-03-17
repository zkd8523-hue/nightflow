"use client";

import { useState, useEffect, useRef } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit3 } from "lucide-react";

interface PromptDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (value: string) => void;
    onCancel?: () => void;
    title: string;
    description?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
}

export function PromptDialog({
    isOpen,
    onOpenChange,
    onConfirm,
    onCancel,
    title,
    description,
    defaultValue = "",
    placeholder = "내용을 입력하세요...",
    confirmText = "확인",
}: PromptDialogProps) {
    const [value, setValue] = useState(defaultValue);
    const handledByButton = useRef(false);

    useEffect(() => {
        if (isOpen) setValue(defaultValue);
    }, [isOpen, defaultValue]);

    // ESC 키, 외부 클릭 등으로 Sheet가 닫힐 때도 onCancel 호출 보장
    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if (!open && !handledByButton.current) {
            onCancel?.();
        }
        handledByButton.current = false;
    };

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-[32px] p-6 pb-12 outline-none">
                <SheetHeader className="text-left space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <Edit3 className="w-5 h-5 text-amber-500" />
                        </div>
                        <SheetTitle className="text-white font-black text-xl tracking-tight">
                            {title}
                        </SheetTitle>
                    </div>
                    {description && (
                        <SheetDescription className="text-neutral-400 font-medium leading-relaxed mt-1">
                            {description}
                        </SheetDescription>
                    )}
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        autoFocus
                        className="bg-neutral-900 border-neutral-800 h-14 text-white font-bold text-lg rounded-2xl focus:ring-amber-500"
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            onClick={() => {
                                handledByButton.current = true;
                                onCancel?.();
                                onOpenChange(false);
                            }}
                            className="h-14 rounded-2xl border-neutral-800 bg-neutral-900/50 text-neutral-400 font-bold hover:bg-neutral-800"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={() => {
                                handledByButton.current = true;
                                onConfirm(value);
                                onOpenChange(false);
                            }}
                            disabled={!value.trim()}
                            className="h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black font-black text-lg shadow-lg"
                        >
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
