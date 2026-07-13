"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, X, Check, MapPin, Users, Calendar, Coins, MessageCircle, Languages } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";

// 외국인 컨시어지 요청 폼 (역경매 아님).
// 날짜·인원·예산·지역 + 가고싶은 클럽(최대 3, 옵션) + 연락처 → foreign_requests INSERT → 운영자 수동 연결.
// 한국인 깃발 폼(PuzzleForm)과 분리 — 오퍼/성별/카톡 로직 없음.

type ClubItem = { id: string; name: string; area: string; thumbnail_url: string | null };
const MAX_CLUBS = 3;
const AREAS = ["강남", "홍대", "이태원", "서울 어디든"];
const CONTACT_TYPES = ["whatsapp", "instagram", "email", "wechat", "line"] as const;
type ContactType = (typeof CONTACT_TYPES)[number];
const CONTACT_LABEL: Record<ContactType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
  wechat: "WeChat",
  line: "LINE",
};
const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

export function ForeignRequestForm({
  userId,
  lang,
  clubs,
  presetArea,
  presetClubId,
}: {
  userId: string;
  lang: Lang;
  clubs: ClubItem[];
  presetArea?: string;
  presetClubId?: string;
}) {
  const router = useRouter();
  const t = makeT(lang);

  const [eventDate, setEventDate] = useState("");
  const [area, setArea] = useState<string>(presetArea && AREAS.includes(presetArea) ? presetArea : "");
  const [groupSize, setGroupSize] = useState(2);
  const [budget, setBudget] = useState("");
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>(
    presetClubId && clubs.some((c) => c.id === presetClubId) ? [presetClubId] : []
  );
  const [clubSearch, setClubSearch] = useState("");
  const [contactType, setContactType] = useState<ContactType>("whatsapp");
  const [preferredLang, setPreferredLang] = useState<Lang>(lang);
  const [contactValue, setContactValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // 클럽상세 CTA(ClubsClient)가 sessionStorage "nightflow_book_intent"에 club_id/area를 저장 →
  // 그 클럽을 자동 프리셀렉트 (Gemini의 기존 배관 재사용). 소비 후 삭제.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nightflow_book_intent");
      if (!raw) return;
      sessionStorage.removeItem("nightflow_book_intent");
      const intent = JSON.parse(raw) as { club_id?: string; area?: string };
      if (intent.club_id && clubs.some((c) => c.id === intent.club_id)) {
        setSelectedClubIds((prev) =>
          prev.includes(intent.club_id!) ? prev : [intent.club_id!, ...prev].slice(0, MAX_CLUBS)
        );
      }
      if (intent.area && AREAS.includes(intent.area)) setArea((prev) => prev || intent.area!);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clubById = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);
  const filteredClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    if (!q) return clubs.slice(0, 8);
    return clubs.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clubs, clubSearch]);

  const toggleClub = (id: string) => {
    setSelectedClubIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_CLUBS) {
        toast(t("최대 3개까지 선택할 수 있어요", "Pick up to 3 clubs", "最大3つまで", "最多选3家"));
        return prev;
      }
      return [...prev, id];
    });
  };

  const contactPlaceholder: Record<ContactType, string> = {
    whatsapp: "+1 234 567 890",
    instagram: "@yourhandle",
    email: "you@example.com",
    wechat: "WeChat ID",
    line: "LINE ID",
  };
  const contactHint: Record<ContactType, string> = {
    whatsapp: t("국가번호 포함 (예: +1…)", "Include country code (e.g. +1…)", "国番号を含めて（例: +81…）", "含国家代码（如 +86…）"),
    instagram: "",
    email: "",
    wechat: t("앱에서 직접 추가해드려요", "We'll add you in the app", "アプリで追加します", "我们会在微信加你"),
    line: t("공개 LINE ID 필요", "Needs a public LINE ID", "公開LINE IDが必要", "需公开的 LINE ID"),
  };

  const handleSubmit = async () => {
    if (!eventDate) return toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期"));
    if (!area && selectedClubIds.length === 0)
      return toast.error(t("지역이나 클럽을 골라주세요", "Pick an area or a club", "エリアかクラブを選択", "请选择区域或夜店"));
    if (!contactValue.trim())
      return toast.error(t("연락처를 입력해주세요", "Enter your contact", "連絡先を入力", "请填写联系方式"));

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("foreign_requests").insert({
        user_id: userId,
        lang: preferredLang,
        area: area || null,
        event_date: eventDate,
        group_size: groupSize,
        budget: budget ? parseInt(budget.replace(/[^0-9]/g, ""), 10) : null,
        club_ids: selectedClubIds,
        contact_type: contactType,
        contact_value: contactValue.trim(),
        notes: notes.trim() || null,
      });
      if (error) throw error;

      // 운영자 푸시는 foreign_requests INSERT 트리거(Mig 455)가 자동 발송

      toast.success(t("요청 완료! 곧 연락드릴게요", "Request sent! We'll reach out soon", "リクエスト送信！すぐ連絡します", "已提交！我们会尽快联系你"));
      router.replace(`/${lang === "ko" ? "en" : lang}`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || "";
      toast.error(t("제출 중 오류가 발생했어요", "Something went wrong", "エラーが発生しました", "提交出错") + (msg ? ` (${msg})` : ""));
    } finally {
      setLoading(false);
    }
  };

  const label = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 text-white font-bold mb-2">
      {icon}
      <span>{text}</span>
    </div>
  );

  return (
    <div className="space-y-7">
      {/* 날짜 */}
      <section>
        {label(<Calendar className="w-4 h-4 text-green-500" />, t("날짜", "Date", "日付", "日期"))}
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="w-full h-12 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[15px] focus:border-amber-500 outline-none"
        />
      </section>

      {/* 지역 */}
      <section>
        {label(<MapPin className="w-4 h-4 text-green-500" />, t("지역", "Area", "エリア", "区域"))}
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea((prev) => (prev === a ? "" : a))}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
                area === a ? "bg-white text-black border-transparent" : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
              }`}
            >
              {areaLabel(a, lang)}
            </button>
          ))}
        </div>
      </section>

      {/* 인원 */}
      <section>
        {label(<Users className="w-4 h-4 text-green-500" />, t("인원", "Group size", "人数", "人数"))}
        <div className="flex items-center gap-4 bg-[#1C1C1E] border border-neutral-800 rounded-xl p-2 w-fit">
          <button type="button" onClick={() => setGroupSize((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-lg bg-neutral-800 text-white text-xl font-bold">−</button>
          <span className="min-w-[3rem] text-center text-white font-black text-lg">{groupSize}</span>
          <button type="button" onClick={() => setGroupSize((n) => Math.min(20, n + 1))} className="w-10 h-10 rounded-lg bg-neutral-800 text-white text-xl font-bold">+</button>
        </div>
      </section>

      {/* 예산 */}
      <section>
        {label(<Coins className="w-4 h-4 text-green-500" />, t("총 예산", "Total budget", "予算", "总预算"))}
        <input
          inputMode="numeric"
          value={budget}
          onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={t("예) 600,000", "e.g. 600,000", "例) 600,000", "例) 600,000")}
          className="w-full h-12 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[15px] focus:border-amber-500 outline-none"
        />
        <p className="text-[12px] text-neutral-500 mt-1.5">
          {t("₩ 기준. 예산에 맞춰 최선의 자리를 잡아드려요", "In ₩. We'll get you the best table for your budget", "₩基準。予算に合わせて最善の席を確保", "以₩计。按预算帮你订最好的位置")}
        </p>
      </section>

      {/* 클럽 (선택) */}
      <section>
        {label(<Search className="w-4 h-4 text-green-500" />, t("가고싶은 클럽 (선택)", "Clubs you want (optional)", "行きたいクラブ（任意）", "想去的夜店（可选）"))}
        {selectedClubIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedClubIds.map((id) => (
              <span key={id} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[13px] font-bold">
                {clubById[id]?.name}
                <button type="button" onClick={() => toggleClub(id)}><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <input
          value={clubSearch}
          onChange={(e) => setClubSearch(e.target.value)}
          placeholder={t("클럽 이름 검색…", "Search a club…", "クラブ名を検索…", "搜索夜店…")}
          className="w-full h-11 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[14px] focus:border-amber-500 outline-none"
        />
        <div className="mt-2 flex flex-col gap-1.5">
          {filteredClubs.map((c) => {
            const on = selectedClubIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleClub(c.id)}
                className={`flex items-center gap-3 p-2 rounded-xl border transition-colors text-left ${on ? "bg-amber-500/10 border-amber-500/40" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"}`}
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-800 overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumbnail_url && <img src={c.thumbnail_url} alt={c.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-white truncate">{c.name}</p>
                  <p className="text-[11px] text-neutral-500">{areaLabel(c.area, lang)}</p>
                </div>
                {on && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>
        <Link href={`/${lang === "ko" ? "en" : lang}/clubs`} className="inline-block mt-2 text-[12px] text-green-400 underline underline-offset-2">
          🗺️ {t("모르겠어요? 클럽 둘러보기", "Not sure? Browse clubs", "分からない？クラブを見る", "不确定？浏览夜店")}
        </Link>
      </section>

      {/* 연락처 */}
      <section>
        {label(<MessageCircle className="w-4 h-4 text-green-500" />, t("연락처", "How to reach you", "連絡先", "联系方式"))}
        <div className="flex flex-wrap gap-2 mb-2">
          {CONTACT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setContactType(ct)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border ${contactType === ct ? "bg-white text-black border-transparent" : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"}`}
            >
              {CONTACT_LABEL[ct]}
            </button>
          ))}
        </div>
        <input
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          placeholder={contactPlaceholder[contactType]}
          className="w-full h-12 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[15px] focus:border-amber-500 outline-none"
        />
        {contactHint[contactType] && (
          <p className="text-[12px] text-neutral-500 mt-1.5">{contactHint[contactType]}</p>
        )}
      </section>

      {/* 선호 언어 (컨시어지가 회신할 언어) */}
      <section>
        {label(<Languages className="w-4 h-4 text-green-500" />, t("선호 언어", "Preferred language", "希望の言語", "首选语言"))}
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setPreferredLang(l.code)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border ${
                preferredLang === l.code ? "bg-white text-black border-transparent" : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      {/* 메모 */}
      <section>
        {label(<span className="w-4 h-4" />, t("추가 요청 (선택)", "Anything else? (optional)", "その他（任意）", "备注（可选）"))}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t("예) 생일 파티예요", "e.g. It's a birthday", "例) 誕生日です", "例) 生日派对")}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[14px] focus:border-amber-500 outline-none resize-none"
        />
      </section>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-50"
      >
        {loading ? t("전송 중…", "Sending…", "送信中…", "提交中…") : t("요청 보내기", "Send request — we'll connect you", "リクエスト送信", "提交 — 我们帮你连接")}
      </button>
      <p className="text-center text-[12px] text-neutral-500 -mt-3">
        {t("한국어·인맥 없어도 OK. 우리가 클럽에 연결해드려요.", "No Korean, no connections needed. We connect you.", "韓国語・人脈不要。私たちがつなぎます。", "无需韩语·人脉。我们帮你搞定。")}
      </p>
    </div>
  );
}
