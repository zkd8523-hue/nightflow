"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgreeBackButtonProps {
  fallbackHref?: string;
  label?: string;
  kind?: "terms" | "privacy";
}

export function AgreeBackButton({
  fallbackHref = "/",
  label = "동의하고 돌아가기",
  kind,
}: AgreeBackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (kind) {
      sessionStorage.setItem(`nightflow_agreed_${kind}`, "1");
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <Button
      onClick={handleClick}
      className="w-full h-14 bg-inverse text-inverse-foreground hover:opacity-90 font-black text-base rounded-2xl"
    >
      <Check className="w-5 h-5 mr-2" />
      {label}
    </Button>
  );
}
