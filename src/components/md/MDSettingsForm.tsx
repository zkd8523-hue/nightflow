"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { ArrowLeft, Smartphone, Instagram, MessageCircle, Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { User, ContactMethodType } from "@/types/database";

const formSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상 입력해주세요"),
  phone: z.string().min(10, "올바른 연락처를 입력해주세요"),
  instagram: z
    .string()
    .min(1, "인스타그램 아이디를 입력해주세요")
    .max(30, "인스타그램 아이디는 30자 이하입니다")
    .regex(/^[a-zA-Z0-9._]+$/, "영문, 숫자, 마침표(.), 밑줄(_)만 가능합니다"),
  kakao_open_chat_url: z
    .string()
    .url("올바른 URL을 입력해주세요")
    .regex(/^https:\/\/open\.kakao\.com\//, "카카오톡 오픈채팅 URL만 가능합니다")
    .or(z.literal(""))
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CONTACT_METHOD_OPTIONS: { value: ContactMethodType; label: string; icon: typeof Instagram }[] = [
  { value: "dm", label: "인스타 DM", icon: Instagram },
  { value: "kakao", label: "오픈채팅", icon: MessageCircle },
  { value: "phone", label: "전화", icon: Phone },
];

export function MDSettingsForm({ user }: { user: User }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>(
    user.preferred_contact_methods || []
  );
  const [methodsDirty, setMethodsDirty] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    mode: "onBlur",
    defaultValues: {
      name: user.name || "",
      phone: user.phone || "",
      instagram: user.instagram || "",
      kakao_open_chat_url: user.kakao_open_chat_url || "",
    },
  });

  const isDirty = form.formState.isDirty || methodsDirty;

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/md/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          preferred_contact_methods: preferredMethods.length > 0 ? preferredMethods : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "저장 중 오류가 발생했습니다.");
      }
      toast.success("프로필이 저장되었습니다");
      form.reset(values);
      setMethodsDirty(false);
      router.refresh();
    } catch (error: unknown) {
      logError(error, "MDSettingsForm");
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="px-4 pt-14">
        <header className="pt-3 pb-5 flex items-center gap-4">
          <Link
            href="/md/dashboard"
            className="p-2 -ml-2 rounded-xl hover:bg-neutral-800/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <h1 className="text-xl font-black text-white tracking-tight">프로필 설정</h1>
        </header>
      </div>

      <form
        id="md-settings-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="px-4 space-y-6"
      >
        {/* 연락처 정보 */}
        <div className="space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-neutral-500" />
            연락처 정보
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-neutral-500 text-xs font-bold uppercase">이름</Label>
              <Input
                {...form.register("name")}
                placeholder="홍길동"
                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
              />
              {form.formState.errors.name && (
                <p className="text-red-500 text-[10px] font-bold">
                  {form.formState.errors.name?.message?.toString()}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-neutral-500 text-xs font-bold uppercase">연락처</Label>
              <Input
                {...form.register("phone", {
                  onChange: (e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    if (digits.length <= 3) {
                      e.target.value = digits;
                    } else if (digits.length <= 7) {
                      e.target.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                    } else {
                      e.target.value = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                    }
                  },
                })}
                inputMode="tel"
                placeholder="010-0000-0000"
                className="bg-neutral-900 border-neutral-800 text-white h-12 focus:ring-white"
              />
              {form.formState.errors.phone && (
                <p className="text-red-500 text-[10px] font-bold">
                  {form.formState.errors.phone?.message?.toString()}
                </p>
              )}
            </div>
          </div>

          {/* Instagram */}
          <div className="space-y-2">
            <Label className="text-neutral-500 text-xs font-bold uppercase flex items-center gap-1.5">
              <Instagram className="w-3.5 h-3.5" />
              인스타그램 아이디 *
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 font-bold">
                @
              </span>
              <Input
                {...form.register("instagram", {
                  onChange: (e) => {
                    e.target.value = e.target.value
                      .replace(/^@/, "")
                      .replace(/[^a-zA-Z0-9._]/g, "");
                  },
                })}
                placeholder="your_instagram_id"
                className="bg-neutral-900 border-neutral-800 text-white h-12 pl-8 font-mono focus:ring-white"
              />
            </div>
            {form.formState.errors.instagram && (
              <p className="text-red-500 text-[10px] font-bold">
                {form.formState.errors.instagram?.message?.toString()}
              </p>
            )}
          </div>

          {/* Kakao Open Chat */}
          <div className="space-y-2">
            <Label className="text-neutral-500 text-xs font-bold uppercase flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              카카오톡 오픈채팅 (선택)
            </Label>
            <Input
              {...form.register("kakao_open_chat_url")}
              placeholder="https://open.kakao.com/o/..."
              className="bg-neutral-900 border-neutral-800 text-white h-12 font-mono text-sm focus:ring-white"
            />
            <p className="text-neutral-600 text-[10px]">낙찰자에게 추가 연락 수단으로 표시됩니다</p>
            {form.formState.errors.kakao_open_chat_url && (
              <p className="text-red-500 text-[10px] font-bold">
                {form.formState.errors.kakao_open_chat_url?.message?.toString()}
              </p>
            )}
          </div>

          {/* 선호 연락 수단 */}
          <div className="space-y-3">
            <Label className="text-neutral-500 text-xs font-bold uppercase">
              낙찰자에게 표시할 연락 수단
            </Label>
            <div className="flex flex-wrap gap-2">
              {CONTACT_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => {
                const isSelected = preferredMethods.includes(value);
                const isDisabled = value === "kakao" && !form.watch("kakao_open_chat_url");
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setPreferredMethods((prev) => {
                        const next = isSelected
                          ? prev.filter((m) => m !== value)
                          : [...prev, value];
                        setMethodsDirty(true);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                      isDisabled
                        ? "bg-neutral-900 text-neutral-700 cursor-not-allowed"
                        : isSelected
                          ? "bg-white text-black"
                          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-neutral-600 text-[10px]">
              {preferredMethods.length === 0
                ? "미선택 시 모든 연락 수단이 표시됩니다"
                : "선택한 수단만 낙찰자에게 표시됩니다"}
            </p>
          </div>
        </div>
      </form>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-40">
        <div className="max-w-lg mx-auto">
          <Button
            type="submit"
            form="md-settings-form"
            disabled={loading || !isDirty}
            className="w-full h-14 bg-white text-black font-black text-lg hover:bg-neutral-200 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              "저장 중..."
            ) : (
              <>
                <Check className="w-5 h-5" />
                저장하기
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
