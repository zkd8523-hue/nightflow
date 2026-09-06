"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Users, UserRound, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MenuPicker } from "@/components/foreign/MenuPicker";
import { formatBookingContact } from "@/lib/utils/format";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/lib/utils/formDraft";
import { useUnsavedFormGuard } from "@/hooks/useUnsavedFormGuard";
import type { ClubMenuItem, ClubMenuCombo, SelectedMenuSnapshot, KoreanBookingContactType } from "@/types/database";

// 한국 유저 클럽 예약 요청 폼 (컨시어지 모델, foreign_requests와 동일 구조).
// 날짜·인원·주류 + 예약자명·연락처·요청사항 → korean_booking_requests INSERT → 운영자 수동 연결.
// 클럽 상세페이지에서 이미 클럽이 확정된 채로 열리므로, 외국인 폼과 달리
// 클럽 탐색/선택/여행확정 게이트가 없다 — ForeignRequestForm.tsx의 핵심만 추린 버전.

const CONTACT_TYPES: KoreanBookingContactType[] = ["phone", "instagram", "openchat"];
const CONTACT_LABEL: Record<KoreanBookingContactType, string> = {
  phone: "전화번호",
  instagram: "인스타그램",
  openchat: "오픈채팅",
};
const CONTACT_PLACEHOLDER: Record<KoreanBookingContactType, string> = {
  phone: "010-1234-5678",
  instagram: "@yourhandle",
  openchat: "https://open.kakao.com/o/...",
};

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function KoreanBookingForm({
  open,
  onOpenChange,
  clubId,
  clubName,
  clubThumbnailUrl,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  clubName: string;
  clubThumbnailUrl: string | null;
  userId: string;
}) {
  const router = useRouter();

  const [eventDate, setEventDate] = useState("");
  const [dateFocused, setDateFocused] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const openDatePicker = useCallback(() => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      el.focus();
    }
  }, []);

  const [groupSize, setGroupSize] = useState(2);

  // 술 메뉴 — 이 폼은 isBookable(has_md && has_menu) 클럽에서만 열리므로 항상 메뉴가 있다.
  const [menuItems, setMenuItems] = useState<ClubMenuItem[]>([]);
  const [menuCombos, setMenuCombos] = useState<ClubMenuCombo[]>([]);
  const [menuCharge, setMenuCharge] = useState<{ weekday: number | null; weekend: number | null }>(
    { weekday: null, weekend: null },
  );
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuZone, setMenuZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ snapshot: SelectedMenuSnapshot; total: number } | null>(null);
  const [menuDraft, setMenuDraft] = useState<{ snapshot: SelectedMenuSnapshot; total: number } | null>(null);

  const isWeekend = (() => {
    if (!eventDate) return false;
    const d = new Date(eventDate + "T00:00:00").getDay();
    return d === 5 || d === 6;
  })();

  // 시트가 열릴 때마다 메뉴 데이터를 새로 받는다 (클럽 상세페이지 단위라 clubId는 고정).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMenuLoading(true);
    (async () => {
      const supabase = createClient();
      const [itemsRes, combosRes, clubRes] = await Promise.all([
        supabase
          .from("club_menu_items")
          .select("*, variants:club_menu_variants(*), choices:club_menu_choices(*)")
          .eq("club_id", clubId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("club_menu_combos").select("*").eq("club_id", clubId),
        supabase
          .from("clubs")
          .select("table_charge_weekday, table_charge_weekend")
          .eq("id", clubId)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setMenuItems((itemsRes.data ?? []) as ClubMenuItem[]);
      setMenuCombos((combosRes.data ?? []) as ClubMenuCombo[]);
      setMenuCharge({
        weekday: clubRes.data?.table_charge_weekday ?? null,
        weekend: clubRes.data?.table_charge_weekend ?? null,
      });
      setMenuLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, clubId]);

  const [guestName, setGuestName] = useState("");
  const [contactType, setContactType] = useState<KoreanBookingContactType>("phone");
  const [contactValue, setContactValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 강제종료·새로고침·오조작으로 입력하던 걸 통째로 잃는 사고 방지(2026-09-06).
  // "술을 하나라도 담았을 때"부터 지킨다 — 그 전엔 아직 잃을 게 없어서, 여기서
  // 부터 막으면 그냥 구경하다 나가려는 손님까지 붙잡아 오히려 방해가 된다.
  const hasProgress = !!picked;
  const draftKey = `nf_booking_draft_ko_${clubId}`;
  type Draft = {
    eventDate: string;
    groupSize: number;
    picked: { snapshot: SelectedMenuSnapshot; total: number };
    menuZone: string | null;
    guestName: string;
    contactType: KoreanBookingContactType;
    contactValue: string;
    notes: string;
  };
  const { confirmOpen: leaveConfirmOpen, interceptClose, closeConfirm: closeLeaveConfirm } = useUnsavedFormGuard(
    hasProgress && step !== 3
  );
  const [resumePrompt, setResumePrompt] = useState<Draft | null>(null);

  // 시트가 열릴 때 저장된 초안이 있으면 "이어하시겠습니까?"부터 묻는다.
  // 여기서 바로 복원하면 사용자가 원치 않는데도 예전 입력이 튀어나온다.
  useEffect(() => {
    if (!open) return;
    const draft = loadFormDraft<Draft>(draftKey);
    if (draft) setResumePrompt(draft);
  }, [open, draftKey]);

  // 진행 중인 입력을 계속 저장 — 강제종료돼도 다음 방문 때 복원 후보가 된다.
  useEffect(() => {
    if (!open || !hasProgress || step === 3) return;
    saveFormDraft<Draft>(draftKey, {
      eventDate, groupSize, picked: picked!, menuZone, guestName, contactType, contactValue, notes,
    });
  }, [open, hasProgress, step, draftKey, eventDate, groupSize, picked, menuZone, guestName, contactType, contactValue, notes]);

  const applyDraft = (d: Draft) => {
    setEventDate(d.eventDate);
    setGroupSize(d.groupSize);
    setPicked(d.picked);
    setMenuZone(d.menuZone);
    setGuestName(d.guestName);
    setContactType(d.contactType);
    setContactValue(d.contactValue);
    setNotes(d.notes);
    setStep(1);
    setResumePrompt(null);
  };

  // 시트를 닫을 때 다음 오픈을 위해 상태를 리셋 — 언마운트가 아니라 open=false라 상태가 남는다.
  // 진행 중(hasProgress)이었다면 리셋 전에 이미 저장돼 있으므로 다음 방문 때 복원된다.
  useEffect(() => {
    if (open) return;
    setStep(1);
    setEventDate("");
    setGroupSize(2);
    setPicked(null);
    setMenuDraft(null);
    setMenuZone(null);
    setGuestName("");
    setContactType("phone");
    setContactValue("");
    setNotes("");
    setShowConfirm(false);
    setResumePrompt(null);
  }, [open]);

  const validateContact = (type: KoreanBookingContactType, raw: string): string | null => {
    const v = raw.trim();
    if (type === "phone") {
      if (v.replace(/\D/g, "").length < 9) return "전화번호를 확인해주세요";
    } else if (type === "instagram") {
      const h = v.replace(/^@/, "");
      if (h.length < 2 || /\s/.test(h)) return "인스타 아이디를 확인해주세요";
    } else if (type === "openchat") {
      if (!/^https?:\/\//.test(v)) return "오픈채팅 링크를 확인해주세요 (http로 시작)";
    }
    return null;
  };

  const handleSubmit = () => {
    if (!eventDate) {
      toast.error("날짜를 골라주세요");
      openDatePicker();
      return;
    }
    if (menuLoading) return toast.error("메뉴를 불러오는 중이에요");
    if (!picked) return toast.error("술을 먼저 골라주세요");
    if (!guestName.trim()) return toast.error("예약자 이름을 입력해주세요");
    if (!contactValue.trim()) return toast.error("연락처를 입력해주세요");

    const contactErr = validateContact(contactType, contactValue);
    if (contactErr) return toast.error(contactErr);

    setShowConfirm(true);
  };

  const doSubmit = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("korean_booking_requests").insert({
        user_id: userId,
        club_id: clubId,
        event_date: eventDate,
        group_size: groupSize,
        selected_menu: picked?.snapshot ?? null,
        selected_menu_total: picked?.total ?? null,
        guest_name: guestName.trim(),
        contact_type: contactType,
        contact_value: contactValue.trim(),
        notes: notes.trim() || null,
      });
      if (error) throw error;

      clearFormDraft(draftKey);
      setShowConfirm(false);
      setStep(3);
    } catch (e) {
      const msg = (e as { message?: string })?.message || "";
      if (msg.includes("duplicate_korean_booking_within_24h")) {
        toast.error("이미 접수됐어요. 같은 클럽은 24시간에 1건만 가능해요.");
      } else {
        toast.error("제출 중 오류가 발생했어요" + (msg ? ` (${msg})` : ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const label = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 text-foreground font-bold mb-2">
      {icon}
      <span>{text}</span>
    </div>
  );

  // 스냅샷(DB 저장용, image_url 없음)에는 item_id만 있다 — 요약 카드에서
  // "담은 항목" 시트와 같은 수준(이미지 포함)으로 보여주려면 로드해둔
  // menuItems에서 같은 id를 찾아 이미지를 붙여야 한다(2026-09-06).
  const imageOf = (itemId: string) => menuItems.find((m) => m.id === itemId)?.image_url ?? null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          // 진행 중(주류 담음)인데 바깥 클릭·ESC·X 버튼으로 닫으려 하면
          // 확인 시트를 띄운다 — 예전엔 무조건 막아서 "나갈 방법이 없다"는
          // 사고가 났다(2026-09-06).
          if (!o && interceptClose()) return;
          onOpenChange(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-3xl max-h-[92vh] overflow-y-auto p-5"
        >
          <SheetTitle className="font-black text-[18px] text-foreground mb-4">
            {step === 3 ? "예약 요청 완료" : `${clubName} 예약하기`}
          </SheetTitle>

          {step !== 3 && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border mb-5">
              <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
                {clubThumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clubThumbnailUrl} alt={clubName} className="w-full h-full object-cover" />
                )}
              </div>
              <p className="text-[15px] font-black text-foreground truncate">{clubName}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 pb-8">
              {/* 날짜 */}
              <section>
                {label(<Calendar className="w-4 h-4 text-money" />, "날짜")}
                <div className="relative cursor-pointer" onClick={openDatePicker}>
                  <div
                    className={`w-full h-12 px-4 rounded-xl bg-card border flex items-center justify-between pointer-events-none transition-colors ${
                      dateFocused ? "border-amber-500" : "border-border"
                    }`}
                  >
                    <span className={`text-[15px] ${eventDate ? "text-foreground" : "text-muted-foreground"}`}>
                      {eventDate ? formatEventDate(eventDate) : "날짜 선택"}
                    </span>
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <input
                    ref={dateInputRef}
                    type="date"
                    lang="ko"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    onFocus={() => setDateFocused(true)}
                    onBlur={() => setDateFocused(false)}
                    className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                  />
                </div>
              </section>

              {/* 인원 */}
              <section>
                {label(<Users className="w-4 h-4 text-money" />, "인원")}
                <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-2 w-fit">
                  <button type="button" onClick={() => setGroupSize((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">−</button>
                  <span className="min-w-[3rem] text-center text-foreground font-black text-lg">{groupSize}</span>
                  <button type="button" onClick={() => setGroupSize((n) => Math.min(20, n + 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">+</button>
                </div>
                <p className="text-[12px] text-muted-foreground mt-1.5">대략만 적어도 괜찮아요. 나중에 바뀌어도 됩니다.</p>
              </section>

              {/* 주류 선택 */}
              <section>
                {label(<span className="w-4 h-4" />, "주류")}
                {menuLoading ? (
                  <div className="h-12 rounded-xl bg-card border border-border flex items-center px-4 text-[13px] text-muted-foreground">
                    메뉴 불러오는 중…
                  </div>
                ) : picked ? (
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className="w-full rounded-xl border border-amber-500/60 bg-card px-4 py-3 text-left transition-colors"
                  >
                    <span className="text-[13px] text-muted-foreground font-bold">
                      {picked.snapshot.items.length}개 선택됨
                    </span>
                    {/* "담은 항목" 시트(MenuPicker)와 같은 수준으로 — 이미지·이름·
                        옵션·가격까지 여기서도 보여준다(2026-09-06). */}
                    <div className="mt-3 space-y-2.5">
                      {picked.snapshot.items.map((it, i) => {
                        const img = imageOf(it.item_id);
                        return (
                          <div key={i} className="flex items-center gap-2.5">
                            {img && (
                              <div className="w-9 h-9 shrink-0 rounded-md bg-black overflow-hidden flex items-center justify-center">
                                <img src={img} alt="" loading="lazy" className="w-full h-full object-contain pointer-events-none select-none" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold truncate">{it.name_en}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {it.label_en}
                                {it.qty > 1 && ` x${it.qty}`}
                              </p>
                            </div>
                            <span className="text-money font-bold tabular-nums text-[13px] shrink-0">
                              ₩{(it.price * it.qty).toLocaleString("en-US")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
                      <span className="text-[13px] font-bold">합계</span>
                      <span className="text-[17px] font-black text-money tabular-nums shrink-0">
                        ₩{picked.total.toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2.5">변경하려면 다시 탭</p>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!eventDate) {
                        toast.error("날짜를 골라주세요");
                        openDatePicker();
                        return;
                      }
                      setMenuOpen(true);
                    }}
                    className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all flex items-center justify-center"
                  >
                    술 고르기
                  </button>
                )}
              </section>

              {picked && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all"
                >
                  다음
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 pb-8">
              {picked && (
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="w-full rounded-xl border border-amber-500/60 bg-card px-4 py-3 text-left transition-colors"
                >
                  <span className="text-[13px] text-muted-foreground font-bold">
                    {picked.snapshot.items.length}개 선택됨
                  </span>
                  {/* "담은 항목" 시트(MenuPicker)와 같은 수준으로 — 이미지·이름·
                      옵션·가격까지 여기서도 보여준다(2026-09-06). */}
                  <div className="mt-3 space-y-2.5">
                    {picked.snapshot.items.map((it, i) => {
                      const img = imageOf(it.item_id);
                      return (
                        <div key={i} className="flex items-center gap-2.5">
                          {img && (
                            <div className="w-9 h-9 shrink-0 rounded-md bg-black overflow-hidden flex items-center justify-center">
                              <img src={img} alt="" loading="lazy" className="w-full h-full object-contain pointer-events-none select-none" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold truncate">{it.name_en}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {it.label_en}
                              {it.qty > 1 && ` x${it.qty}`}
                            </p>
                          </div>
                          <span className="text-money font-bold tabular-nums text-[13px] shrink-0">
                            ₩{(it.price * it.qty).toLocaleString("en-US")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold">합계</span>
                    <span className="text-[17px] font-black text-money tabular-nums shrink-0">
                      ₩{picked.total.toLocaleString("en-US")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">변경하려면 다시 탭</p>
                </button>
              )}

              {/* 예약자 이름 */}
              <section>
                {label(<UserRound className="w-4 h-4 text-money" />, "예약자 이름")}
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="입구에서 확인할 이름"
                  className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
                />
              </section>

              {/* 연락처 */}
              <section>
                {label(<MessageCircle className="w-4 h-4 text-money" />, "연락처")}
                <div className="flex flex-wrap gap-2 mb-2">
                  {CONTACT_TYPES.map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => {
                        setContactType(ct);
                        // 채널을 바꾸면 이전 형식이 남는다(전화 하이픈 → 인스타 핸들 등).
                        // 새 채널 규칙으로 다시 포맷해 어색한 값이 그대로 제출되는 걸 막는다.
                        setContactValue((v) => formatBookingContact(ct, v));
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border ${contactType === ct ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
                    >
                      {CONTACT_LABEL[ct]}
                    </button>
                  ))}
                </div>
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(formatBookingContact(contactType, e.target.value))}
                  inputMode={contactType === "phone" ? "numeric" : "text"}
                  placeholder={CONTACT_PLACEHOLDER[contactType]}
                  className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
                />
              </section>

              {/* 요청사항 */}
              <section>
                {label(<span className="w-4 h-4" />, "요청사항 (선택)")}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="예) 생일 파티예요"
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground text-[14px] focus:border-amber-500 outline-none resize-none"
                />
              </section>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {loading ? "전송 중…" : "예약 요청 보내기"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 pb-8 text-center">
              <div className="text-[48px] pt-4">✅</div>
              <div className="space-y-2">
                <h2 className="text-[20px] font-black text-foreground tracking-tight break-keep">요청이 접수됐어요</h2>
                <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">
                  24시간 안에 연락드릴게요.
                </p>
              </div>

              <div className="bg-card rounded-2xl border border-border p-5 text-left space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-muted">
                    {clubThumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={clubThumbnailUrl} alt={clubName} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="text-[15px] font-black text-foreground truncate">{clubName}</p>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">날짜</span>
                  <span className="font-bold text-foreground">{eventDate || "-"}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">인원</span>
                  <span className="font-bold text-foreground">{groupSize}명</span>
                </div>
                {picked && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">금액</span>
                    <span className="font-black text-money">₩{picked.total.toLocaleString("en-US")}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/my-bookings");
                }}
                className="w-full h-14 rounded-full bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 active:scale-[0.99] transition-all"
              >
                내 예약 보기
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.refresh();
                }}
                className="w-full h-11 rounded-full text-muted-foreground font-bold text-[13px] hover:text-foreground transition-colors"
              >
                닫기
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 술 메뉴 시트 */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-background border-border h-[92vh] w-screen max-w-none p-0 overflow-y-auto"
        >
          <SheetTitle className="sr-only">술 고르기</SheetTitle>
          <MenuPicker
            lang="ko"
            items={menuItems}
            combos={menuCombos}
            isWeekend={isWeekend}
            tableChargeWeekday={menuCharge.weekday}
            tableChargeWeekend={menuCharge.weekend}
            zone={menuZone}
            onZoneChange={setMenuZone}
            bottomOffset={0}
            initialSnapshot={picked?.snapshot ?? menuDraft?.snapshot ?? null}
            onDraftChange={(snapshot, total) => setMenuDraft({ snapshot, total })}
            onDone={(snapshot, total) => {
              setPicked({ snapshot, total });
              setMenuDraft({ snapshot, total });
              setMenuOpen(false);
              setStep(2);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* 제출 확인 시트 */}
      <Sheet open={showConfirm} onOpenChange={setShowConfirm}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl p-5">
          <SheetTitle className="font-black text-[18px] text-foreground mb-4">연락처가 맞나요?</SheetTitle>
          <div className="space-y-3 mb-5">
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-muted-foreground">예약자</span>
              <span className="font-bold text-foreground">{guestName}</span>
            </div>
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-muted-foreground">{CONTACT_LABEL[contactType]}</span>
              <span className="font-bold text-foreground">{contactValue}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-12 rounded-xl bg-muted text-foreground font-bold text-[14px]"
            >
              수정
            </button>
            <button
              type="button"
              onClick={doSubmit}
              disabled={loading}
              className="flex-[2] h-12 rounded-xl bg-amber-500 text-black font-black text-[14px] disabled:opacity-50"
            >
              {loading ? "전송 중…" : "보내기"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 강제종료 등으로 남아있던 이전 입력 — 예약 폼 위에 별도 팝업으로 먼저 묻는다. */}
      <ConfirmDialog
        isOpen={!!resumePrompt}
        onOpenChange={(o) => {
          if (!o && resumePrompt) {
            clearFormDraft(draftKey);
            setResumePrompt(null);
          }
        }}
        onCancel={() => {
          clearFormDraft(draftKey);
          setResumePrompt(null);
        }}
        onConfirm={() => resumePrompt && applyDraft(resumePrompt)}
        title="이전에 작성하던 예약이 있어요"
        description={
          resumePrompt
            ? `${resumePrompt.picked.snapshot.items.length}개 주류 · ₩${resumePrompt.picked.total.toLocaleString("en-US")} · 이어서 작성하시겠어요?`
            : undefined
        }
        cancelText="아니요"
        confirmText="이어하기"
      />

      {/* 진행 중(주류 담음)에 바깥 클릭·ESC·X 버튼으로 닫으려 하면 예약 폼 위에
          별도 팝업으로 먼저 확인한다 — 예전엔 무조건 막아서 "나갈 방법이
          없다"는 사고가 났다(2026-09-06). */}
      <ConfirmDialog
        isOpen={leaveConfirmOpen}
        onOpenChange={(o) => !o && closeLeaveConfirm()}
        onCancel={closeLeaveConfirm}
        onConfirm={() => {
          closeLeaveConfirm();
          onOpenChange(false);
        }}
        title="작성 중인 내용이 사라져요"
        description="정말 나가시겠어요?"
        cancelText="이어하기"
        confirmText="닫기"
        variant="danger"
      />
    </>
  );
}
