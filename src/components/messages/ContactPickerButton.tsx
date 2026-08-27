"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { IdCard, Instagram, MessageCircle, Phone } from "lucide-react";
import { encodeContactCard, type ContactCardMethod } from "@/components/messages/ContactCardMessage";
import type { ContactMethodType } from "@/types/database";

interface Profile {
  id: string;
  instagram?: string | null;
  phone?: string | null;
  kakao_open_chat_url?: string | null;
  preferred_contact_methods?: ContactMethodType[] | null;
}

interface Props {
  me: Profile;
  isMd: boolean;
  onSend: (content: string) => void;
  /** 시트 열림 상태를 외부에서 제어할 때 (예: +메뉴에서 열기). 없으면 내부 상태로 관리 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 자체 트리거 칩 버튼을 숨긴다 — 외부에 이미 다른 진입점(+메뉴)이 있을 때 */
  hideTrigger?: boolean;
}

type ContactOption =
  | { method: ContactCardMethod; label: string; value: string; registered: true }
  | { method: "dm" | "kakao"; label: string; registered: false };

/**
 * "연락처 남기기" 칩 버튼 + 선택 시트 + 미등록 채널 인라인 등록 모달.
 * MessageRoom(오퍼 채팅)의 연락처 첨부 기능을 그대로 포크 — 1:1 DM에서도 동일하게 사용.
 */
export function ContactPickerButton({ me, isMd, onSend, open, onOpenChange, hideTrigger }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const contactPickerOpen = open ?? internalOpen;
  const setContactPickerOpen = onOpenChange ?? setInternalOpen;
  const [myContact, setMyContact] = useState({
    instagram: me.instagram ?? null,
    kakao_open_chat_url: me.kakao_open_chat_url ?? null,
  });
  const [registerMethod, setRegisterMethod] = useState<"dm" | "kakao" | null>(null);
  const [registerValue, setRegisterValue] = useState("");
  const [registerPublic, setRegisterPublic] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const contactOptions: ContactOption[] = (() => {
    const list: ContactOption[] = [];
    if (isMd) {
      // MD: 본인이 등록한 채널만 (preferred_contact_methods 필터)
      const methods = me.preferred_contact_methods;
      const showAll = !methods || methods.length === 0;
      if ((showAll || methods!.includes("dm")) && myContact.instagram)
        list.push({ method: "dm", label: "인스타그램 DM", value: myContact.instagram.replace(/^@/, ""), registered: true });
      if ((showAll || methods!.includes("kakao")) && myContact.kakao_open_chat_url)
        list.push({ method: "kakao", label: "카카오 오픈채팅", value: myContact.kakao_open_chat_url, registered: true });
      if ((showAll || methods!.includes("phone")) && me.phone)
        list.push({ method: "phone", label: "전화", value: me.phone, registered: true });
      return list;
    }
    // 유저: 전화(인증됨) + 인스타/오픈챗(등록됨→전송 / 미등록→등록)
    if (me.phone) list.push({ method: "phone", label: "전화번호 · 인증됨", value: me.phone, registered: true });
    if (myContact.instagram) list.push({ method: "dm", label: "인스타그램", value: myContact.instagram.replace(/^@/, ""), registered: true });
    else list.push({ method: "dm", label: "인스타그램", registered: false });
    if (myContact.kakao_open_chat_url) list.push({ method: "kakao", label: "카카오 오픈채팅", value: myContact.kakao_open_chat_url, registered: true });
    else list.push({ method: "kakao", label: "카카오 오픈채팅", registered: false });
    return list;
  })();

  function sendContactCard(method: ContactCardMethod, value: string) {
    setContactPickerOpen(false);
    onSend(encodeContactCard(method, value));
  }

  function openRegister(method: "dm" | "kakao") {
    setRegisterMethod(method);
    setRegisterValue("");
    setRegisterPublic(false);
  }

  async function saveAndSendContact() {
    if (!registerMethod) return;
    const raw = registerValue.trim();
    if (!raw) return;
    let value = raw;
    const update: Record<string, unknown> = {};
    if (registerMethod === "dm") {
      value = raw.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
      if (!value) { toast.error("인스타그램 아이디를 확인해주세요"); return; }
      update.instagram = value;
    } else {
      if (!/^https?:\/\//.test(raw)) { toast.error("오픈채팅 링크를 확인해주세요"); return; }
      update.kakao_open_chat_url = raw;
    }
    if (registerPublic) update.contact_public = true;
    setSavingContact(true);
    const { error } = await createClient().from("users").update(update).eq("id", me.id);
    setSavingContact(false);
    if (error) { toast.error("저장에 실패했어요"); return; }
    setMyContact((c) => registerMethod === "dm" ? { ...c, instagram: value } : { ...c, kakao_open_chat_url: value });
    const m = registerMethod;
    setRegisterMethod(null);
    setContactPickerOpen(false);
    onSend(encodeContactCard(m, value));
  }

  if (contactOptions.length === 0) return null;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setContactPickerOpen(true)}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-bold text-foreground whitespace-nowrap active:bg-muted"
        >
          <IdCard className="w-3.5 h-3.5" />
          {isMd ? "연락처 보내기" : "연락처 남기기"}
        </button>
      )}

      {contactPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => setContactPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg p-3 space-y-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {!isMd && (
                <div className="px-5 pt-4 pb-2.5 border-b border-border/60">
                  <p className="text-[15px] font-black text-foreground">연락처 남기기</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">다른 연락수단을 선호하시다면, 바로 남겨주세요</p>
                </div>
              )}
              {contactOptions.map((opt, i) => {
                const Icon = opt.method === "dm" ? Instagram : opt.method === "kakao" ? MessageCircle : Phone;
                return (
                  <button
                    key={opt.method}
                    onClick={() => (opt.registered ? sendContactCard(opt.method, opt.value) : openRegister(opt.method as "dm" | "kakao"))}
                    className={`w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-foreground hover:bg-muted/40 ${
                      i < contactOptions.length - 1 ? "border-b border-border/60" : ""
                    }`}
                  >
                    <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{opt.label}</span>
                    {opt.registered ? (
                      <span className="text-[13px] text-muted-foreground font-medium truncate max-w-[45%]">
                        {opt.method === "dm" ? `@${opt.value}` : opt.method === "phone" ? opt.value : "보내기"}
                      </span>
                    ) : (
                      <span className="text-[13px] text-brand-amber font-bold shrink-0">등록하고 보내기 →</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setContactPickerOpen(false)}
              className="w-full bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-black text-foreground hover:bg-muted/40"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {registerMethod && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => setRegisterMethod(null)}
        >
          <div
            className="w-full max-w-lg p-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <p className="text-[15px] font-black text-foreground">
                {registerMethod === "dm" ? "인스타그램 아이디" : "카카오 오픈채팅 링크"}
              </p>
              {registerMethod === "dm" ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]">@</span>
                  <input
                    type="text"
                    value={registerValue}
                    onChange={(e) => setRegisterValue(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))}
                    maxLength={30}
                    placeholder="your_instagram_id"
                    autoFocus
                    className="w-full bg-muted border border-border rounded-lg pl-7 pr-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ) : (
                <input
                  type="url"
                  value={registerValue}
                  onChange={(e) => setRegisterValue(e.target.value)}
                  placeholder="https://open.kakao.com/..."
                  autoFocus
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-blue-500"
                />
              )}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registerPublic}
                  onChange={(e) => setRegisterPublic(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-white"
                />
                <span>
                  <span className="block text-[13px] text-foreground font-bold">내 프로필에도 표시하기</span>
                  <span className="block text-[11px] text-muted-foreground">꺼두면 이 대화에서만 공유돼요</span>
                </span>
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setRegisterMethod(null)}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground/80 font-bold text-[14px] hover:bg-muted"
                >
                  취소
                </button>
                <button
                  onClick={saveAndSendContact}
                  disabled={savingContact || !registerValue.trim()}
                  className="flex-1 h-11 rounded-xl bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingContact ? "저장 중..." : "저장하고 보내기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
