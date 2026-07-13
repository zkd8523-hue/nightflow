"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X, Check, MapPin, Users, Calendar, Coins, MessageCircle, Languages } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FILTER_GROUPS, makeTag } from "@/lib/clubs/tags";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { krwTo } from "@/lib/utils/currency";

// 언어별로 가장 익숙할 통화 하나만 보여줌 (4개 다 나열하면 정보 과다)
const CURRENCY_BY_LANG: Partial<Record<Lang, string>> = {
  en: "USD",
  ja: "JPY",
  zh: "CNY",
  "zh-tw": "TWD",
};
// 한국 깃발 폼(PuzzleForm)의 BUDGET_PRESETS_FIXED와 동일 — 총액 기준 +50만/+10만/+5만
const BUDGET_PRESETS = [500000, 100000, 50000];

// 외국인 컨시어지 요청 폼 (역경매 아님).
// 날짜·인원·예산·지역 + 가고싶은 클럽(최대 3, 옵션) + 연락처 → foreign_requests INSERT → 운영자 수동 연결.
// 한국인 깃발 폼(PuzzleForm)과 분리 — 오퍼/성별/카톡 로직 없음.

type ClubItem = ForeignClubDetail;
// 카드 짧게 탭 = 선택, 길게 누르면(꾹) = 상세정보(ForeignClubDetailPanel) — 좁은 캐러셀 카드에
// 정보 아이콘을 욱여넣지 않고도 상세를 볼 수 있게.
const LONG_PRESS_MS = 450;
const BROWSE_AREAS = ["강남", "홍대", "이태원"];
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
  const [budget, setBudget] = useState(""); // 표시용, 쉼표 포함 (예: "600,000")
  const budgetAmount = () => Number(budget.replace(/[^0-9]/g, "")) || 0;
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

  // 기본(검색 전) 목록: 지역별 추천 상위 4개(강남·홍대·이태원 = 12개)를 한 번 섞어서 노출.
  // 세로로 8~9개 다 보여주지 않고, "더보기"로 나머지를 점진 로딩.
  const RECOMMEND_QUOTA_PER_AREA = 4;
  const LOAD_MORE_BATCH = 8;
  const recommendPool = useMemo(() => {
    return BROWSE_AREAS.flatMap((a) => {
      const sorted = clubs
        .filter((c) => c.area === a)
        .sort((x, y) => {
          const md = (y.has_md ? 1 : 0) - (x.has_md ? 1 : 0);
          if (md !== 0) return md;
          return (y.google_review_count ?? 0) - (x.google_review_count ?? 0);
        });
      return sorted.slice(0, RECOMMEND_QUOTA_PER_AREA);
    });
  }, [clubs]);
  // 이 컴포넌트는 SSR 후 하이드레이션됨 — Math.random()을 렌더 중(useMemo)에 쓰면
  // 서버/클라이언트 셔플 결과가 달라 하이드레이션 불일치가 남. 초기값은 미셔플(서버와 동일)로
  // 두고, 마운트 후 useEffect(클라이언트 전용)에서만 섞는다. 이후엔 recommendPool 참조가
  // 안 바뀌는 한(검색어 입력 등) 재실행 안 되므로 섞인 순서가 세션 내내 유지됨.
  const [shuffledPool, setShuffledPool] = useState(recommendPool);
  useEffect(() => {
    const arr = [...recommendPool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledPool(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendPool]);
  const [visibleExtra, setVisibleExtra] = useState(0);
  const remainingPool = useMemo(() => {
    const shownIds = new Set(shuffledPool.map((c) => c.id));
    return clubs.filter((c) => !shownIds.has(c.id));
  }, [clubs, shuffledPool]);
  const defaultClubs = useMemo(
    () => [...shuffledPool, ...remainingPool.slice(0, visibleExtra)],
    [shuffledPool, remainingPool, visibleExtra]
  );
  const hasMoreDefault = visibleExtra < remainingPool.length;

  const filteredClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    if (!q) return defaultClubs;
    return clubs
      .filter((c) => c.name.toLowerCase().includes(q) || c.name_en?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clubs, clubSearch, defaultClubs]);
  const isSearching = clubSearch.trim().length > 0;

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

  // "Browse clubs" 팝업 — 폼 이탈(페이지 이동) 없이 /clubs 수준 탐색(정렬+필터) 그대로 제공.
  // 카드는 짧게 탭 = toggleClub() 즉시 선택 / 꾹 누르면 = 상세시트(ForeignClubDetailPanel).
  const [browseOpen, setBrowseOpen] = useState(false);
  // recommend: 담당 MD 있는 클럽 우선 + 그 안에서 리뷰 많은 순 (빠르고 확실한 응대 기대)
  // reviews("Most reviewed"): 리뷰 많은 순만 / rating: 평점 높은 순만
  const [browseSortKey, setBrowseSortKey] = useState<"recommend" | "reviews" | "rating">("recommend");
  const [browseVenueType, setBrowseVenueType] = useState<string | null>(null);
  const [browseGenre, setBrowseGenre] = useState<string | null>(null);
  const [detailClub, setDetailClub] = useState<ClubItem | null>(null);
  const venueTypeGroup = FILTER_GROUPS.find((g) => g.group === "venue_type");
  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");

  const browseGroups = useMemo(() => {
    const filtered = clubs.filter((c) => {
      if (browseVenueType && !c.tags?.includes(makeTag("venue_type", browseVenueType))) return false;
      if (browseGenre && !c.tags?.includes(makeTag("genre", browseGenre))) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (browseSortKey === "rating") return (b.google_rating ?? 0) - (a.google_rating ?? 0);
      if (browseSortKey === "recommend") {
        const md = (b.has_md ? 1 : 0) - (a.has_md ? 1 : 0);
        if (md !== 0) return md;
      }
      return (b.google_review_count ?? 0) - (a.google_review_count ?? 0);
    });
    return BROWSE_AREAS
      .map((a) => ({ area: a, items: sorted.filter((c) => c.area === a) }))
      .filter((g) => g.items.length > 0);
  }, [clubs, browseSortKey, browseVenueType, browseGenre]);

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
        budget: budgetAmount() > 0 ? budgetAmount() : null,
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
          lang={lang}
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
        <div className="relative">
          <input
            inputMode="numeric"
            value={budget}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setBudget(raw ? Number(raw).toLocaleString("en-US") : "");
            }}
            placeholder={t("예) 600,000", "e.g. 600,000", "例) 600,000", "例) 600,000")}
            className="w-full h-12 pl-4 pr-9 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[15px] focus:border-amber-500 outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-[15px] font-bold pointer-events-none">
            ₩
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setBudget((budgetAmount() + preset).toLocaleString("en-US"))}
              className="h-10 px-0 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-amber-500/50 font-bold text-[13px] transition-colors"
            >
              {`+₩${(preset / 10000).toFixed(0)}0k`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBudget("")}
            className="h-10 px-0 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-white hover:border-red-500/50 font-bold text-[13px] transition-colors"
          >
            {t("초기화", "Clear", "クリア", "清除")}
          </button>
        </div>
        <p className="text-[12px] text-neutral-500 mt-1.5">
          {t("₩ 기준. 예산에 맞춰 최선의 자리를 잡아드려요", "In ₩. We'll get you the best table for your budget", "₩基準。予算に合わせて最善の席を確保", "以₩计。按预算帮你订最好的位置")}
          {(() => {
            const code = CURRENCY_BY_LANG[lang];
            const amount = budgetAmount();
            if (!code || amount <= 0) return null;
            const converted = krwTo(amount, code);
            return converted ? <span className="text-neutral-400"> (≈ {converted})</span> : null;
          })()}
        </p>
      </section>

      {/* 클럽 (선택) */}
      <section>
        <div className="flex items-center justify-between mb-2">
          {label(<Search className="w-4 h-4 text-green-500" />, t("가고싶은 클럽", "Clubs you want", "行きたいクラブ", "想去的夜店"))}
          <span className="text-[12px] text-neutral-500 font-bold">
            {t("최대 3개 선택 가능", "up to 3", "最大3つ", "最多3家")}
          </span>
        </div>
        {selectedClubIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedClubIds.map((id) => (
              <span key={id} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[13px] font-bold">
                {clubById[id] ? displayClubName(clubById[id]) : ""}
                <button type="button" onClick={() => toggleClub(id)}><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <input
          value={clubSearch}
          onChange={(e) => setClubSearch(e.target.value)}
          placeholder={t("클럽 선택 또는 검색…", "Select or search clubs…", "クラブを選択・検索…", "选择或搜索夜店…")}
          className="w-full h-11 px-4 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-white text-[14px] focus:border-amber-500 outline-none"
        />
        {isSearching ? (
          // 검색 중: 이름으로 스캔하기 좋게 세로 리스트
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
                    {c.thumbnail_url && <img src={c.thumbnail_url} alt={displayClubName(c)} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-white truncate">{displayClubName(c)}</p>
                    <p className="text-[11px] text-neutral-500">{areaLabel(c.area, lang)}</p>
                  </div>
                  {on && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          // 기본(검색 전): 추천 클럽 가로 스크롤 카드 — 짧게 탭 선택 / 꾹 누르면 상세.
          // 스크롤이 끝(-200px 여유)에 닿으면 자동으로 다음 배치 로드 — 버튼 없이 무한스크롤.
          <div
            className="mt-2 flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-4 px-4"
            onScroll={(e) => {
              if (!hasMoreDefault) return;
              const el = e.currentTarget;
              if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 200) {
                setVisibleExtra((n) => n + LOAD_MORE_BATCH);
              }
            }}
          >
            {defaultClubs.map((c) => (
              <ClubCard
                key={c.id}
                club={c}
                selected={selectedClubIds.includes(c.id)}
                onTap={() => toggleClub(c.id)}
                onLongPress={() => setDetailClub(c)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          className="inline-block mt-2 text-[12px] text-green-400 underline underline-offset-2"
        >
          🗺️ {t("모르겠어요? 클럽 둘러보기", "Not sure? Browse clubs", "分からない？クラブを見る", "不确定？浏览夜店")}
        </button>
      </section>

      {/* 클럽 둘러보기 팝업 — /clubs 수준 정렬+필터, 카드 클릭은 선택(toggleClub)으로 */}
      <Sheet open={browseOpen} onOpenChange={setBrowseOpen}>
        <SheetContent side="bottom" className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-black text-[18px] text-white">
                {t("클럽 둘러보기", "Browse clubs", "クラブを見る", "浏览夜店")}
              </SheetTitle>
              <span className="text-[12px] text-neutral-500">
                {selectedClubIds.length}/{MAX_CLUBS} {t("선택됨", "selected", "選択済み", "已选")}
              </span>
            </div>

            {/* 정렬 */}
            <div className="flex items-center gap-2">
              {(["recommend", "reviews", "rating"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBrowseSortKey(k)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                    browseSortKey === k ? "bg-white text-black" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {k === "recommend"
                    ? t("추천순", "Recommend", "おすすめ順", "推荐")
                    : k === "reviews"
                    ? t("리뷰 많은순", "Most reviewed", "レビュー数順", "评价最多")
                    : t("평점순", "Top rated", "評価順", "评分")}
                </button>
              ))}
            </div>

            {/* 세부 필터(타입·장르) — 단일선택 토글 */}
            {(venueTypeGroup || genreGroup) && (
              <div className="space-y-1.5">
                {venueTypeGroup && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {venueTypeGroup.options.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setBrowseVenueType((v) => (v === opt.key ? null : opt.key))}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${
                          browseVenueType === opt.key
                            ? "bg-white text-black"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                        }`}
                      >
                        {TAG_LABEL_I18N[opt.key]?.[lang] ?? opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {genreGroup && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {genreGroup.options.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setBrowseGenre((v) => (v === opt.key ? null : opt.key))}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${
                          browseGenre === opt.key
                            ? "bg-white text-black"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                        }`}
                      >
                        {TAG_LABEL_I18N[opt.key]?.[lang] ?? opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 지역별 목록 */}
            {browseGroups.length > 0 && (
              <p className="text-[11px] text-neutral-600">
                {t("탭하면 선택 · 꾹 누르면 상세정보", "Tap to select · Long-press for details", "タップで選択・長押しで詳細", "轻触选择 · 长按查看详情")}
              </p>
            )}
            {browseGroups.length === 0 && (
              <p className="text-center text-neutral-500 py-10 text-[13px]">
                {t("조건에 맞는 클럽이 없습니다", "No clubs match your filters.", "条件に合うクラブがありません。", "没有符合条件的夜店。")}
              </p>
            )}
            <div className="space-y-5 pb-4">
              {browseGroups.map((g) => (
                <div key={g.area} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-[14px] font-black text-white">{areaLabel(g.area, lang)}</h3>
                    <span className="text-[12px] text-neutral-500">{g.items.length}</span>
                  </div>
                  {/* key: 정렬/필터 바뀌면 DOM 리마운트 → scrollLeft 리셋. 안 그러면 리스트만 바뀌고
                      가로 스크롤 위치는 브라우저가 그대로 들고 있어서 처음 몇 개가 화면 밖으로 밀려남. */}
                  <div
                    key={`${browseSortKey}-${browseVenueType}-${browseGenre}`}
                    className="flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-5 px-5"
                  >
                    {g.items.map((c) => (
                      <ClubCard
                        key={c.id}
                        club={c}
                        selected={selectedClubIds.includes(c.id)}
                        onTap={() => toggleClub(c.id)}
                        onLongPress={() => setDetailClub(c)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setBrowseOpen(false)}
              className="w-full py-3.5 rounded-xl bg-white text-black font-black text-[14px]"
            >
              {t("완료", "Done", "完了", "完成")}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 클럽 상세 (꾹 눌러서 오픈) — Browse 팝업 위에 겹쳐 뜸 */}
      <Sheet open={!!detailClub} onOpenChange={(o) => !o && setDetailClub(null)}>
        <SheetContent side="bottom" className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          {detailClub && (
            <>
              <SheetTitle className="sr-only">{detailClub.name}</SheetTitle>
              <ForeignClubDetailPanel
                club={detailClub}
                lang={lang}
                cta={
                  <button
                    type="button"
                    onClick={() => {
                      toggleClub(detailClub.id);
                      setDetailClub(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 w-full mt-2 py-3.5 rounded-xl font-black text-[15px] transition-colors ${
                      selectedClubIds.includes(detailClub.id)
                        ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        : "bg-amber-500 text-black hover:bg-amber-400"
                    }`}
                  >
                    {selectedClubIds.includes(detailClub.id)
                      ? t("선택 해제", "Remove selection", "選択解除", "取消选择")
                      : t("이 클럽 선택하기", "Select this club", "このクラブを選ぶ", "选择这家夜店")}
                  </button>
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>

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

// 캐러셀 카드 — 짧게 탭하면 onTap(선택), 꾹 누르고 있으면 onLongPress(상세시트).
// 좁은 카드에 별도 정보 아이콘을 넣지 않고도 상세정보 접근 가능하게 하는 용도.
function ClubCard({
  club,
  selected,
  onTap,
  onLongPress,
}: {
  club: ClubItem;
  selected: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = () => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (!firedRef.current) onTap();
      }}
      className="shrink-0 w-[120px] snap-start text-left active:opacity-70 transition-opacity select-none"
    >
      <div className={`relative w-[120px] h-[120px] rounded-2xl overflow-hidden bg-neutral-800 border-2 ${selected ? "border-amber-500" : "border-neutral-800"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {club.thumbnail_url && <img src={club.thumbnail_url} alt={displayClubName(club)} className="w-full h-full object-cover" />}
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-black" strokeWidth={3} />
          </div>
        )}
      </div>
      <p className="text-[13px] font-bold text-white mt-2 truncate">{displayClubName(club)}</p>
      {club.google_rating != null && (
        <p className="text-[12px] text-amber-400">
          ⭐ {club.google_rating.toFixed(1)}
          {club.google_review_count != null && (
            <span className="text-neutral-500"> · {club.google_review_count.toLocaleString()}</span>
          )}
        </p>
      )}
    </button>
  );
}
