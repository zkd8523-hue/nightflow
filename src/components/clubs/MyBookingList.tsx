"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarCheck, Users, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBookingContact } from "@/lib/utils/format";
import type { KoreanBookingRequest, KoreanBookingStatus, KoreanBookingContactType } from "@/types/database";

type Tab = "pending" | "done" | "cancelled";

type BookingWithClub = KoreanBookingRequest & {
  club: { id: string; name: string; area: string; thumbnail_url: string | null } | null;
};

const STATUS_LABEL: Record<KoreanBookingStatus, string> = {
  new: "접수됨",
  contacted: "연락중",
  done: "완료",
  cancelled: "취소됨",
};

const STATUS_CLS: Record<KoreanBookingStatus, string> = {
  new: "text-brand-amber",
  contacted: "text-brand-amber",
  done: "text-money",
  cancelled: "text-muted-foreground",
};

const CONTACT_TYPES: KoreanBookingContactType[] = ["phone", "instagram", "openchat"];
const CONTACT_LABEL: Record<KoreanBookingContactType, string> = {
  phone: "전화번호",
  instagram: "인스타그램",
  openchat: "오픈채팅",
};

interface Props {
  bookings: BookingWithClub[];
}

export function MyBookingList({ bookings: initial }: Props) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initial);
  const [tab, setTab] = useState<Tab>("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const pending: BookingWithClub[] = [];
    const done: BookingWithClub[] = [];
    const cancelled: BookingWithClub[] = [];
    for (const b of bookings) {
      if (b.status === "cancelled") cancelled.push(b);
      else if (b.status === "done") done.push(b);
      else pending.push(b); // new, contacted
    }
    return { pending, done, cancelled };
  }, [bookings]);

  const list = grouped[tab];

  const updateBooking = (id: string, patch: Partial<BookingWithClub>) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-card -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="w-5 h-5 text-brand-amber" />
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">내 예약</h1>
        </div>
      </header>

      <div className="flex gap-1 bg-card rounded-full p-1">
        {([
          ["pending", `진행중 ${grouped.pending.length}`],
          ["done", `완료 ${grouped.done.length}`],
          ["cancelled", `취소 ${grouped.cancelled.length}`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 h-9 rounded-full text-[12px] font-bold transition-colors ${
              tab === key ? "bg-amber-500 text-black" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[14px] text-muted-foreground">
            {tab === "pending" ? "진행중인 예약이 없어요" : tab === "done" ? "완료된 예약이 없어요" : "취소된 예약이 없어요"}
          </p>
          {tab === "pending" && (
            <Link href="/clubs" className="inline-block mt-3 text-[12px] font-bold text-brand-amber hover:underline">
              클럽 둘러보러 가기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/60">
          {list.map((b) => (
            <BookingRow
              key={b.id}
              booking={b}
              open={openId === b.id}
              onToggle={() => setOpenId((prev) => (prev === b.id ? null : b.id))}
              onUpdate={(patch) => updateBooking(b.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  open,
  onToggle,
  onUpdate,
}: {
  booking: BookingWithClub;
  open: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<BookingWithClub>) => void;
}) {
  const thumb = booking.club?.thumbnail_url ?? null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventDate, setEventDate] = useState(booking.event_date);
  const [groupSize, setGroupSize] = useState(booking.group_size);
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [contactType, setContactType] = useState<KoreanBookingContactType>(booking.contact_type);
  const [contactValue, setContactValue] = useState(booking.contact_value);
  const [notes, setNotes] = useState(booking.notes ?? "");

  const wasConfirmedByAdmin = booking.status !== "new";
  const cancellable = booking.status !== "cancelled" && booking.status !== "done";

  const resetDraft = () => {
    setEventDate(booking.event_date);
    setGroupSize(booking.group_size);
    setGuestName(booking.guest_name);
    setContactType(booking.contact_type);
    setContactValue(booking.contact_value);
    setNotes(booking.notes ?? "");
  };

  const saveEdit = async () => {
    if (!guestName.trim()) return toast.error("예약자 이름을 입력해주세요");
    if (!contactValue.trim()) return toast.error("연락처를 입력해주세요");
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("korean_booking_requests")
      .update({
        event_date: eventDate,
        group_size: groupSize,
        guest_name: guestName.trim(),
        contact_type: contactType,
        contact_value: contactValue.trim(),
        notes: notes.trim() || null,
      })
      .eq("id", booking.id);
    setSaving(false);
    if (error) return toast.error(`수정 실패: ${error.message}`);
    onUpdate({ event_date: eventDate, group_size: groupSize, guest_name: guestName.trim(), contact_type: contactType, contact_value: contactValue.trim(), notes: notes.trim() || null });
    setEditing(false);
    toast.success(
      wasConfirmedByAdmin ? "수정됐어요. 운영팀에 재확인 알림을 보냈어요." : "수정됐어요."
    );
  };

  const cancelBooking = async () => {
    if (!window.confirm("이 예약을 취소할까요?")) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("korean_booking_requests")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    setSaving(false);
    if (error) return toast.error(`취소 실패: ${error.message}`);
    onUpdate({ status: "cancelled" });
    toast.success("예약이 취소됐어요");
  };

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex gap-3 py-4 items-center text-left active:opacity-70 transition-opacity"
      >
        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
          {thumb ? (
            <Image src={thumb} alt={booking.club?.name ?? ""} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[20px]">🍾</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-bold ${STATUS_CLS[booking.status]}`}>{STATUS_LABEL[booking.status]}</span>
          <p className="text-foreground font-black text-[14px] leading-snug line-clamp-1">
            {booking.club?.name ?? "클럽 정보 없음"}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <CalendarCheck className="w-3 h-3" />
              {new Date(booking.event_date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
            </span>
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {booking.group_size}명
            </span>
          </div>
        </div>
        {booking.selected_menu_total != null && (
          <span className="text-[13px] font-black text-money tabular-nums shrink-0">
            ₩{booking.selected_menu_total.toLocaleString("en-US")}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="pb-4 -mt-1 space-y-3">
          {!editing ? (
            <div className="rounded-xl bg-card border border-border p-4 space-y-2.5">
              <Row label="예약자" value={booking.guest_name} />
              <Row label={CONTACT_LABEL[booking.contact_type]} value={booking.contact_value} />
              {booking.notes && <Row label="요청사항" value={booking.notes} />}
              {booking.selected_menu && booking.selected_menu.items.length > 0 && (
                <Row
                  label="주류"
                  value={booking.selected_menu.items.map((it) => `${it.name_en}${it.qty > 1 ? ` x${it.qty}` : ""}`).join(" · ")}
                />
              )}
              <Row label="신청일시" value={new Date(booking.created_at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} />

              {(booking.status === "new" || booking.status === "contacted") && (
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex-1 h-10 rounded-lg bg-muted text-foreground/80 text-[13px] font-bold hover:bg-muted/70"
                  >
                    수정
                  </button>
                  {cancellable && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={cancelBooking}
                      className="flex-1 h-10 rounded-lg bg-red-500/10 text-red-400 text-[13px] font-bold hover:bg-red-500/20 disabled:opacity-50"
                    >
                      예약 취소
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-amber-500/40 p-4 space-y-3">
              {wasConfirmedByAdmin && (
                <p className="text-[11px] text-brand-amber leading-relaxed">
                  ⚠️ 운영팀이 이미 확인한 예약이에요. 수정하면 운영팀에 재확인 알림이 갑니다.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">날짜</span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full h-10 px-2 rounded-lg bg-background border border-border text-foreground text-[13px] mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">인원</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={groupSize}
                    onChange={(e) => setGroupSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="w-full h-10 px-2 rounded-lg bg-background border border-border text-foreground text-[13px] mt-1"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">예약자 이름</span>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] mt-1"
                />
              </label>
              <div>
                <span className="text-[11px] text-muted-foreground">연락처</span>
                <div className="flex flex-wrap gap-1.5 mt-1 mb-1.5">
                  {CONTACT_TYPES.map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => {
                        setContactType(ct);
                        // 채널 변경 시 이전 형식(전화 하이픈 등)이 남지 않게 재포맷.
                        setContactValue((v) => formatBookingContact(ct, v));
                      }}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold border ${contactType === ct ? "bg-inverse text-inverse-foreground border-transparent" : "bg-background text-muted-foreground border-border"}`}
                    >
                      {CONTACT_LABEL[ct]}
                    </button>
                  ))}
                </div>
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(formatBookingContact(contactType, e.target.value))}
                  inputMode={contactType === "phone" ? "numeric" : "text"}
                  className="w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-[13px]"
                />
              </div>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">요청사항</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-[13px] mt-1 resize-none"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    resetDraft();
                    setEditing(false);
                  }}
                  className="flex-1 h-10 rounded-lg bg-muted text-foreground/80 text-[13px] font-bold hover:bg-muted/70"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveEdit}
                  className="flex-[2] h-10 rounded-lg bg-amber-500 text-black text-[13px] font-black disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-bold text-foreground text-right">{value}</span>
    </div>
  );
}
