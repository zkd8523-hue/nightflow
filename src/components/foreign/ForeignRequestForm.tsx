"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X, Check, MapPin, Users, Calendar, Coins, MessageCircle, Languages, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FILTER_GROUPS, makeTag } from "@/lib/clubs/tags";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { krwTo } from "@/lib/utils/currency";
import { pinFeatured } from "@/lib/clubs/foreignSort";
import { trackForeignEvent, trackEvent } from "@/lib/analytics/events";

// 언어별로 가장 익숙할 통화 하나만 보여줌 (4개 다 나열하면 정보 과다)
const CURRENCY_BY_LANG: Partial<Record<Lang, string>> = {
  en: "USD",
  ja: "JPY",
  zh: "CNY",
  "zh-tw": "TWD",
};
// 한국 깃발 폼(PuzzleForm)의 BUDGET_PRESETS_FIXED와 동일 — 총액 기준 +50만/+10만/+5만
const BUDGET_PRESETS = [500000, 100000, 50000];

// 날짜 input 표시용 로케일 — 네이티브 input의 텍스트 렌더링을 안 쓰고 직접 포맷하므로 여기서만 통제.
const DATE_LOCALE: Record<Lang, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN", "zh-tw": "zh-TW" };
function formatEventDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(DATE_LOCALE[lang] ?? "en-US", { year: "numeric", month: "short", day: "numeric" });
}

// 외국인 컨시어지 요청 폼 (역경매 아님).
// 날짜·인원·예산·지역 + 가고싶은 클럽(최대 3, 옵션) + 연락처 → foreign_requests INSERT → 운영자 수동 연결.
// 한국인 깃발 폼(PuzzleForm)과 분리 — 오퍼/성별/카톡 로직 없음.

type ClubItem = ForeignClubDetail;
// 카드 탭 = 상세정보(ForeignClubDetailPanel) 오픈, 카드 우상단 체크 버튼 탭 = 선택.
// (예전엔 꾹 누르기로 상세를 열었는데 발견성이 떨어져서, 탭 한 번으로 누구나 바로 상세를 보게 바꿈 —
//  대신 선택은 카드 위에 얹은 별도 버튼으로 분리해 "빠른 선택"과 "상세 보기"가 서로 안 막히게 함.)
const BROWSE_AREAS = ["이태원", "강남", "홍대"];
// 이태원 Recommend 상위 3자리 수동 큐레이션 — 자동 알고리즘(리뷰수 기준)이 구글 장소 오매칭 등으로
// 신뢰 못 할 값을 낼 때가 있어(예: BAT 리뷰수 급증), 검증된 클럽 3곳을 고정 후보로 두고 노출 순서만 섞음.
const ITAEWON_RECOMMEND_CURATED = ["Dawn", "BADASS", "Day&night"];
const MAX_CLUBS = 5;
const AREAS = ["이태원", "강남", "홍대", "서울 어디든"];
const CONTACT_TYPES = ["whatsapp", "instagram", "email", "wechat", "line"] as const;
type ContactType = (typeof CONTACT_TYPES)[number];
const CONTACT_LABEL: Record<ContactType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
  wechat: "WeChat",
  line: "LINE",
};
// 흔한 이메일 도메인 오타 → 정타. 강제 교정이 아니라 제출 직전 "혹시 이거 아닌가요?"로만 확인.
// 로그인 없앤 뒤 연락처가 유일한 회신 수단이라, 오타 하나에 리드 전체가 증발함.
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.comm": "gmail.com",
  "naver.con": "naver.com", "naver.co": "naver.com",
  "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com",
  "outlook.con": "outlook.com", "yahoo.con": "yahoo.com",
  "icloud.con": "icloud.com", "iclould.com": "icloud.com",
  "qq.con": "qq.com", "163.con": "163.com",
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
  userId: string | null; // 비로그인 익명 신청 허용 (Mig 489)
  lang: Lang;
  clubs: ClubItem[];
  presetArea?: string;
  presetClubId?: string;
}) {
  const router = useRouter();
  const t = makeT(lang);

  // 외국인 컨시어지 폼 노출 — 전환 퍼널 측정 (SOP 5단계 대체 지표)
  useEffect(() => {
    trackForeignEvent("foreign_request_form_view", { lang, anonymous: !userId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [eventDate, setEventDate] = useState("");
  const [dateFocused, setDateFocused] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const detailTouchStartXRef = useRef<number | null>(null);
  const [area, setArea] = useState<string>(presetArea && AREAS.includes(presetArea) ? presetArea : "이태원");
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
  const [showConfirm, setShowConfirm] = useState(false);
  // 여행 확정 게이트 — 계획중(막연) 유저는 깃발 마켓 오염·MD 오퍼 낭비라 걸러 홈으로 회유.
  // 클럽 상세에서 특정 클럽 의도를 갖고 온 경우(presetClubId)는 이미 확정에 가까워 스킵.
  const [tripStatus, setTripStatus] = useState<null | "qualified" | "planning">(
    presetClubId ? "qualified" : null
  );

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
  const venueTypeGroup = FILTER_GROUPS.find((g) => g.group === "venue_type");
  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");

  // 정렬: 추천순(담당 MD 우선+리뷰순) / 리뷰 많은순 / 평점순.
  // 타입·장르 필터는 여기 넣지 않음 — 태그 커버리지가 낮아(83%) 리뷰 많은 주요 클럽 다수가
  // 태그 미입력 상태라 필터를 켜면 오히려 손해. 세밀한 필터링은 "Browse clubs" 팝업에서.
  const [clubSortKey, setClubSortKey] = useState<"recommend" | "reviews" | "rating">("recommend");
  const RECOMMEND_QUOTA_PER_AREA = 4;
  const LOAD_MORE_BATCH = 8;
  const INITIAL_BATCH = 8;
  // 위쪽 "지역" 탭에서 특정 지역을 고르면 그 지역 클럽만 보여줌 — 미선택/"서울 어디든"이면 3지역 섞어서 노출.
  const areaScope = useMemo(
    () => (area && BROWSE_AREAS.includes(area) ? [area] : BROWSE_AREAS),
    [area]
  );
  const areaScopedClubs = useMemo(
    () => (area && BROWSE_AREAS.includes(area) ? clubs.filter((c) => c.area === area) : clubs),
    [clubs, area]
  );

  // 이태원 큐레이션 후보 3곳 — 매 로드마다 서로 순서만 섞음(노출 다양성).
  // 하이드레이션 안전: 초기값은 미셔플(서버와 동일), 마운트 후 useEffect에서만 섞음.
  const curatedItaewon = useMemo(
    () =>
      ITAEWON_RECOMMEND_CURATED
        .map((name) => clubs.find((c) => c.area === "이태원" && c.name === name))
        .filter((c): c is ClubItem => Boolean(c)),
    [clubs]
  );
  const [shuffledCurated, setShuffledCurated] = useState(curatedItaewon);
  useEffect(() => {
    const arr = [...curatedItaewon];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledCurated(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curatedItaewon]);

  // 추천순 전용: 지역별 상위 4개(강남·홍대·이태원 = 최대 12개), 담당 MD 우선 → 리뷰순으로 고정.
  // featured_rank(고정 노출 위치)는 추천순에서만 적용 — 리뷰순/평점순엔 미적용(공평).
  // 이태원만 위 큐레이션 3곳을 최상단에 두고(순서는 섞임), 나머지 슬롯은 알고리즘 정렬로 채움.
  const recommendPool = useMemo(() => {
    return areaScope.flatMap((a) => {
      const curated = a === "이태원" ? shuffledCurated : [];
      const curatedIds = new Set(curated.map((c) => c.id));
      const sorted = clubs
        .filter((c) => c.area === a && !curatedIds.has(c.id))
        .sort((x, y) => {
          const md = (y.has_md ? 1 : 0) - (x.has_md ? 1 : 0);
          if (md !== 0) return md;
          return (y.google_review_count ?? 0) - (x.google_review_count ?? 0);
        });
      return [...curated, ...pinFeatured(sorted)].slice(0, RECOMMEND_QUOTA_PER_AREA);
    });
  }, [clubs, areaScope, shuffledCurated]);

  // 리뷰 많은순/평점순 전용: 명시적으로 정렬된 단일 리스트.
  const explicitSorted = useMemo(() => {
    const arr = [...areaScopedClubs];
    arr.sort((a, b) =>
      clubSortKey === "rating"
        ? (b.google_rating ?? 0) - (a.google_rating ?? 0)
        : (b.google_review_count ?? 0) - (a.google_review_count ?? 0)
    );
    return arr;
  }, [areaScopedClubs, clubSortKey]);

  const [visibleExtra, setVisibleExtra] = useState(0);
  // 지역 탭·정렬이 바뀌면 이전 기준으로 쌓인 "더보기" 진행도를 초기화.
  useEffect(() => {
    setVisibleExtra(0);
  }, [area, clubSortKey]);
  const remainingPool = useMemo(() => {
    const shownIds = new Set(recommendPool.map((c) => c.id));
    return areaScopedClubs.filter((c) => !shownIds.has(c.id));
  }, [areaScopedClubs, recommendPool]);
  const defaultClubs = useMemo(() => {
    if (clubSortKey === "recommend") {
      return [...recommendPool, ...remainingPool.slice(0, visibleExtra)];
    }
    return explicitSorted.slice(0, INITIAL_BATCH + visibleExtra);
  }, [clubSortKey, recommendPool, remainingPool, visibleExtra, explicitSorted]);
  const hasMoreDefault =
    clubSortKey === "recommend"
      ? visibleExtra < remainingPool.length
      : INITIAL_BATCH + visibleExtra < explicitSorted.length;

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
        toast(t("최대 5개까지 선택할 수 있어요", "Pick up to 5 clubs", "最大5つまで", "最多选5家"));
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
  // 클럽 상세 시트 — 어느 캐러셀/목록에서 열었는지(detailList)를 같이 기억해서
  // 상세 안에서 ←/→ 로 같은 목록의 옆 클럽으로 바로 넘어갈 수 있게 함.
  const [detailList, setDetailList] = useState<ClubItem[]>([]);
  const [detailIndex, setDetailIndex] = useState(0);
  const detailClub = detailList[detailIndex] ?? null;
  const openDetail = (list: ClubItem[], club: ClubItem) => {
    const idx = list.findIndex((c) => c.id === club.id);
    setDetailList(list);
    setDetailIndex(idx >= 0 ? idx : 0);
  };
  const closeDetail = () => setDetailList([]);
  const hasNextDetail = detailIndex < detailList.length - 1;
  const goPrevDetail = () => setDetailIndex((i) => Math.max(i - 1, 0));
  const goNextDetail = () => setDetailIndex((i) => Math.min(i + 1, detailList.length - 1));

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

  // 연락처 소프트 검증 — 명백히 깨진 값만 차단, 규칙이 제각각인 건(위챗/라인) 통과.
  // 반환값이 있으면 에러 메시지(차단), null이면 통과.
  const validateContact = (type: ContactType, raw: string): string | null => {
    const v = raw.trim();
    if (type === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
        return t("이메일 형식을 확인해주세요 (예: you@example.com)", "Check your email (e.g. you@example.com)", "メール形式を確認してください（例: you@example.com）", "请检查邮箱格式（如 you@example.com）");
    } else if (type === "whatsapp") {
      if (v.replace(/\D/g, "").length < 7)
        return t("국가번호 포함 전화번호를 확인해주세요", "Check your number (include country code)", "国番号を含む番号を確認してください", "请检查号码（含国家代码）");
    } else if (type === "instagram") {
      const h = v.replace(/^@/, "");
      if (h.length < 2 || /\s/.test(h))
        return t("인스타 아이디를 확인해주세요", "Check your Instagram handle", "Instagram IDを確認してください", "请检查 Instagram 账号");
    }
    return null;
  };

  // 흔한 이메일 도메인 오타 감지 (gmail.con → gmail.com). 확인 시트에서 "고치기"로 제안.
  const emailTypoFix = (() => {
    if (contactType !== "email") return null;
    const [local, domain] = contactValue.trim().split("@");
    const fixed = domain ? COMMON_DOMAIN_TYPOS[domain.toLowerCase()] : undefined;
    return local && fixed ? `${local}@${fixed}` : null;
  })();

  // 버튼 클릭 → 형식 검증만 하고 확인 시트를 연다. 실제 전송은 doSubmit.
  const handleSubmit = () => {
    if (!eventDate) return toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期"));
    if (!area && selectedClubIds.length === 0)
      return toast.error(t("지역이나 클럽을 골라주세요", "Pick an area or a club", "エリアかクラブを選択", "请选择区域或夜店"));
    if (!contactValue.trim())
      return toast.error(t("연락처를 입력해주세요", "Enter your contact", "連絡先を入力", "请填写联系方式"));

    // 형식 오타 차단 (소프트: 명백히 깨진 것만)
    const contactErr = validateContact(contactType, contactValue);
    if (contactErr) return toast.error(contactErr);

    // 연락처를 눈으로 다시 확인 — 로그인 없앤 뒤 오타 하나에 리드 전체가 증발하므로.
    setShowConfirm(true);
  };

  // 확인 시트의 "보내기" → 실제 INSERT
  const doSubmit = async () => {
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
      // 전환 완료 측정 (SOP 6단계 대체 지표 — puzzle_created는 외국인 미발동)
      trackForeignEvent("foreign_request_submitted", {
        lang: preferredLang,
        area: area || "club_only",
        club_count: selectedClubIds.length,
        has_budget: budgetAmount() > 0,
        anonymous: !userId,
      });

      setShowConfirm(false);
      toast.success(t("요청 완료! 곧 연락드릴게요", "Request sent! We'll reach out soon", "リクエスト送信！すぐ連絡します", "已提交！我们会尽快联系你"));
      router.replace(`/${lang === "ko" ? "en" : lang}`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || "";
      // 24h rate limit(Mig 489) — 친절한 안내로 전환
      if (msg.includes("duplicate_foreign_request_within_24h")) {
        toast.error(t(
          "이미 접수됐어요. 같은 연락처는 24시간에 1건만 가능해요.",
          "Already received — one request per contact every 24h.",
          "すでに受付済みです。同じ連絡先は24時間に1件までです。",
          "已收到 — 同一联系方式24小时内仅限1次。"
        ));
      } else {
        toast.error(t("제출 중 오류가 발생했어요", "Something went wrong", "エラーが発生しました", "提交出错") + (msg ? ` (${msg})` : ""));
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

  // 게이트 노출 계측 (계획중 이탈 vs 폼 이탈 구분용) — puzzle_form_view/created 사이 최대 이탈 구간.
  useEffect(() => {
    if (tripStatus === null) trackEvent("foreign_trip_gate_view", { lang: preferredLang });
  }, [tripStatus, preferredLang]);

  // ── 여행 확정 게이트 ────────────────────────────────────────────────
  // 계획중(막연)인 사람은 실제 방문 불확실 → MD 오퍼 낭비·마켓 오염. 확정된 유저만 폼 노출.
  if (tripStatus === null) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-card rounded-3xl border border-border p-6 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-black text-foreground leading-snug tracking-tight">
              {t(
                "한국 여행 일정이 확정됐나요? 또는 이미 한국인가요?",
                "Is your Korea trip confirmed, or are you already in Korea?",
                "韓国旅行の予定は確定していますか？または、もう韓国にいますか？",
                "你的韩国行程确定了吗?或者你已经在韩国了?"
              )}
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
              {t(
                "서울 클럽은 확정된 방문자에게만 실제 오퍼를 보내요.",
                "Seoul clubs send real offers — only for confirmed visitors.",
                "ソウルのクラブは、確定した訪問者にのみ実際のオファーを送ります。",
                "首尔夜店只向确定到访的客人发送真实报价。"
              )}
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => { trackEvent("foreign_trip_gate_qualified", { lang: preferredLang }); setTripStatus("qualified"); }}
              className="w-full h-14 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all break-keep"
            >
              {t("✅ 네 — 예약했거나 이미 한국이에요", "✅ Yes — booked or already in Korea", "✅ はい — 予約済み、または既に韓国", "✅ 是 — 已订票或已在韩国")}
            </button>
            <button
              type="button"
              onClick={() => { trackEvent("foreign_trip_gate_planning", { lang: preferredLang }); setTripStatus("planning"); }}
              className="w-full h-14 rounded-2xl bg-muted border border-border text-foreground/80 font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-muted/60 active:scale-[0.99] transition-all break-keep"
            >
              {t("🗓️ 아직 계획 중이에요", "🗓️ Not yet, just planning", "🗓️ まだ計画中です", "🗓️ 还在计划中")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (tripStatus === "planning") {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-card rounded-3xl border border-border p-7 space-y-5 text-center">
          <div className="text-[40px]">🗓️</div>
          <div className="space-y-2">
            <h2 className="text-[20px] font-black text-foreground tracking-tight break-keep">
              {t("일정이 아직 확정 안 됐나요?", "Trip not locked in yet?", "予定はまだ確定していませんか？", "行程还没定下来?")}
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">
              {t(
                "서두르지 마세요 — 서울 클럽은 당일에도 빠르게 오퍼를 보내요. 일정이 확정되면 그때 다시 오셔도 늦지 않아요. 🎉",
                "No rush — Seoul clubs send offers fast, even same-day. Come back the moment your trip is confirmed and you'll still be right on time. 🎉",
                "焦らないで — ソウルのクラブは当日でも素早くオファーを送ります。予定が確定したら戻ってきても十分間に合います。🎉",
                "别急 — 首尔夜店发报价很快,当天也行。行程一确定再回来也完全来得及。🎉"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/${lang === "ko" ? "en" : lang}`)}
            className="w-full py-3.5 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 active:scale-[0.99] transition-all"
          >
            {t("홈으로", "Back to home", "ホームへ", "返回首页")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 날짜 */}
      <section>
        {label(<Calendar className="w-4 h-4 text-money" />, t("날짜", "Date", "日付", "日期"))}
        {/* 네이티브 date input의 플레이스홀더·표시 텍스트는 lang 속성이 아니라 브라우저/OS 로케일을
            따르는 WebKit 버그가 있음(특히 iOS Safari) — html lang·input lang을 다 맞춰도 한글로 샘.
            그래서 네이티브 입력은 투명하게 깔아 달력 피커 기능만 쓰고, 보이는 텍스트는 우리가 직접
            렌더링(placeholder/포맷 둘 다 우리 통제 하에 있어 로케일 새는 문제 자체가 없음).
            네이티브 입력은 브라우저마다 "달력 아이콘 부분 클릭해야만 피커가 열리고 텍스트 영역
            클릭은 그냥 포커스만 됨" — 그래서 showPicker()로 박스 어디를 눌러도 피커가 열리게 함. */}
        <div
          className="relative cursor-pointer"
          onClick={() => {
            const el = dateInputRef.current;
            if (!el) return;
            try {
              el.showPicker?.();
            } catch {
              el.focus();
            }
          }}
        >
          <div
            className={`w-full h-12 px-4 rounded-xl bg-card border flex items-center justify-between pointer-events-none transition-colors ${
              dateFocused ? "border-amber-500" : "border-border"
            }`}
          >
            <span className={`text-[15px] ${eventDate ? "text-foreground" : "text-muted-foreground"}`}>
              {eventDate ? formatEventDate(eventDate, lang) : t("연도. 월. 일.", "Select date", "日付を選択", "选择日期")}
            </span>
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <input
            ref={dateInputRef}
            type="date"
            lang={lang}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            onFocus={() => setDateFocused(true)}
            onBlur={() => setDateFocused(false)}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
          />
        </div>
      </section>

      {/* 지역 */}
      <section>
        {label(<MapPin className="w-4 h-4 text-money" />, t("지역", "Area", "エリア", "区域"))}
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea((prev) => (prev === a ? "" : a))}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
                area === a ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {areaLabel(a, lang)}
            </button>
          ))}
        </div>
      </section>

      {/* 인원 */}
      <section>
        {label(<Users className="w-4 h-4 text-money" />, t("인원", "Group size", "人数", "人数"))}
        <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-2 w-fit">
          <button type="button" onClick={() => setGroupSize((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">−</button>
          <span className="min-w-[3rem] text-center text-foreground font-black text-lg">{groupSize}</span>
          <button type="button" onClick={() => setGroupSize((n) => Math.min(20, n + 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">+</button>
        </div>
      </section>

      {/* 예산 */}
      <section>
        {label(<Coins className="w-4 h-4 text-money" />, t("총 예산", "Total budget", "予算", "总预算"))}
        <div className="relative">
          <input
            inputMode="numeric"
            value={budget}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setBudget(raw ? Number(raw).toLocaleString("en-US") : "");
            }}
            placeholder={t("예) 600,000", "e.g. 600,000", "例) 600,000", "例) 600,000")}
            className="w-full h-12 pl-4 pr-9 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-[15px] font-bold pointer-events-none">
            ₩
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setBudget((budgetAmount() + preset).toLocaleString("en-US"))}
              className="h-10 px-0 rounded-lg bg-card border border-border text-foreground/80 hover:bg-muted hover:text-foreground hover:border-amber-500/50 font-bold text-[13px] transition-colors"
            >
              {`+₩${(preset / 10000).toFixed(0)}0k`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBudget("")}
            className="h-10 px-0 rounded-lg bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground hover:border-red-500/50 font-bold text-[13px] transition-colors"
          >
            {t("초기화", "Clear", "クリア", "清除")}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5">
          {t("₩ 기준. 예산에 맞춰 최선의 자리를 잡아드려요", "In ₩. We'll get you the best table for your budget", "₩基準。予算に合わせて最善の席を確保", "以₩计。按预算帮你订最好的位置")}
          {(() => {
            const code = CURRENCY_BY_LANG[lang];
            const amount = budgetAmount();
            if (!code || amount <= 0) return null;
            const converted = krwTo(amount, code);
            return converted ? <span className="text-muted-foreground"> (≈ {converted})</span> : null;
          })()}
        </p>
      </section>

      {/* 클럽 (선택) */}
      <section>
        <div className="flex items-center justify-between mb-2">
          {label(<Search className="w-4 h-4 text-money" />, t("가고싶은 클럽", "Clubs you want", "行きたいクラブ", "想去的夜店"))}
          <span className="text-[12px] text-muted-foreground font-bold">
            {t("최대 5개 선택 가능", "up to 5", "最大5つ", "最多5家")}
          </span>
        </div>
        {selectedClubIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedClubIds.map((id) => (
              <span key={id} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-brand-amber text-[13px] font-bold">
                {clubById[id] ? displayClubName(clubById[id]) : ""}
                <button type="button" onClick={() => toggleClub(id)}><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        {/* 정렬 탭 */}
        <div className="flex items-center gap-2">
          {(["recommend", "reviews", "rating"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setClubSortKey(k)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                clubSortKey === k ? "bg-inverse text-inverse-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
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
        {/* 기본: 추천 클럽 가로 스크롤 카드 (검색 중이 아닐 때). 브라우징 우선 노출. */}
        {!isSearching && (
          defaultClubs.length === 0 ? (
            <p className="mt-2 py-4 text-center text-[12px] text-muted-foreground">
              {t("조건에 맞는 클럽이 없습니다", "No clubs match your filters.", "条件に合うクラブがありません。", "没有符合条件的夜店。")}
            </p>
          ) : (
            // 카드 탭하면 상세, ✓ 버튼 탭하면 선택. 스크롤 끝(-200px)에 닿으면 다음 배치 자동 로드.
            // key: 정렬/지역 바뀌면 DOM 리마운트 → scrollLeft 리셋.
            <div
              key={`${clubSortKey}-${area}`}
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
                  onSelect={() => toggleClub(c.id)}
                  onOpenDetail={() => openDetail(defaultClubs, c)}
                  lang={lang}
                />
              ))}
            </div>
          )
        )}
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          className="inline-block mt-2 text-[12px] text-money underline underline-offset-2"
        >
          🗺️ {t("모르겠어요? 클럽 둘러보기", "Not sure? Browse clubs", "分からない？クラブを見る", "不确定？浏览夜店")}
        </button>

        {/* 검색 (하단 보조) — 직접 이름으로 찾을 때만. 검색 시 결과는 바로 아래 세로 리스트. */}
        <input
          value={clubSearch}
          onChange={(e) => setClubSearch(e.target.value)}
          placeholder={t("클럽 선택 또는 검색…", "Select or search clubs…", "クラブを選択・検索…", "选择或搜索夜店…")}
          className="w-full h-11 px-4 mt-3 rounded-xl bg-card border border-border text-foreground text-[14px] focus:border-amber-500 outline-none"
        />
        {isSearching && (
          <div className="mt-2 flex flex-col gap-1.5">
            {filteredClubs.map((c) => {
              const on = selectedClubIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClub(c.id)}
                  className={`flex items-center gap-3 p-2 rounded-xl border transition-colors text-left ${on ? "bg-amber-500/10 border-amber-500/40" : "bg-card border-border hover:border-border"}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.thumbnail_url && <img src={c.thumbnail_url} alt={displayClubName(c)} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-foreground truncate">{displayClubName(c)}</p>
                    <p className="text-[11px] text-muted-foreground">{areaLabel(c.area, lang)}</p>
                  </div>
                  {on && <Check className="w-4 h-4 text-brand-amber shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 클럽 둘러보기 팝업 — /clubs 수준 정렬+필터, 카드 클릭은 선택(toggleClub)으로 */}
      <Sheet open={browseOpen} onOpenChange={setBrowseOpen}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-black text-[18px] text-foreground">
                {t("클럽 둘러보기", "Browse clubs", "クラブを見る", "浏览夜店")}
              </SheetTitle>
              <span className="text-[12px] text-muted-foreground">
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
                    browseSortKey === k ? "bg-inverse text-inverse-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
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
                            ? "bg-inverse text-inverse-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
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
                            ? "bg-inverse text-inverse-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
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
              <p className="text-[11px] text-muted-foreground">
                {t("탭하면 상세정보 · ✓ 눌러서 선택", "Tap for details · Tap ✓ to select", "タップで詳細・✓で選択", "轻触查看详情 · 点 ✓ 选择")}
              </p>
            )}
            {browseGroups.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-[13px]">
                {t("조건에 맞는 클럽이 없습니다", "No clubs match your filters.", "条件に合うクラブがありません。", "没有符合条件的夜店。")}
              </p>
            )}
            <div className="space-y-5 pb-4">
              {browseGroups.map((g) => (
                <div key={g.area} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-[14px] font-black text-foreground">{areaLabel(g.area, lang)}</h3>
                    <span className="text-[12px] text-muted-foreground">{g.items.length}</span>
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
                        onSelect={() => toggleClub(c.id)}
                        onOpenDetail={() => openDetail(g.items, c)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setBrowseOpen(false)}
              className="w-full py-3.5 rounded-xl bg-inverse text-inverse-foreground font-black text-[14px]"
            >
              {t("완료", "Done", "完了", "完成")}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 클럽 상세 (탭해서 오픈) — Browse 팝업 위에 겹쳐 뜸.
          같은 목록(detailList) 안에서 하단 Next 버튼 또는 좌우 스와이프로 옆 클럽으로 바로 이동 가능. */}
      <Sheet open={!!detailClub} onOpenChange={(o) => !o && closeDetail()}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0"
          onTouchStart={(e) => {
            detailTouchStartXRef.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const startX = detailTouchStartXRef.current;
            detailTouchStartXRef.current = null;
            if (startX == null) return;
            const deltaX = e.changedTouches[0].clientX - startX;
            const SWIPE_THRESHOLD = 60;
            if (deltaX > SWIPE_THRESHOLD) goPrevDetail();
            else if (deltaX < -SWIPE_THRESHOLD) goNextDetail();
          }}
        >
          {detailClub && (
            <>
              <SheetTitle className="sr-only">{detailClub.name}</SheetTitle>
              <ForeignClubDetailPanel
                club={detailClub}
                lang={lang}
                cta={
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => toggleClub(detailClub.id)}
                      className={`flex-[7] flex items-center justify-center gap-1.5 py-3.5 rounded-xl font-black text-[15px] transition-colors ${
                        selectedClubIds.includes(detailClub.id)
                          ? "bg-muted text-foreground/80 hover:bg-muted"
                          : "bg-amber-500 text-black hover:bg-amber-400"
                      }`}
                    >
                      {selectedClubIds.includes(detailClub.id)
                        ? t("선택 해제", "Remove selection", "選択解除", "取消选择")
                        : t("이 클럽 선택하기", "Select this club", "このクラブを選ぶ", "选择这家夜店")}
                    </button>
                    {hasNextDetail && (
                      <button
                        type="button"
                        onClick={goNextDetail}
                        className="flex-[3] flex items-center justify-center gap-1 py-3.5 rounded-xl font-black text-[15px] bg-card border border-border text-foreground hover:bg-muted transition-colors"
                      >
                        {t("다음", "Next", "次へ", "下一个")}
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 연락처 */}
      <section>
        {label(<MessageCircle className="w-4 h-4 text-money" />, t("연락처", "How to reach you", "連絡先", "联系方式"))}
        <div className="flex flex-wrap gap-2 mb-2">
          {CONTACT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setContactType(ct)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border ${contactType === ct ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
            >
              {CONTACT_LABEL[ct]}
            </button>
          ))}
        </div>
        <input
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          placeholder={contactPlaceholder[contactType]}
          className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
        />
        {contactHint[contactType] && (
          <p className="text-[12px] text-muted-foreground mt-1.5">{contactHint[contactType]}</p>
        )}
      </section>

      {/* 선호 언어 (컨시어지가 회신할 언어) */}
      <section>
        {label(<Languages className="w-4 h-4 text-money" />, t("선호 언어", "Preferred language", "希望の言語", "首选语言"))}
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setPreferredLang(l.code)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border ${
                preferredLang === l.code ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"
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
          className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground text-[14px] focus:border-amber-500 outline-none resize-none"
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
      <p className="text-center text-[12px] text-muted-foreground -mt-3">
        {t("한국어·인맥 없어도 OK. 우리가 클럽에 연결해드려요.", "No Korean, no connections needed. We connect you.", "韓国語・人脈不要。私たちがつなぎます。", "无需韩语·人脉。我们帮你搞定。")}
      </p>

      {/* 전송 전 최종 확인 — 연락처 오타 자가 검수(로그인 없앤 뒤 유일한 회신선) */}
      <Sheet open={showConfirm} onOpenChange={(o) => { if (!loading) setShowConfirm(o); }}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-card border-border max-w-lg mx-auto p-5 pb-8">
          <SheetTitle className="text-2xl font-black text-foreground tracking-tight">
            {t("연락처가 맞나요?", "Confirm your contact", "連絡先を確認", "确认联系方式")}
          </SheetTitle>

          {/* 연락처 — 오타 확인 핵심 */}
          <div className="relative mt-5 rounded-2xl bg-muted/60 border border-border p-4 pt-5">
            <span className="absolute -top-3 left-4 text-[11px] font-black text-amber-500 bg-amber-500/15 border border-amber-500/40 px-3 py-1 rounded-full">
              {CONTACT_LABEL[contactType]}
            </span>
            <p className="text-[20px] font-black text-foreground break-all leading-tight">
              {contactValue.trim()}
            </p>
            <p className="text-[12px] text-amber-500 font-semibold mt-1 break-keep">
              {t("↑ 한 번만 확인!", "↑ double-check!", "↑ ご確認を！", "↑ 请核对!")}
            </p>
            {emailTypoFix && (
              <button
                type="button"
                onClick={() => setContactValue(emailTypoFix)}
                className="mt-2 w-full text-left px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[13px] text-amber-500 font-bold break-all"
              >
                {t(`혹시 ${emailTypoFix} 아닌가요? 탭하면 고쳐요`, `Did you mean ${emailTypoFix}? Tap to fix`, `もしかして ${emailTypoFix}？タップで修正`, `是想输入 ${emailTypoFix} 吗?点击修正`)}
              </button>
            )}
          </div>

          {/* 요약 */}
          <div className="mt-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("날짜", "Date", "日付", "日期")}</span>
              <span className="text-foreground font-semibold">{eventDate}</span>
            </div>
            {area && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("지역", "Area", "エリア", "区域")}</span>
                <span className="text-foreground font-semibold">{areaLabel(area, lang)}</span>
              </div>
            )}
            {selectedClubIds.length > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">{t("선택 클럽", "Clubs", "クラブ", "夜店")}</span>
                <span className="text-foreground font-semibold text-right break-keep">
                  {selectedClubIds
                    .map((id) => {
                      const c = clubs.find((cl) => cl.id === id);
                      return c ? displayClubName(c) : null;
                    })
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("인원", "People", "人数", "人数")}</span>
              <span className="text-foreground font-semibold">{groupSize}</span>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="flex-1 py-3.5 rounded-full bg-muted text-foreground font-bold disabled:opacity-50"
            >
              {t("수정할게요", "Edit", "修正", "修改")}
            </button>
            <button
              type="button"
              onClick={doSubmit}
              disabled={loading}
              className="flex-[1.5] py-3.5 rounded-full bg-amber-500 text-black font-black hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? t("전송 중…", "Sending…", "送信中…", "提交中…") : t("네, 보낼게요", "Yes, send", "はい、送信", "确认发送")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// 캐러셀 카드 — 카드(썸네일) 탭하면 onOpenDetail(상세시트), 우상단 체크 버튼 탭하면 onSelect(선택).
// 꾹 누르기는 발견성이 낮아서(사용자가 존재를 모름) 제거 — 탭 한 번으로 누구나 상세를 볼 수 있게.
function ClubCard({
  club,
  selected,
  onSelect,
  onOpenDetail,
  lang,
}: {
  club: ClubItem;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  lang: Lang;
}) {
  const t = makeT(lang);
  const reviewsLabel = t("리뷰", "reviews", "件のレビュー", "条评价");
  const selectLabel = t("선택", "Select", "選択", "选择");
  const removeLabel = t("선택 해제", "Remove", "選択解除", "取消选择");

  return (
    <div className="shrink-0 w-[120px] snap-start select-none">
      <div className={`relative w-[120px] h-[120px] rounded-2xl overflow-hidden bg-muted border-2 ${selected ? "border-amber-500" : "border-border"}`}>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${displayClubName(club)} — ${t("상세정보", "details", "詳細", "详情")}`}
          className="block w-full h-full text-left active:opacity-70 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {club.thumbnail_url && <img src={club.thumbnail_url} alt={displayClubName(club)} className="w-full h-full object-cover" />}
        </button>
        <button
          type="button"
          onClick={onSelect}
          aria-label={selected ? removeLabel : selectLabel}
          aria-pressed={selected}
          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
            selected ? "bg-amber-500" : "bg-black/45 border border-white/50 hover:bg-black/65"
          }`}
        >
          {selected && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
        </button>
      </div>
      <p className="text-[13px] font-bold text-foreground mt-2 truncate">{displayClubName(club)}</p>
      {club.google_review_count != null && (
        <p className="text-[12px] text-muted-foreground">
          {club.google_review_count.toLocaleString()} {reviewsLabel}
        </p>
      )}
    </div>
  );
}
