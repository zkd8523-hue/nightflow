"use client";

import { useState, useMemo, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Check, MapPin, Users, UserRound, Calendar, MessageCircle, Languages, ChevronRight, ChevronLeft, Heart, Plus, Sparkles, Music2, ShieldCheck, Mail, Star, CalendarPlus, Instagram } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FILTER_GROUPS, makeTag } from "@/lib/clubs/tags";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { formatAsOfLocale, resolveCurrency, krwTo } from "@/lib/utils/currency";
import { useKrwRates } from "@/lib/utils/useKrwRates";
import { pinFeatured } from "@/lib/clubs/foreignSort";
import { clubTagline } from "@/lib/clubs/bookable";
import { ClubDateCalendar } from "@/components/clubs/ClubDateCalendar";
import { formatOpenDows, formatOpenDowsEn, isClubOpenOn } from "@/lib/utils/clubOpenDays";
import { trackForeignEvent, trackEvent } from "@/lib/analytics/events";
import { getCurrentUtm } from "@/lib/analytics/userEvents";
import { useSavedClubs } from "@/lib/clubs/savedClubs";
import { MenuPicker } from "@/components/foreign/MenuPicker";
import { saveFormDraft, loadFormDraft, clearFormDraft, FOREIGN_BOOKING_DRAFT_KEY } from "@/lib/utils/formDraft";
import { useUnsavedFormGuard } from "@/hooks/useUnsavedFormGuard";
import type { ClubMenuItem, ClubMenuCombo, SelectedMenuSnapshot } from "@/types/database";

// 폼 Step 1의 "Where?" 카드에 붙는 지역 한 줄 설명 — 홈(EnHomeClient REGIONS)과 같은 문장.
// 외국인은 지역 이름만으로는 못 고른다(2026-09-09). 이름 대신 "어떤 밤인지"로 고르게 한다.
const SEOUL_AREAS = ["이태원", "홍대", "강남"];
const AREA_TAGLINE: Record<string, [string, string, string, string, string]> = {
  이태원: ["글로벌, 경계 없는 밤", "Global, borderless night", "グローバルで自由な夜", "国际化、无边界的夜晚", "國際化、無邊界的夜晚"],
  홍대: ["젊고 거친 밤", "Young, wild night", "若くてワイルドな夜", "年轻、狂野的夜晚", "年輕、狂野的夜晚"],
  강남: ["프리미엄, 럭셔리한 밤", "Premium, luxury night", "プレミアムで贅沢な夜", "高端、奢华的夜晚", "高端、奢華的夜晚"],
  부산: ["해변 도시의 밤", "Beach city night", "ビーチシティの夜", "海滨城市的夜晚", "海濱城市的夜晚"],
};


// 날짜 input 표시용 로케일 — 네이티브 input의 텍스트 렌더링을 안 쓰고 직접 포맷하므로 여기서만 통제.
const DATE_LOCALE: Record<Lang, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN", "zh-tw": "zh-TW" };
/** 로컬 날짜를 YYYY-MM-DD로 — toISOString은 UTC라 UTC+9·UTC- 지역에서 하루가 밀린다. */
function ymdLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
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
const BROWSE_AREAS = ["이태원", "홍대", "강남"];
// 지역 칩 이모지 — /en 홈(EnHomeClient의 REGIONS)과 같은 기호를 쓴다. 손님이 홈에서
// 보던 칩과 폼의 칩이 달라 보이면 같은 지역인지 한 번 더 확인하게 된다.
// 여기 없는 지역(대구·광주 등)은 이모지 없이 이름만 — 아무 기호나 붙이면 오히려 오해를 산다.
// 칩으로 낼 지역 — 광주·대구는 예약 가능 클럽이 1~2곳뿐이라 칩을 눌러도 거의 안 좁혀진다.
// 목록에서 빼는 건 아니다("전체"에는 그대로 나온다) — 칩 줄만 짧게 유지한다.
const CHIP_AREAS = ["이태원", "홍대", "강남", "부산"];
const AREA_EMOJI: Record<string, string> = {
  이태원: "🌏",
  강남: "🍾",
  홍대: "🎧",
  부산: "🌊",
};
// 이태원 Recommend 상위 3자리 수동 큐레이션 — 자동 알고리즘(리뷰수 기준)이 구글 장소 오매칭 등으로
// 신뢰 못 할 값을 낼 때가 있어(예: BAT 리뷰수 급증), 검증된 클럽 3곳을 고정 후보로 두고 노출 순서만 섞음.
const ITAEWON_RECOMMEND_CURATED = ["Dawn", "BADASS", "Day&night"];
// 3개면 MD가 비교 제안하기 충분하고, 그 이상은 고르다 지쳐 폼을 못 끝낸다.
// 클럽은 한 곳만 고른다. 호텔을 잡을 때 세 곳을 동시에 찔러놓지 않는 것과 같다 —
// 무엇보다 손님이 그 클럽의 메뉴를 직접 골라 총액을 확정하는 흐름이라, 클럽이
// 여러 곳이면 어느 메뉴판을 담을지 정해지지 않는다.
// 지역별 최소 예산(총액). 강남은 메인 VIP·보틀 단가가 높아 40만으로는 성사가 안 된다
// (MD가 자리를 못 잡아 왕복만 늘고 결국 무산).
// 배열의 첫 값만 쓴다(= 그 지역의 최소주문금액). 나머지 두 값은 예전에 VIP/VVIP/SVIP
// 프리셋 버튼을 그리던 잔재인데, 손님이 고른 메뉴 합계가 곧 가격이라 등급 버튼은
// 의미가 없어져 UI에서 뺐다. 하한선 계산만 남았다.
// 실측 근거 (puzzle_offers 깃발 제시가, 2026-09 기준):
//   홍대 n=171 중앙 80만 / 상위25% 150만    강남 n=39 중앙 100만 / 상위25% 350만
//   이태원 n=15 중앙 50만 / 최고 100만 — 표본이 적어 홍대 기준으로 통일한다.
// 마지막 단은 "+"로 표기해 상한이 아니라 하한임을 드러낸다(더 큰 금액은 직접 입력).
const AREA_BUDGET_TIERS: Record<string, number[]> = {
  "강남": [1000000, 2000000, 3000000],
  "이태원": [500000, 800000, 1500000],
  "홍대": [500000, 800000, 1500000],
};
const FALLBACK_BUDGET_TIERS = [500000, 800000, 1500000];

const AREA_MIN_BUDGET: Record<string, number> = Object.fromEntries(
  Object.entries(AREA_BUDGET_TIERS).map(([area, tiers]) => [area, tiers[0]])
);
const FALLBACK_MIN_BUDGET = FALLBACK_BUDGET_TIERS[0];

// 예전 하드 게이트가 "Yes"를 기억하던 키. 소프트 게이트 전환 후에도 Continue 시 계속 찍어둔다 —
// 다른 화면이 이 키로 "확정 손님"을 판별할 수 있게 호환용으로 남긴다.
const TRIP_GATE_KEY = "nf_trip_gate_qualified";
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

/** ForeignBookingScreen이 상단 "返回"를 폼 안 화면 전환과 연결하는 데 쓰는 핸들. */
export type ForeignRequestFormHandle = {
  /** 지금 이 폼이 뒤로가기를 자체 처리할 수 있으면 처리하고 true, 아니면 false
      (페이지 이동으로 넘어가야 함)를 반환한다. */
  stepBack: () => boolean;
};

export const ForeignRequestForm = forwardRef<ForeignRequestFormHandle, {
  userId: string | null; // 비로그인 익명 신청 허용 (Mig 489)
  lang: Lang;
  /** 로그인 유저의 country_code. 메뉴 가격의 표시 통화를 정하는 데 쓴다 —
      lang보다 정확하다(/en 안에 미국·홍콩·싱가포르가 섞여 있다). */
  countryCode?: string | null;
  clubs: ClubItem[];
  presetArea?: string;
  presetClubId?: string;
}>(function ForeignRequestForm({
  userId,
  lang,
  countryCode = null,
  clubs,
  presetArea,
  presetClubId,
}, ref) {
  const router = useRouter();
  const t = makeT(lang);
  const fx = useKrwRates();
  const fxRates = fx.rates;
  const fxAsOf = formatAsOfLocale(fx.asOfIso, lang);
  // 메뉴 가격 옆에 붙일 통화. country_code가 없으면 lang으로 떨어진다.
  const menuCurrency = resolveCurrency(countryCode, lang);

  // 외국인 컨시어지 폼 노출 — 전환 퍼널 측정 (SOP 5단계 대체 지표)
  useEffect(() => {
    trackForeignEvent("foreign_request_form_view", { lang, anonymous: !userId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [eventDate, setEventDate] = useState("");
  // 네이티브 date input을 버리고 달력을 직접 띄운다 — 브라우저 기본 달력으로는
  // 그 클럽이 안 여는 요일을 못 고르게 막을 방법이 없다(2026-09-06).
  // 덤으로 iOS Safari의 로케일 누수(한글 표기가 새는 문제)도 같이 사라진다.
  const [dateOpen, setDateOpen] = useState(false);
  const openDatePicker = useCallback(() => setDateOpen(true), []);
  const detailTouchStartXRef = useRef<number | null>(null);
  // 기본값 없이 시작한다(2026-09-07). 예전엔 "이태원"으로 시작했는데, 폼에 오는
  // 클럽을 isBookable로 좁힌 뒤로 이태원 예약 가능 클럽이 3곳뿐이라 캐러셀에
  // 3개만 뜨는 상태가 됐다. 지역 칩 UI는 이미 없어져서 손님이 직접 넓힐 수도 없다.
  // 미선택 = 전 지역(= areaScope 기본값)이라 예약 가능한 클럽이 전부 노출된다.
  // AREAS(서울 3곳)가 아니라 실제 목록의 지역으로 검증한다 — 부산·대구·광주에도
  // 예약 가능한 클럽이 있어서, ?area=부산으로 와도 통과시켜야 한다.
  const presetAreaValid =
    !!presetArea && clubs.some((c) => c.area === presetArea);
  const [area, setArea] = useState<string>(presetAreaValid ? presetArea! : "");
  const [groupSize, setGroupSize] = useState(2);
  // 예산 입력은 없앴다(2026-09-07). 폼에 오는 클럽은 전부 isBookable(MD + 주대)이라
  // 손님이 메뉴를 담으면 총액이 확정된다 — 시세를 모르는 외국인에게 금액을 손으로
  // 적게 하는 것 자체가 이탈 지점이었고, 어차피 주대가 있으면 그 숫자는 쓰이지도 않았다.
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>(
    presetClubId && clubs.some((c) => c.id === presetClubId) ? [presetClubId] : []
  );
  const [clubSearch, setClubSearch] = useState("");

  // ── 술 메뉴 선택 ──────────────────────────────────────────────────────────
  // 손님이 고른 클럽의 주대 메뉴를 받아와 직접 담게 한다. 담은 총액이 곧 예약가라
  // 운영자가 MD에게 "얼마짜리 되냐"를 따로 물을 필요가 없어진다.
  const [menuItems, setMenuItems] = useState<ClubMenuItem[]>([]);
  const [menuCombos, setMenuCombos] = useState<ClubMenuCombo[]>([]);
  const [menuCharge, setMenuCharge] = useState<{ weekday: number | null; weekend: number | null }>(
    { weekday: null, weekend: null },
  );
  const [menuLoading, setMenuLoading] = useState(false);
  // 어느 클럽의 메뉴가 로드돼 있는지 — "클럽 고르면 바로 메뉴판" 자동 열기가 로딩 시작 전
  // 빈 상태를 "메뉴 없음"으로 오판하지 않게 한다(2026-09-09).
  const [menuLoadedFor, setMenuLoadedFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 스냅샷(DB 저장용, image_url 없음)에는 item_id만 있다 — 요약 카드에서
  // 한국인 폼(KoreanBookingForm)과 같은 수준(이미지 포함)으로 보여주려면
  // 로드해둔 menuItems에서 같은 id를 찾아 이미지를 붙여야 한다(2026-09-06).
  const imageOf = (itemId: string) => menuItems.find((m) => m.id === itemId)?.image_url ?? null;
  const [menuZone, setMenuZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ snapshot: SelectedMenuSnapshot; total: number } | null>(null);
  // 시트를 Continue 없이 닫았을 때(X·바깥 탭·뒤로가기) 담던 걸 붙잡아두는 초안.
  // 시트가 닫히면 MenuPicker가 통째로 언마운트돼서 자기 상태로는 못 지킨다.
  // picked(확정)와 따로 두는 이유: 최소주문금액을 못 넘긴 중간 상태가 그대로
  // 주문 금액이 되면 안 된다. 초안은 시트를 다시 열 때 되돌려주는 용도만.
  const [menuDraft, setMenuDraft] = useState<{ snapshot: SelectedMenuSnapshot; total: number } | null>(null);

  const selectedClubId = selectedClubIds[0] ?? null;
  // applyDraft가 selectedClubIds와 picked를 함께 복원할 때, 아래 "클럽 전환 시
  // picked 초기화" effect가 그 복원을 덮어쓰지 않도록 한 번만 건너뛰게 하는 플래그.
  const skipPickedResetRef = useRef(false);

  // 고른 클럽의 영업요일 — 달력에서 휴무일을 막는 근거. 클럽을 안 골랐으면
  // 막을 근거가 없으니 null(=제한 없음)이다.
  const selectedClubOpenDows =
    (selectedClubId ? clubs.find((c) => c.id === selectedClubId)?.open_dows : null) ?? null;

  // 날짜 섹션은 클럽보다 위에 있어서, 클럽을 고른 순간 화면 밖(위쪽)에서 나타난다.
  // 고르고 나면 다음 할 일이 날짜인데 그게 안 보이면 폼이 끝난 줄 안다 — 스크롤로 데려간다.
  const dateSectionRef = useRef<HTMLElement | null>(null);
  const prevHadClubRef = useRef(false);
  useEffect(() => {
    const hasClub = selectedClubIds.length > 0;
    // 막 고른 순간에만(없음 → 있음) 움직인다. 이미 고른 상태에서 리렌더될 때마다
    // 화면이 튀면 메뉴를 담다가도 위로 끌려간다.
    if (hasClub && !prevHadClubRef.current && !eventDate) {
      dateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    prevHadClubRef.current = hasClub;
  }, [selectedClubIds, eventDate]);

  // 요일 약어를 언어별로 — 일본어·중국어 화면에 "Fri·Sat"가 섞이지 않게.
  // (2026-09-10 개편으로 Step 2 카드에서도 쓰므로 selectedClubOpenDows에 묶지 않고 인자로 받는다.)
  const dowsIn = (lang2: "ja" | "zh", dows: number[] | null | undefined) => {
    const L = lang2 === "ja" ? ["日", "月", "火", "水", "木", "金", "土"] : ["日", "一", "二", "三", "四", "五", "六"];
    const d = [...(dows ?? [])].sort((a, b) => a - b);
    if (d.length === 7) return lang2 === "ja" ? "毎日" : "每天";
    return d.map((x) => (lang2 === "ja" ? L[x] : `周${L[x]}`)).join("·");
  };
  const closedNotice = selectedClubOpenDows?.length
    ? t(
        `${formatOpenDows(selectedClubOpenDows)} 영업 · 그 외 요일은 선택할 수 없어요 (공휴일·공휴일 전날은 가능)`,
        `Open ${formatOpenDowsEn(selectedClubOpenDows)} · other days can't be selected (holidays and their eves are open)`,
        `${dowsIn("ja", selectedClubOpenDows)} 営業 · 他の曜日は選択できません（祝日・祝日前日は可）`,
        `${dowsIn("zh", selectedClubOpenDows)} 营业 · 其他日期无法选择（节假日及前一天可选）`,
        `${dowsIn("zh", selectedClubOpenDows).replace("周", "週")} 營業 · 其他日期無法選擇（假日及前一天可選）`
      )
    : null;
  // Step 2 추천 카드용 — 짧은 한 줄. 데이터 없으면 null(카드에서 생략).
  const openDowsLine = (dows: number[] | null | undefined): string | null => {
    if (!dows || dows.length === 0 || dows.length === 7) {
      return dows && dows.length === 7 ? t("매일", "Daily", "毎日", "每天", "每天") : null;
    }
    return t(
      `${formatOpenDows(dows)} 영업`,
      `Open ${formatOpenDowsEn(dows)}`,
      `${dowsIn("ja", dows)}営業`,
      `${dowsIn("zh", dows)}营业`,
      `${dowsIn("zh", dows).replace("周", "週")}營業`
    );
  };

  // 금·토는 주말 가격표를 쓴다. 클럽 영업이 새벽까지라 "금요일 밤"이 주말의 시작이다.
  const isWeekend = (() => {
    if (!eventDate) return false;
    const d = new Date(eventDate + "T00:00:00").getDay();
    return d === 5 || d === 6;
  })();

  // 클럽이 바뀌면 이전 클럽 메뉴로 담은 건 무효다 — 반드시 비운다.
  //
  // 단, draft 복원(applyDraft)처럼 "이미 그 클럽에서 고른 picked"를 selectedClubIds와
  // 함께 한번에 되돌리는 경우는 예외다 — 여기서 무조건 setPicked(null)을 하면
  // applyDraft가 막 되살린 picked를 이 effect가 다음 커밋에서 바로 지워버려,
  // "이어하기"로 돌아왔는데 담아둔 주류·클럽 카드가 사라진 것처럼 보였다
  // (2026-09-09). skipPickedResetRef가 true인 동안은 이 클럽 전환 한 번만 건너뛴다.
  useEffect(() => {
    // 초기화만 건너뛴다 — 메뉴 로드는 어떤 경우든 돌아야 한다. 복원 직후에도
    // menuItems가 비어 있으면 hasMenu가 false라 담아둔 주류 요약 카드가 안 뜬다.
    if (skipPickedResetRef.current) {
      skipPickedResetRef.current = false;
    } else {
      setPicked(null);
      setMenuDraft(null);
      setMenuZone(null);
    }
    setMenuLoadedFor(null);
    if (!selectedClubId) {
      setMenuItems([]);
      setMenuCombos([]);
      setMenuCharge({ weekday: null, weekend: null });
      return;
    }
    let alive = true;
    setMenuLoading(true);
    (async () => {
      const supabase = createClient();
      const [itemsRes, combosRes, clubRes] = await Promise.all([
        supabase
          .from("club_menu_items")
          .select("*, variants:club_menu_variants(*), choices:club_menu_choices(*)")
          .eq("club_id", selectedClubId)
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("club_menu_combos").select("*").eq("club_id", selectedClubId),
        supabase
          .from("clubs")
          .select("table_charge_weekday, table_charge_weekend")
          .eq("id", selectedClubId)
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
      setMenuLoadedFor(selectedClubId);
    })();
    return () => {
      alive = false;
    };
  }, [selectedClubId]);

  // 메뉴 데이터가 있는 클럽만 메뉴 단계를 태운다. 아직 29곳뿐이라 나머지는
  // 기존처럼 예산만 받고 운영자가 조율한다.
  const hasMenu = menuItems.length > 0;

  // 담은 메뉴 합계가 곧 주문 금액이다 — 예산 입력을 없앤 뒤로 다른 출처가 없다.
  // 최소주문금액 검증과 DB 저장이 같은 값을 봐야 한다.
  const orderAmount = picked?.total ?? 0;

  // 지역을 비우고 클럽만 고를 수 있어서(지역 칩은 토글로 해제됨) 클럽 쪽 지역도 같이 본다.
  // 여러 지역이 섞이면 가장 높은 하한을 적용 — 강남 한 곳만 껴도 강남 기준.
  // 금액뿐 아니라 "어느 지역이 이 하한을 만들었는지"까지 같이 들고 나온다 —
  // 안내 문구에 지역명을 박아야 왜 이 금액인지가 바로 읽힌다.
  const budgetFloor = (() => {
    const areas: string[] = [];
    if (area) areas.push(area);
    selectedClubIds.forEach((id) => {
      const c = clubs.find((cl) => cl.id === id);
      if (c?.area) areas.push(c.area);
    });
    if (areas.length === 0) return { amount: FALLBACK_MIN_BUDGET, area: null as string | null };
    let top = areas[0];
    let topAmount = AREA_MIN_BUDGET[top] ?? FALLBACK_MIN_BUDGET;
    areas.forEach((a) => {
      const v = AREA_MIN_BUDGET[a] ?? FALLBACK_MIN_BUDGET;
      if (v > topAmount) { top = a; topAmount = v; }
    });
    return { amount: topAmount, area: top };
  })();
  const minBudget = budgetFloor.amount;
  // 버튼에 쓸 3단 값 — 하한을 만든 지역 기준.

  // "Gangnam VIP starts at ₩1,000,000" — 지역을 모르면 지역명 없이 표현.
  const minBudgetNotice = (() => {
    const won = `₩${minBudget.toLocaleString("en-US")}`;
    if (!budgetFloor.area) {
      return t(
        `최소 ${won}부터 가능해요`,
        `Starts at ${won}`,
        `${won}からです`,
        `最低 ${won}`,
        `最低 ${won}`
      );
    }
    const a = areaLabel(budgetFloor.area, lang);
    return t(
      `${a} VIP는 ${won}부터 가능해요`,
      `${a} VIP starts at ${won}`,
      `${a}のVIPは${won}からです`,
      `${a} VIP 最低 ${won}`,
      `${a} VIP 最低 ${won}`
    );
  })();


  const [guestName, setGuestName] = useState("");
  const [contactType, setContactType] = useState<ContactType>("whatsapp");
  const [preferredLang, setPreferredLang] = useState<Lang>(lang);
  const [contactValue, setContactValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // 여행 확정 게이트는 소프트화했다(2026-09-09). 예전엔 폼 앞에 "확정됐나요?" 화면을 두고
  // "아직 계획중"이면 홈으로 돌려보냈다 — 게이트 통과 91세션 중 8건만 제출, 계획 단계
  // 손님은 이메일 하나 못 남기고 이탈. 지금은 Step 1 안의 토글로 두고, 켜면 요청 대신
  // foreign_trip_reminders에 이메일+잠정 날짜만 남긴다(D-3에 링크 메일, Migration 664).
  // 관리자 큐·MD 제안서에는 계획 단계가 섞이지 않는다.
  const [remindMe, setRemindMe] = useState(false);
  const [remindEmail, setRemindEmail] = useState("");
  // 클럽을 고르는 방식 — 추천(기본) / 아는 클럽 직접 선택.
  const [clubMode, setClubMode] = useState<"recommend" | "known">("recommend");
  // 음악 취향(선택). 추천 쇼트리스트를 "부드럽게" 거른다 — 결과가 2곳 미만이면 무시.
  const [genre, setGenre] = useState<string | null>(null);
  // 예산 티어 — DB에 저장하지 않는다. 쇼트리스트 정렬 + 메뉴판 프리셋(세트 1개 미리 담기)용.
  const [tier, setTier] = useState<"table" | "vip">("table");
  // 클럽을 고른 직후 메뉴판을 자동으로 열기 위한 플래그(메뉴 로드가 끝나면 effect가 연다).
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);
  // 접수 번호 — id 앞 6자(대문자) = foreign_requests.ref_code(생성 컬럼, Migration 664). 이메일·관리자와 동일.
  const [requestRef, setRequestRef] = useState<string | null>(null);
  // 폼을 세 장으로 나눈다 — 한 화면에 클럽+메뉴+연락처를 다 우겨넣으면 스크롤이
  // 너무 길어져 "지금 뭘 채우고 있는지"를 잃는다. 호텔 예약 사이트들이 이미
  // 검증한 패턴: 대상(1) → 상세 옵션(2) → 연락처(3).
  //   1장: 클럽(자동 확정) + 날짜 + 인원 → "주류 선택"
  //   2장: 메뉴 시트 (전체화면급) — 담기 완료하면 자동으로 3장
  //   3장: 이름·연락처·언어·메모 → 전송
  // ?club= 프리셋으로 들어와도(클럽 상세의 "Book X") Step 1(Who&where)부터 보여준다 —
  // 클럽은 이미 정해졌지만 인원수 등은 아직 안 받았으므로. 클럽 선택 UI만
  // "이 클럽으로 예약 중" 요약으로 대체한다(아래 렌더 분기).
  const [formStep, setFormStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // 페이지 상단 "返回"(BackButton)에 노출하는 핸들 — ForeignBookingScreen이 ref로
  // 연결한다. true를 반환하면 "이 뒤로가기는 폼이 처리했다"는 뜻이라 BackButton은
  // router.back()/push를 하지 않는다. 클럽만 바꾸려던 손님이 페이지 자체(홈 등)로
  // 튕겨나가던 문제를 여기서 해결한다(2026-09-09).
  //
  // 3장(연락처)에서는 곧장 클럽 목록으로 되돌린다 — "주류 수정"으로 한 단계씩만
  // 물러나면 손님이 "돌아가기"를 여러 번 눌러야 클럽까지 바꿀 수 있는데, 상단
  // "返回"는 화면에 계속 떠 있는 유일한 뒤로가기라 한 번에 가장 바깥(클럽 선택)
  // 으로 보내는 편이 기대에 맞는다. 술 한 단계만 고치고 싶으면 화면 안의
  // "주류 수정" 버튼을 쓰면 된다.
  useImperativeHandle(ref, () => ({
    stepBack: () => {
      if (formStep === 5) { setFormStep(1); return true; }
      if (formStep === 3) { setFormStep(6); return true; } // 3(연락처) → 2½(날짜) — 술은 그대로 두고 날짜만 다시 볼 수 있게
      // 6(날짜)에서 카트(picked)가 있으면 클럽을 지우지 않는다 — 지우면 담은 술이 통째로 사라진다.
      // false를 돌려 BackButton의 초안 가드(guardDraftKey)가 "나가시겠어요?"를 묻게 한다.
      if (formStep === 6 && !presetClubId && !picked) { setSelectedClubIds([]); setFormStep(clubMode === "recommend" ? 2 : 1); return true; }
      if (formStep === 2) { setFormStep(1); return true; }
      return false;
    },
  }));


  // 강제종료·새로고침·오조작으로 입력하던 걸 통째로 잃는 사고 방지(2026-09-06,
  // 한국인 폼과 동일 정책). "술을 하나라도 담았을 때"부터 지킨다 — 클럽 탐색
  // 단계(1장 초반)까지 막으면 그냥 구경하다 나가려는 손님까지 붙잡게 된다.
  type ForeignDraft = {
    eventDate: string;
    groupSize: number;
    area: string;
    selectedClubIds: string[];
    picked: { snapshot: SelectedMenuSnapshot; total: number } | null;
    menuZone: string | null;
    guestName: string;
    contactType: ContactType;
    preferredLang: Lang;
    contactValue: string;
    notes: string;
  };
  const draftKey = FOREIGN_BOOKING_DRAFT_KEY;
  const hasProgress = !!picked;
  // 이 폼은 페이지 자체라 감쌀 최상위 Sheet가 없다 — 바깥 클릭/ESC로 닫히는
  // 위험은 없고(메뉴 시트는 이미 draft로 보호됨), beforeunload만 필요하다.
  useUnsavedFormGuard(hasProgress && formStep !== 4 && formStep !== 5);
  const [resumePrompt, setResumePrompt] = useState<ForeignDraft | null>(null);

  // 마운트 시 1회 — 저장된 초안이 있으면 "이어하시겠습니까?"부터 묻는다.
  useEffect(() => {
    const draft = loadFormDraft<ForeignDraft>(draftKey);
    if (draft?.picked) setResumePrompt(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진행 중인 입력을 계속 저장 — 강제종료돼도 다음 방문 때 복원 후보가 된다.
  useEffect(() => {
    if (!hasProgress || formStep === 4 || formStep === 5) return;
    saveFormDraft<ForeignDraft>(draftKey, {
      eventDate, groupSize, area, selectedClubIds, picked, menuZone,
      guestName, contactType, preferredLang, contactValue, notes,
    });
  }, [hasProgress, formStep, eventDate, groupSize, area, selectedClubIds, picked, menuZone, guestName, contactType, preferredLang, contactValue, notes]);

  // 필드 단위 진행 추적 — 게이트 통과 후 이탈이 어느 입력에서 일어나는지
  // "세션 마지막 이벤트" 역산으로는 안 보였다(2026-09-09). 값이 채워진 시점을
  // 필드별로 한 번만 기록한다(재입력·수정은 중복 집계 안 되게 ref로 막음).
  const trackedFieldsRef = useRef<Set<string>>(new Set());
  const trackFieldOnce = (field: string) => {
    if (trackedFieldsRef.current.has(field)) return;
    trackedFieldsRef.current.add(field);
    trackEvent("foreign_form_field_completed", { lang: preferredLang, field });
  };
  useEffect(() => { if (eventDate) trackFieldOnce("date"); }, [eventDate]);
  useEffect(() => { if (selectedClubIds.length > 0) trackFieldOnce("club"); }, [selectedClubIds]);
  useEffect(() => { if (picked) trackFieldOnce("menu"); }, [picked]);
  useEffect(() => { if (guestName.trim()) trackFieldOnce("name"); }, [guestName]);
  useEffect(() => { if (contactValue.trim()) trackFieldOnce("contact"); }, [contactValue]);

  const applyDraft = (d: ForeignDraft) => {
    setEventDate(d.eventDate);
    setGroupSize(d.groupSize);
    setArea(d.area);
    // selectedClubIds가 바뀌면 "클럽 전환 시 picked 초기화" effect가 뒤따라 도는데,
    // 이 한 번은 새 클럽으로 갈아탄 게 아니라 같은 클럽·같은 picked를 되살리는
    // 것이므로 그 초기화를 건너뛴다.
    skipPickedResetRef.current = true;
    setSelectedClubIds(d.selectedClubIds);
    setPicked(d.picked);
    setMenuZone(d.menuZone);
    setGuestName(d.guestName);
    setContactType(d.contactType);
    setPreferredLang(d.preferredLang);
    setContactValue(d.contactValue);
    setNotes(d.notes);
    // 술까지 담았으면 연락처 단계(3장)로 바로 복귀한다.
    setFormStep(d.picked ? 3 : 1);
    setResumePrompt(null);
  };

  // 클럽상세 CTA(ClubsClient)가 sessionStorage "nightflow_book_intent"에 club_id/area를 저장 →
  // 그 클럽을 자동 프리셀렉트 (Gemini의 기존 배관 재사용). 소비 후 삭제.
  // 지금은 CTA URL에 ?club=도 실리므로(presetClubId) 이 경로는 로그인 왕복 등의 폴백 역할.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nightflow_book_intent");
      if (!raw) return;
      sessionStorage.removeItem("nightflow_book_intent");
      const intent = JSON.parse(raw) as { club_id?: string; area?: string };
      const match = intent.club_id ? clubs.find((c) => c.id === intent.club_id) : undefined;
      if (match) {
        setSelectedClubIds((prev) =>
          prev.includes(match.id) ? prev : [match.id]
        );
      }
      if (intent.area && clubs.some((c) => c.area === intent.area)) {
        setArea((prev) => prev || intent.area!);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 찜해둔 클럽 — 아직 폼에 안 담긴 것만 "원탭 추가" 칩으로 노출.
  // 여러 클럽을 둘러보다 이름을 잊고 재검색하다 이탈하던 구간을 없애는 용도.
  const savedClubs = useSavedClubs();
  const savedNotSelected = useMemo(
    () => savedClubs.filter((s) => !selectedClubIds.includes(s.id) && clubs.some((c) => c.id === s.id)),
    [savedClubs, selectedClubIds, clubs]
  );

  const clubById = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);
  const venueTypeGroup = FILTER_GROUPS.find((g) => g.group === "venue_type");
  const genreGroup = FILTER_GROUPS.find((g) => g.group === "genre");

  // 정렬: 추천순(담당 MD 우선+리뷰순) / 리뷰 많은순 / 평점순.
  // 타입·장르 필터는 여기 넣지 않음 — 태그 커버리지가 낮아(83%) 리뷰 많은 주요 클럽 다수가
  // 태그 미입력 상태라 필터를 켜면 오히려 손해. 세밀한 필터링은 "Browse clubs" 팝업에서.
  // 정렬 탭(Recommend/Most reviewed/Top rated)은 뺐다(2026-09-09) — 예약 가능 클럽이
  // 20곳이라 정렬을 바꿔도 같은 카드가 순서만 뒤집힐 뿐이었고, 고를 게 셋으로 늘어
  // "뭘 눌러야 하지"를 먼저 시키는 화면이 됐다. 목록은 추천순 하나로 간다.
  // 목록에 실제로 들어온 지역만 쓴다(2026-09-07). 예전엔 BROWSE_AREAS(이태원·홍대·강남)를
  // 그대로 돌렸는데, 폼 목록이 isBookable 기준으로 바뀌면서 부산·대구·광주의 예약 가능한
  // 클럽이 clubs에는 들어와도 캐러셀 루프가 그 지역을 안 돌아 영영 안 보였다.
  // 순서는 BROWSE_AREAS를 먼저 두고(서울이 주력) 나머지 지역을 뒤에 붙인다.
  const scopeAreas = useMemo(() => {
    const present = new Set(clubs.map((c) => c.area).filter(Boolean) as string[]);
    const head = BROWSE_AREAS.filter((a) => present.has(a));
    const tail = [...present].filter((a) => !BROWSE_AREAS.includes(a)).sort();
    return [...head, ...tail];
  }, [clubs]);
  // 위쪽 "지역" 탭에서 특정 지역을 고르면 그 지역 클럽만 보여줌 — 미선택이면 전 지역 섞어서 노출.
  const areaScope = useMemo(
    () => (area && scopeAreas.includes(area) ? [area] : scopeAreas),
    [area, scopeAreas]
  );
  const areaScopedClubs = useMemo(
    () => (area && scopeAreas.includes(area) ? clubs.filter((c) => c.area === area) : clubs),
    [clubs, area, scopeAreas]
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

  // 추천순 전용: 지역별로 리뷰 많은 순, featured_rank(고정 노출 위치)는 추천순에만 적용
  // (리뷰순/평점순엔 미적용 — 공평). 이태원만 위 큐레이션 3곳을 최상단에 둔다(순서는 섞임).
  //
  // 지역별 상위 4개로 자르던 quota는 없앴다(2026-09-07). 그건 승인 클럽 106곳에서
  // 볼 만한 것만 추리려던 장치인데, 폼 목록을 isBookable로 좁힌 뒤로 후보가 14곳뿐이라
  // 자르면 예약 가능한 클럽을 오히려 숨기게 된다.
  const recommendPool = useMemo(() => {
    return areaScope.flatMap((a) => {
      const curated = a === "이태원" ? shuffledCurated : [];
      const curatedIds = new Set(curated.map((c) => c.id));
      const sorted = clubs
        .filter((c) => c.area === a && !curatedIds.has(c.id))
        .sort((x, y) => (y.google_review_count ?? 0) - (x.google_review_count ?? 0));
      return [...curated, ...pinFeatured(sorted)];
    });
  }, [clubs, areaScope, shuffledCurated]);

  const [visibleExtra, setVisibleExtra] = useState(0);
  // 지역 탭이 바뀌면 이전 기준으로 쌓인 "더보기" 진행도를 초기화.
  useEffect(() => {
    setVisibleExtra(0);
  }, [area]);
  const remainingPool = useMemo(() => {
    const shownIds = new Set(recommendPool.map((c) => c.id));
    return areaScopedClubs.filter((c) => !shownIds.has(c.id));
  }, [areaScopedClubs, recommendPool]);
  const defaultClubs = useMemo(
    () => [...recommendPool, ...remainingPool.slice(0, visibleExtra)],
    [recommendPool, remainingPool, visibleExtra]
  );

  const filteredClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    if (!q) return defaultClubs;
    return clubs
      .filter((c) => c.name.toLowerCase().includes(q) || c.name_en?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clubs, clubSearch, defaultClubs]);
  const isSearching = clubSearch.trim().length > 0;

  // 같은 걸 다시 누르면 해제, 다른 걸 누르면 교체. 갯수 제한 토스트가 필요 없다.
  const toggleClub = (id: string) => {
    setSelectedClubIds((prev) => (prev[0] === id ? [] : [id]));
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
    // 지역 그룹도 실제 데이터 기준 — BROWSE_AREAS로 고정하면 부산·대구·광주가 통째로 빠진다.
    return scopeAreas
      .map((a) => ({ area: a, items: sorted.filter((c) => c.area === a) }))
      .filter((g) => g.items.length > 0);
  }, [clubs, browseSortKey, browseVenueType, browseGenre, scopeAreas]);

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

  // 제출 시도가 어느 검증에서 막혔는지 기록 — 게이트 통과 후 이탈이 왜
  // 일어나는지가 "세션 마지막 이벤트" 역산으로는 안 보였다(2026-09-09).
  const blocked = (reason: string) => {
    trackEvent("foreign_form_submit_blocked", { lang: preferredLang, reason });
  };

  // 버튼 클릭 → 형식 검증만 하고 확인 시트를 연다. 실제 전송은 doSubmit.
  const handleSubmit = () => {
    if (!eventDate) { blocked("no_date"); return toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期")); }
    if (!area && selectedClubIds.length === 0) {
      blocked("no_area_or_club");
      return toast.error(t("지역이나 클럽을 골라주세요", "Pick an area or a club", "エリアかクラブを選択", "请选择区域或夜店"));
    }
    // 임시저장에서 복원된 날짜, 혹은 날짜를 고른 뒤 클럽을 바꾼 경우 — 달력에서
    // 막았다고 끝이 아니다.
    if (!isClubOpenOn(selectedClubOpenDows, eventDate)) {
      setDateOpen(true);
      blocked("club_closed_that_day");
      return toast.error(
        t(
          "그 날은 클럽이 쉬는 날이에요. 날짜를 다시 골라주세요",
          "The club is closed that day. Please pick another date",
          "その日はクラブが休みです。別の日を選んでください",
          "该夜店当天休息，请另选日期"
        )
      );
    }
    // 담은 총액이 곧 예약 금액이다 — 예산 입력을 없앤 뒤로 메뉴가 유일한 금액 출처라
    // 클럽 선택과 술 담기가 둘 다 필수다.
    if (!selectedClubId) {
      blocked("no_club");
      return toast.error(t("클럽을 골라주세요", "Pick a club", "クラブを選択", "请选择夜店"));
    }
    if (menuLoading) {
      blocked("menu_loading");
      return toast.error(t("메뉴를 불러오는 중이에요", "Loading the menu…", "メニューを読み込み中です", "正在加载酒单"));
    }
    if (!picked) {
      blocked("no_menu_picked");
      return toast.error(t("술을 먼저 골라주세요", "Choose your drinks first", "先にドリンクを選んでください", "请先选择酒水"));
    }
    // 최소주문금액 강제. 이 금액 아래로는 MD가 자리를 못 잡아 왕복만 늘고 결국 무산된다.
    if (orderAmount < minBudget) {
      blocked("under_min_budget");
      return toast.error(minBudgetNotice);
    }
    if (!guestName.trim()) {
      blocked("no_name");
      return toast.error(t("예약자 이름을 입력해주세요", "Enter the name for the booking", "予約者名を入力", "请填写预订人姓名"));
    }
    if (!contactValue.trim()) {
      blocked("no_contact");
      return toast.error(t("연락처를 입력해주세요", "Enter your contact", "連絡先を入力", "请填写联系方式"));
    }

    // 형식 오타 차단 (소프트: 명백히 깨진 것만)
    const contactErr = validateContact(contactType, contactValue);
    if (contactErr) { blocked("contact_format_invalid"); return toast.error(contactErr); }

    // 연락처를 눈으로 다시 확인 — 로그인 없앤 뒤 오타 하나에 리드 전체가 증발하므로.
    setShowConfirm(true);
  };

  // 확인 시트의 "보내기" → 실제 INSERT
  const doSubmit = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      // 유료 광고(구글애즈 등) 채널별 전환 분석용. 새 파싱 로직 없이 세션에 이미
      // 기록된 UTM(userEvents.ts SSOT)을 그대로 실어 보낸다.
      const utm = getCurrentUtm();
      // id를 클라이언트에서 만든다 — 익명(anon)은 SELECT 정책이 없어 INSERT … RETURNING을
      // 못 받는다. 접수 번호(NF-XXXXXX)는 이 id의 앞 6자 = DB ref_code 생성 컬럼과 같은 값.
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("foreign_requests").insert({
        id: newId,
        user_id: userId,
        lang: preferredLang,
        area: area || null,
        event_date: eventDate,
        group_size: groupSize,
        // budget에도 같은 값을 넣는다 — 관리자 목록·필터가 전부 이 컬럼을 읽어서,
        // 메뉴로 들어온 예약만 "예산 없음"으로 보이면 안 된다.
        budget: orderAmount > 0 ? orderAmount : null,
        selected_menu: picked?.snapshot ?? null,
        selected_menu_total: picked?.total ?? null,
        club_ids: selectedClubIds,
        guest_name: guestName.trim() || null,
        contact_type: contactType,
        contact_value: contactValue.trim(),
        notes: notes.trim() || null,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        landing_path: utm.landing_path,
      });
      if (error) throw error;

      clearFormDraft(draftKey);
      // 운영자 푸시는 foreign_requests INSERT 트리거(Mig 455)가 자동 발송
      // 전환 완료 측정 (SOP 6단계 대체 지표 — puzzle_created는 외국인 미발동)
      trackForeignEvent("foreign_request_submitted", {
        lang: preferredLang,
        area: area || "club_only",
        club_count: selectedClubIds.length,
        has_budget: orderAmount > 0,
        has_menu: !!picked && !picked.snapshot.md_recommend,
        md_recommend: !!picked?.snapshot.md_recommend,
        anonymous: !userId,
      });

      setRequestRef(`NF-${newId.slice(0, 6).toUpperCase()}`);
      setShowConfirm(false);
      // 예전엔 토스트 하나 띄우고 바로 홈으로 보냈다 — 몇 분간 술을 고르고
      // 연락처까지 넣은 손님이 토스트가 사라지면 정말 접수됐는지 확인할
      // 방법이 없었다. 접수 확인 화면(4단계)으로 대신한다.
      setFormStep(4);
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

  // 날짜를 클럽보다 먼저 받으므로(2026-09-09 개편) 고른 날 쉬는 클럽이 목록에 섞인다.
  // 추천 쇼트리스트는 아예 거르고, 둘러보기·검색·상세에서는 "그날 휴무"를 붙여 선택을 막는다.
  const closedOnDate = (c: ClubItem) => !!eventDate && !isClubOpenOn(c.open_dows ?? null, eventDate);
  const closedLabel = t("그날 휴무", "Closed that day", "その日は休み", "当天休息", "當天休息");

  // ── Step 1 → 2 · 추천 쇼트리스트 · 메뉴 프리셋 (2026-09-09 개편) ─────────────
  // 클럽을 고르면(어디서든) 바로 메뉴판을 연다 — 날짜가 있어야 평일/주말 가격이 정해진다.
  const chooseClub = (club: ClubItem) => {
    setSelectedClubIds([club.id]);
    closeDetail();
    setBrowseOpen(false);
    if (!eventDate) {
      // 2026-09-10 개편: 클럽을 먼저 고르므로 날짜는 그 클럽 카드가 보이는 Step 2½에서 받는다.
      setFormStep(6);
      return;
    }
    if (!isClubOpenOn(club.open_dows ?? null, eventDate)) {
      setFormStep(6);
      setDateOpen(true);
      toast.error(t("그 날은 클럽이 쉬는 날이에요", "The club is closed that day — pick another date", "その日はクラブが休みです", "该夜店当天休息，请另选日期", "該夜店當天休息，請另選日期"));
      return;
    }
    setPendingMenuOpen(true);
  };
  useEffect(() => {
    if (!pendingMenuOpen || !selectedClubId || menuLoadedFor !== selectedClubId) return;
    setPendingMenuOpen(false);
    if (hasMenu) setMenuOpen(true);
    else toast.error(t("이 클럽은 아직 메뉴가 없어요", "This club has no menu yet", "このクラブはまだメニューがありません", "该夜店暂无酒单", "該夜店暫無酒單"));
  }, [pendingMenuOpen, selectedClubId, menuLoadedFor, hasMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Where?" 카드 — 실제 목록에 있는 지역만, 예약 가능 수 + 최소금액을 같이 보여준다.
  const whereOptions = useMemo(() => {
    const seoulCount = clubs.filter((c) => SEOUL_AREAS.includes(c.area)).length;
    const areas = CHIP_AREAS.filter((a) => scopeAreas.includes(a)).map((a) => ({
      key: a,
      count: clubs.filter((c) => c.area === a).length,
      min: AREA_MIN_BUDGET[a] ?? FALLBACK_MIN_BUDGET,
    }));
    return { seoulCount, areas };
  }, [clubs, scopeAreas]);

  // 음악 칩 — "고른 지역 안에서" 예약 가능한 클럽이 1곳 이상인 장르만. 지역과 무관하게 칩을 깔면
  // 강남+K-POP처럼 실제로는 없는 조합이 눌리고, 추천이 엉뚱한 클럽으로 채워진다(2026-09-09).
  const genrePool = useMemo(
    () => (area ? clubs.filter((c) => c.area === area) : clubs.filter((c) => SEOUL_AREAS.includes(c.area))),
    [clubs, area]
  );
  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    genrePool.forEach((c) => (c.tags ?? []).forEach((tg) => {
      if (tg.startsWith("genre:")) counts.set(tg.slice(6), (counts.get(tg.slice(6)) ?? 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  }, [genrePool]);
  // 지역을 바꿔서 고른 장르가 그 지역에 없어지면 조용히 해제한다 — 유령 필터 방지.
  useEffect(() => {
    if (genre && !genreOptions.includes(genre)) setGenre(null);
  }, [genre, genreOptions]);

  // 추천 쇼트리스트 3곳 — 폼에 오는 clubs는 전부 isBookable(MD + 주대)이라 여기서 추가로
  // 예약 가능 여부를 볼 필요는 없다. 지역·그날 영업·장르(소프트)로 거르고 리뷰순.
  // VIP 티어면 강남(최소 ₩1M)이 위로 온다.
  const shortlist = useMemo(() => {
    // VIP(₩1M~)인데 지역이 "어디든"이면 강남만 — VIP 하한을 채우는 메뉴가 강남에 몰려 있다.
    const pool = area
      ? clubs.filter((c) => c.area === area)
      : clubs.filter((c) => (tier === "vip" ? c.area === "강남" : SEOUL_AREAS.includes(c.area)));
    const openOnDate = eventDate ? pool.filter((c) => isClubOpenOn(c.open_dows ?? null, eventDate)) : pool;
    // 장르는 엄격하게 거른다 — 부족하다고 다른 장르로 채우면 "K-POP 골랐는데 EDM 클럽" 미스매치가 된다.
    const base = genre ? openOnDate.filter((c) => (c.tags ?? []).includes(makeTag("genre", genre))) : openOnDate;
    // 평점 4.0 미만(리뷰 20건 이상 기준)은 뒤로 — 리뷰 수만으로 정렬하면 3.1점 클럽이
    // "추천" 1~3위에 올라온다. 리뷰가 적어 평점이 불확실한 곳은 감점하지 않는다.
    const solid = (c: ClubItem) =>
      c.google_rating == null || (c.google_review_count ?? 0) < 20 || c.google_rating >= 4.0 ? 1 : 0;
    const sorted = [...base].sort((x, y) => {
      if (tier === "vip") {
        const g = (y.area === "강남" ? 1 : 0) - (x.area === "강남" ? 1 : 0);
        if (g !== 0) return g;
      }
      const q = solid(y) - solid(x);
      if (q !== 0) return q;
      return (y.google_review_count ?? 0) - (x.google_review_count ?? 0);
    });
    return (area ? pinFeatured(sorted) : sorted).slice(0, 3);
  }, [clubs, area, eventDate, genre, tier]);
  const bookableTotal = area ? clubs.filter((c) => c.area === area).length : whereOptions.seoulCount;

  // 쇼트리스트 카드에 "세트 ₩500k~" — 가격 없이 클럽을 고르게 하면 그 자리에서 이탈한다(크리틱 1차).
  // 세 클럽 메뉴를 한 번에 받아 클럽별 최저 세트가(지역 최소금액 이상)를 계산한다. 결과는 세션 캐시.
  const [menuFloorByClub, setMenuFloorByClub] = useState<Record<string, { amount: number; kind: "set" | "item" } | null>>({});
  const menuFloorCacheRef = useRef<Map<string, { amount: number; kind: "set" | "item" } | null>>(new Map());
  const shortlistKey = shortlist.map((c) => c.id).join(",");
  useEffect(() => {
    const missing = shortlist.filter((c) => !menuFloorCacheRef.current.has(`${c.id}:${isWeekend ? "we" : "wd"}`));
    if (missing.length === 0) {
      setMenuFloorByClub(Object.fromEntries(shortlist.map((c) => [c.id, menuFloorCacheRef.current.get(`${c.id}:${isWeekend ? "we" : "wd"}`) ?? null])));
      return;
    }
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("club_menu_items")
        .select("club_id, category, is_vvip, zone, variants:club_menu_variants(price, price_weekend), choices:club_menu_choices(id)")
        .in("club_id", missing.map((c) => c.id))
        .eq("is_active", true);
      if (!alive) return;
      type Row = { club_id: string; category: string; is_vvip: boolean; zone: string | null; variants: { price: number; price_weekend: number | null }[] | null; choices: { id: string }[] | null };
      const rows = (data ?? []) as Row[];
      for (const c of missing) {
        const mine = rows.filter((r) => r.club_id === c.id);
        const priceOf = (r: Row) => Math.min(...(r.variants ?? []).map((v) => (isWeekend ? (v.price_weekend ?? v.price) : v.price)));
        const areaMin = AREA_MIN_BUDGET[c.area] ?? FALLBACK_MIN_BUDGET;
        const sets = mine.filter((r) => r.category === "set" && !r.is_vvip && (r.variants?.length ?? 0) > 0).map(priceOf).filter(Number.isFinite).sort((a, b) => a - b);
        const items = mine.filter((r) => (r.variants?.length ?? 0) > 0).map(priceOf).filter(Number.isFinite).sort((a, b) => a - b);
        // 카드 숫자 = "이 클럽에서 실제로 시작하는 금액" = max(지역 하한, 그 클럽 최저 세트).
        // "하한 이상인 세트"로 찾으면 게더링처럼 49.9만 세트가 있는 클럽이 69.9만으로 튄다(2026-09-09).
        const val = sets[0] != null
          ? { amount: Math.max(areaMin, sets[0]), kind: "set" as const }
          : items[0] != null ? { amount: Math.max(areaMin, items[0]), kind: "item" as const } : null;
        menuFloorCacheRef.current.set(`${c.id}:${isWeekend ? "we" : "wd"}`, val);
      }
      setMenuFloorByClub(Object.fromEntries(shortlist.map((c) => [c.id, menuFloorCacheRef.current.get(`${c.id}:${isWeekend ? "we" : "wd"}`) ?? null])));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlistKey, isWeekend]);
  const wonShort = (won: number) => (won >= 1000000 ? `₩${(won / 1000000).toFixed(won % 1000000 === 0 ? 0 : 1)}M` : `₩${Math.round(won / 1000)}k`);
  // "₩500k (≈ US$371)" — 원화 감이 없는 손님에게 지역 카드·티어 칩에서도 바로 읽히게(사용자 지적).
  const wonWithLocal = (won: number) => {
    const local = menuCurrency ? krwTo(won, menuCurrency, fxRates) : null;
    return local ? `${wonShort(won)} (≈ ${local})` : wonShort(won);
  };

  // 메뉴판 프리셋 — 티어에 맞는 가장 싼 "세트"를 미리 담아서 연다. 손님이 자유롭게 고친다.
  // 존(층별 가격표)이 있는 클럽, 택1 슬롯이 있는 세트는 프리셋하지 않는다(존 선택이 먼저).
  const presetSnapshot = useMemo<SelectedMenuSnapshot | null>(() => {
    if (menuItems.length === 0 || menuItems.some((i) => i.zone)) return null;
    const floor = tier === "vip" ? Math.max(minBudget, 1000000) : minBudget;
    const base = menuItems
      .filter((i) => i.category === "set" && !i.is_vvip && !(i.choices?.length) && (i.variants?.length ?? 0) > 0)
      .map((i) => {
        const v = [...(i.variants ?? [])].sort((a, b) => a.price - b.price)[0];
        const price = isWeekend ? (v.price_weekend ?? v.price) : v.price;
        return { item: i, variant: v, price };
      })
      .sort((a, b) => a.price - b.price);
    // VIP 하한을 넘는 세트가 없는 클럽(이태원·홍대)이면 그 클럽 최소금액 이상 세트로 내려간다 — 빈 메뉴판을 열지 않는다.
    const best = base.find((c) => c.price >= floor) ?? base.find((c) => c.price >= minBudget);
    if (!best) return null;
    return {
      items: [{
        item_id: best.item.id,
        variant_id: best.variant.id,
        name_en: best.item.name_en,
        label_en: best.variant.label_en,
        price: best.price,
        qty: 1,
      }],
    };
  }, [menuItems, tier, minBudget, isWeekend]);

  // Step 1 "Continue" — 2026-09-10 개편: 날짜는 여기서 안 받는다(클럽을 먼저 고른다).
  // 프리셋 클럽(?club=)이 있으면 곧장 Step 2½(날짜), "아는 클럽"이면 둘러보기, 아니면 추천 목록(Step 2).
  const handleStep1Continue = () => {
    trackEvent("foreign_trip_gate_qualified", { lang: preferredLang });
    saveFormDraft(TRIP_GATE_KEY, true);
    if (selectedClubId) { setFormStep(6); return; }
    if (clubMode === "known") { setBrowseOpen(true); return; }
    setFormStep(2);
  };

  // Step 2½ "When?" Continue — 날짜 검증 + 소프트 리마인더 분기(예전 handleStep1Continue의 날짜 부분).
  const [savingReminder, setSavingReminder] = useState(false);
  const reminderDate = (() => {
    if (!eventDate) return null;
    const d = new Date(eventDate + "T12:00:00");
    d.setDate(d.getDate() - 3);
    return d;
  })();
  const handleDateContinue = async () => {
    if (!eventDate) {
      blocked("no_date");
      openDatePicker();
      return toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期", "請選擇日期"));
    }
    if (remindMe) {
      const email = remindEmail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return toast.error(t("이메일 형식을 확인해주세요", "Check your email address", "メール形式を確認してください", "请检查邮箱格式", "請檢查信箱格式"));
      }
      setSavingReminder(true);
      try {
        const supabase = createClient();
        const utm = getCurrentUtm();
        const { error } = await supabase.from("foreign_trip_reminders").insert({
          email, lang: preferredLang, area: area || null, tentative_date: eventDate, group_size: groupSize,
          landing_path: utm.landing_path, utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign,
        });
        if (error) throw error;
        trackEvent("foreign_trip_gate_planning", { lang: preferredLang, saved_email: true });
        setFormStep(5);
      } catch (e) {
        const msg = (e as { message?: string })?.message || "";
        if (msg.includes("duplicate_trip_reminder_within_24h")) {
          toast.success(t("이미 저장돼 있어요", "Already saved — we'll email you", "すでに保存済みです", "已保存，会发邮件提醒你", "已儲存，會寄信提醒你"));
          setFormStep(5);
        } else {
          toast.error(t("저장 중 오류가 발생했어요", "Couldn't save — try again", "保存に失敗しました", "保存失败，请重试", "儲存失敗，請重試") + (msg ? ` (${msg})` : ""));
        }
      } finally {
        setSavingReminder(false);
      }
      return;
    }
    if (!selectedClub) return; // Step 2½는 항상 클럽이 정해진 상태에서만 온다
    if (!isClubOpenOn(selectedClub.open_dows ?? null, eventDate)) {
      setDateOpen(true);
      toast.error(t("그 날은 클럽이 쉬는 날이에요", "The club is closed that day — pick another date", "その日はクラブが休みです", "该夜店当天休息，请另选日期", "該夜店當天休息，請另選日期"));
      return;
    }
    setPendingMenuOpen(true);
  };

  // "MD 추천 받기" 우회(2026-09-15). 검색 유입 7일 실측: 폼 도달 12 → 날짜 10 → 메뉴 담기 3 → 제출 0.
  // 외국인이 50만~100만 원어치 술을 병 단위로 직접 고르는 단계가 벽이었다. 예산만 고르면 items 없는
  // 스냅샷(md_recommend)로 3장(연락처)으로 넘긴다. 검증(orderAmount ≥ minBudget)·저장(budget=total)은
  // 그대로 통과하고, 운영자 화면은 md_recommend를 보고 "MD 추천 요청 · 예산"으로 표시한다.
  const handleMdRecommend = (budget: number) => {
    if (!eventDate) {
      blocked("no_date");
      openDatePicker();
      return toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期", "請選擇日期"));
    }
    if (!selectedClub) return;
    if (!isClubOpenOn(selectedClub.open_dows ?? null, eventDate)) {
      setDateOpen(true);
      return toast.error(t("그 날은 클럽이 쉬는 날이에요", "The club is closed that day — pick another date", "その日はクラブが休みです", "该夜店当天休息，请另选日期", "該夜店當天休息，請另選日期"));
    }
    const snapshot: SelectedMenuSnapshot = { items: [], md_recommend: { budget } };
    setPicked({ snapshot, total: budget });
    setMenuDraft(null);
    trackForeignEvent("foreign_form_md_recommend", { lang: preferredLang, budget, min_budget: minBudget });
    setFormStep(3);
  };
  const mdBudgetOptions = useMemo(() => {
    const base = minBudget > 0 ? minBudget : 500_000;
    return [base, Math.round((base * 1.5) / 50_000) * 50_000, base * 2];
  }, [minBudget]);

  // 날짜 화면과 메뉴 시트 양쪽에 같은 박스를 둔다 — 시트로 먼저 들어간 손님도 출구를 본다.
  const mdRecommendBox = (compact = false) => (
    <section className={`rounded-xl border border-border ${compact ? "bg-background" : "bg-card"} px-3.5 py-3 space-y-2.5`}>
      <div>
        <p className="text-[13px] font-extrabold">{t("술 고르기 어려우세요?", "Not sure what to order?", "何を頼めばいいか分からない？", "不知道点什么？", "不知道要點什麼？")}</p>
        <p className="text-[12px] text-muted-foreground leading-snug break-keep">
          {t(
            "예산만 고르면 클럽이 가장 맞는 세트를 제안해요.",
            "Pick a budget and the club suggests the best set for you.",
            "予算だけ選べば、クラブが一番合うセットを提案します。",
            "选个预算，夜店会为你推荐最合适的套餐。",
            "選個預算，夜店會為你推薦最合適的套餐。"
          )}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {mdBudgetOptions.map((b, i) => {
          const local = menuCurrency ? krwTo(b, menuCurrency, fxRates) : null;
          return (
            <button
              key={b}
              type="button"
              onClick={() => { setMenuOpen(false); handleMdRecommend(b); }}
              className={`rounded-xl border border-border ${compact ? "bg-card" : "bg-background"} px-2 py-2.5 text-center hover:border-amber-500/60 active:scale-[0.98] transition-all`}
            >
              <span className="block text-[13px] font-black tabular-nums">₩{(b / 10_000).toLocaleString("en-US")}만</span>
              {local && <span className="block text-[10px] text-muted-foreground tabular-nums">≈ {local}</span>}
              {i === 0 && <span className="block text-[10px] text-brand-amber font-bold">{t("최소", "minimum", "最低", "最低", "最低")}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );

  const label = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 text-foreground font-bold mb-2">
      {icon}
      <span>{text}</span>
    </div>
  );

  // 게이트 계측은 유지한다 — 대시보드(Migration 658 foreign_funnel_by_lang)가 "게이트" 단계로
  // 집계하므로 이름을 바꾸지 않는다. view = Step 1 노출, qualified = Continue, planning = 리마인더 저장.
  useEffect(() => {
    trackEvent("foreign_trip_gate_view", { lang: preferredLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2½(날짜)은 화면상 "2단계"의 뒷부분이라 진행바·칩에서는 2로 취급한다.
  const displayStep = formStep === 6 ? 2 : formStep;
  const progress = (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-1 flex-1 rounded-full ${displayStep >= n ? "bg-amber-500" : "bg-muted"}`} />
      ))}
    </div>
  );
  const stepChip = (n: number) => (
    <span className="text-[12px] font-bold text-muted-foreground">
      {t(`${n} / 3 단계`, `Step ${n} of 3`, `ステップ ${n} / 3`, `第 ${n} 步 / 共 3 步`, `第 ${n} 步 / 共 3 步`)}
    </span>
  );
  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-[13px] font-extrabold transition-colors border ${
      on ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"
    }`;
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
  const selectedClub = selectedClubId ? clubById[selectedClubId] : null;

  return (
    <div className="space-y-7">
      {/* 강제종료 등으로 남아있던 이전 입력 — 폼 위에 별도 팝업으로 먼저 묻는다. */}
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
        title={t("이전에 작성하던 예약이 있어요", "You have an unfinished booking", "以前作成中の予約があります", "您有未完成的预订")}
        description={resumePrompt?.picked?.snapshot.md_recommend
          ? t(`클럽 추천 · 예산 ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 이어서 작성하시겠어요?`, `Club suggests · budget ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · Continue where you left off?`, `クラブおまかせ · 予算 ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 続きから再開しますか？`, `夜店推荐 · 预算 ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 是否继续之前的预订？`)
          : t(
          `${resumePrompt?.picked?.snapshot.items.length ?? 0}개 주류 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 이어서 작성하시겠어요?`,
          `${resumePrompt?.picked?.snapshot.items.length ?? 0} drink${(resumePrompt?.picked?.snapshot.items.length ?? 0) > 1 ? "s" : ""} · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · Continue where you left off?`,
          `ドリンク${resumePrompt?.picked?.snapshot.items.length ?? 0}点 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 続きから再開しますか？`,
          `${resumePrompt?.picked?.snapshot.items.length ?? 0}款酒水 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 是否继续之前的预订？`
        )}
        cancelText={t("아니요", "No", "いいえ", "否")}
        confirmText={t("이어하기", "Continue", "続ける", "继续")}
      />


      {/* ── Step 1 · When & who ─────────────────────────────────────────── */}
      {formStep === 1 && (
      <>
      {progress}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {t("몇 명이서 가시나요?", "Who's coming?", "何人で行きますか？", "几位一起去？", "幾位一起去？")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t("문의는 무료. 보증금도 카드도 없어요.", "Free to ask. No deposit, no card.", "相談無料。デポジットもカードも不要。", "免费咨询。无需订金，无需信用卡。", "免費諮詢。無需訂金，無需信用卡。")}
          </p>
        </div>
        {stepChip(1)}
      </div>

      {/* 인원 */}
      <section>
        {label(<Users className="w-4 h-4 text-money" />, t("인원", "Group size", "人数", "人数"))}
        <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-2 w-fit">
          <button type="button" onClick={() => setGroupSize((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">−</button>
          <span className="min-w-[3rem] text-center text-foreground font-black text-lg">{groupSize}</span>
          <button type="button" onClick={() => setGroupSize((n) => Math.min(20, n + 1))} className="w-10 h-10 rounded-lg bg-muted text-foreground text-xl font-bold">+</button>
        </div>
        {/* 인원은 나중에 바뀌기 쉬워서 여기서 확정을 요구하면 입력이 멈춘다 — 대략이면 된다고 풀어준다.
            (금액은 반대로 오퍼 기준이라 정확해야 하므로 그쪽엔 이 문구를 쓰지 않는다.) */}
        <p className="text-[12px] text-muted-foreground mt-1.5 break-keep">
          {t(
            "대략만 적어도 괜찮아요. 나중에 바뀌어도 됩니다.",
            "A rough number is fine — you can change it later.",
            "だいたいでOK。あとで変わっても大丈夫です。",
            "写个大概就行,之后改也没关系。",
            "寫個大概就行,之後改也沒關係。"
          )}
        </p>
      </section>

      {/* 클럽 상세의 "Book X"로 프리셋 진입한 경우: Where/Music/Club 고르기 대신
          이미 정해진 클럽을 요약 카드로 보여준다. 인원만 받고 바로 Step 2½(When)로 간다. */}
      {presetClubId && selectedClub ? (
      <section>
        {label(<Search className="w-4 h-4 text-money" />, t("클럽", "Club", "クラブ", "夜店", "夜店"))}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
          <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
            {selectedClub.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedClub.thumbnail_url} alt={displayClubName(selectedClub)} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black text-foreground truncate">{displayClubName(selectedClub)}</p>
            <p className="text-[12px] text-muted-foreground">{areaLabel(selectedClub.area, lang)}</p>
          </div>
        </div>
      </section>
      ) : (
      <>
      {/* Where? — "Anywhere"가 기본. 외국인은 지역 이름만으로는 못 고르니 한 줄 설명·예약 가능 수·가격 하한을 붙인다. */}
      <section>
        <div className="flex items-center justify-between mb-2">
          {label(<MapPin className="w-4 h-4 text-money" />, t("어디로?", "Where?", "どこで？", "去哪里？", "去哪裡？"))}
          <span className="text-[12px] text-muted-foreground">
            {t("모르겠으면 그대로", "Not sure? Leave it on Anywhere", "迷ったらそのまま", "不确定就保持默认", "不確定就保持預設")}
          </span>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setArea("")}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-colors ${
              area === "" ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card border-border"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-black">{t("서울 어디든", "Anywhere in Seoul", "ソウルのどこでも", "首尔任何地方", "首爾任何地方")}</p>
              <p className={`text-[11px] ${area === "" ? "opacity-70" : "text-muted-foreground"}`}>
                {t(
                  `이태원·홍대·강남에서 골라드려요 · 예약 가능 ${whereOptions.seoulCount}곳`,
                  `We pick across Itaewon, Hongdae & Gangnam · ${whereOptions.seoulCount} bookable`,
                  `梨泰院・弘大・江南から選びます · 予約可能 ${whereOptions.seoulCount} 軒`,
                  `我们从梨泰院、弘大、江南中挑选 · ${whereOptions.seoulCount} 家可订`,
                  `我們從梨泰院、弘大、江南中挑選 · ${whereOptions.seoulCount} 家可訂`
                )}
              </p>
            </div>
            <span className={`w-5 h-5 rounded-full border-[6px] ${area === "" ? "border-inverse-foreground bg-inverse" : "border-border bg-transparent"}`} />
          </button>
          <div className="grid grid-cols-2 gap-2">
            {whereOptions.areas.map((a) => {
              const on = area === a.key;
              const tl = AREA_TAGLINE[a.key];
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setArea((prev) => (prev === a.key ? "" : a.key))}
                  className={`flex flex-col gap-0.5 p-3 rounded-xl border text-left transition-colors ${
                    on ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card border-border"
                  }`}
                >
                  <span className="text-[14px] font-black">{AREA_EMOJI[a.key] ? `${AREA_EMOJI[a.key]} ` : ""}{areaLabel(a.key, lang)}</span>
                  {tl && <span className={`text-[11px] leading-snug ${on ? "opacity-70" : "text-muted-foreground"}`}>{t(...tl)}</span>}
                  <span className={`text-[11px] font-bold ${on ? "opacity-85" : "text-money"}`}>
                    {t(
                      `${a.count}곳 · ${wonShort(a.min)}~`,
                      `${a.count} bookable · from ${wonWithLocal(a.min)}`,
                      `${a.count} 軒 · ${wonWithLocal(a.min)}〜`,
                      `${a.count} 家可订 · ${wonWithLocal(a.min)} 起`,
                      `${a.count} 家可訂 · ${wonWithLocal(a.min)} 起`
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Music (optional) — 예약 가능 클럽 태그에서 2곳 이상인 장르만. */}
      {genreOptions.length > 0 && (
        <section>
          {label(<Music2 className="w-4 h-4 text-money" />, t("음악 (선택)", "Music (optional)", "音楽（任意）", "音乐（可选）", "音樂（可選）"))}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {genreOptions.map((g) => (
              <button key={g} type="button" onClick={() => setGenre((prev) => (prev === g ? null : g))} className={chip(genre === g)}>
                {TAG_LABEL_I18N[g]?.[lang] ?? g}
              </button>
            ))}
            <button type="button" onClick={() => setGenre(null)} className={chip(genre === null)}>
              {t("상관없음", "Don't mind", "こだわらない", "都可以", "都可以")}
            </button>
          </div>
        </section>
      )}

      {/* Club — 추천(기본) / 아는 클럽 */}
      <section>
        {label(<Search className="w-4 h-4 text-money" />, t("클럽", "Club", "クラブ", "夜店", "夜店"))}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setClubMode("recommend")}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
              clubMode === "recommend" ? "bg-card border-amber-500" : "bg-card border-border"
            }`}
          >
            <Sparkles className={`w-5 h-5 shrink-0 ${clubMode === "recommend" ? "text-brand-amber" : "text-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-black">{t("모르겠어요 — 추천해주세요", "Not sure — recommend me", "分からない — おすすめして", "不确定 — 帮我推荐", "不確定 — 幫我推薦")}</p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                {t("지금 예약 가능한 클럽 중 2~3곳을 골라드려요.", "We match you with 2–3 clubs we can book right now.", "今すぐ予約できるクラブから2〜3軒選びます。", "从现在可订的夜店中为你挑 2–3 家。", "從現在可訂的夜店中為你挑 2–3 家。")}
              </p>
            </div>
            <span className={`w-5 h-5 rounded-full border-[6px] ${clubMode === "recommend" ? "border-amber-500 bg-background" : "border-border"}`} />
          </button>
          <button
            type="button"
            onClick={() => { setClubMode("known"); setBrowseOpen(true); }}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
              clubMode === "known" ? "bg-card border-amber-500" : "bg-card border-border"
            }`}
          >
            <Search className="w-5 h-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-black">{t("아는 클럽이 있어요", "I know the club", "行きたいクラブがある", "我知道要去哪家", "我知道要去哪家")}</p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                {t(
                  `예약 가능한 ${bookableTotal}곳에서 직접 고르기`,
                  `Pick from ${bookableTotal} bookable clubs${area ? "" : " in Seoul"}`,
                  `予約可能な ${bookableTotal} 軒から選ぶ`,
                  `从 ${bookableTotal} 家可订夜店中选择`,
                  `從 ${bookableTotal} 家可訂夜店中選擇`
                )}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>
        {/* 찜해둔 클럽 원탭 추가 — 둘러보며 하트한 것을 이름 재검색 없이 바로 담게 함 */}
        {savedNotSelected.length > 0 && (
          <div className="mb-3 p-3 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3.5 h-3.5 text-brand-amber fill-current" />
              <span className="text-[12px] font-bold text-foreground">
                {t("찜한 클럽", "Your saved clubs", "保存したクラブ", "收藏的夜店")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("+ 담기 · 이름 탭하면 상세", "+ to add · tap name for details", "+で追加・名前で詳細", "+添加 · 点名称看详情")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {savedNotSelected.map((s) => {
                const full = clubById[s.id];
                const savedList = savedNotSelected.map((x) => clubById[x.id]).filter(Boolean);
                return (
                  <span key={s.id} className="flex items-center rounded-full bg-muted border border-border overflow-hidden">
                    {/* + : 바로 담기 (아는 클럽이면 한 번에) */}
                    <button
                      type="button"
                      aria-label={t("담기", "Add", "追加", "添加")}
                      onClick={() => {
                        toggleClub(s.id);
                        trackForeignEvent("foreign_saved_club_added", { club_id: s.id, club_name: s.name });
                      }}
                      className="pl-2.5 pr-1.5 py-2 text-muted-foreground hover:text-brand-amber transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    {/* 이름 : 상세 열기 (담기 전에 뭐였는지 다시 확인) — 폼의 클럽 카드와 같은 규칙.
                        찜 해제 버튼은 여기 두지 않는다 — 담으면 어차피 목록에서 빠지고,
                        해제는 헤더의 찜 목록이나 클럽 상세의 Save 토글에서 하면 됨. */}
                    <button
                      type="button"
                      disabled={!full}
                      onClick={() => full && openDetail(savedList, full)}
                      className="pl-1 pr-3.5 py-2 text-[13px] font-bold text-foreground hover:text-brand-amber transition-colors disabled:cursor-default disabled:hover:text-foreground"
                    >
                      {full ? displayClubName(full) : s.name}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {/* 검색 — "아는 클럽" 모드에서만. 추천 모드에서 검색창까지 있으면 고를 게 셋이 된다. */}
        {clubMode === "known" && (<>
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
                  onClick={() => (on ? toggleClub(c.id) : chooseClub(c))}
                  className={`flex items-center gap-3 p-2 rounded-xl border transition-colors text-left ${on ? "bg-amber-500/10 border-amber-500/40" : "bg-card border-border hover:border-border"} ${closedOnDate(c) ? "opacity-60" : ""}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.thumbnail_url && <img src={c.thumbnail_url} alt={displayClubName(c)} className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-foreground truncate">{displayClubName(c)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {areaLabel(c.area, lang)}
                      {closedOnDate(c) && <span className="ml-1.5 text-red-400 font-bold">{closedLabel}</span>}
                    </p>
                  </div>
                  {on && <Check className="w-4 h-4 text-brand-amber shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        </>)}
      </section>
      </>
      )}

      <button
        type="button"
        onClick={handleStep1Continue}
        className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all"
      >
        {t("계속", "Continue", "続ける", "继续", "繼續")}
      </button>
      </>
      )}

      {/* ── Step 2½ · When? (클럽을 고른 뒤 날짜 확정) ─────────────────────── */}
      {formStep === 6 && selectedClub && (
      <>
      {progress}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { if (!presetClubId) { setSelectedClubIds([]); setFormStep(clubMode === "recommend" ? 2 : 1); } }}
            className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            {t("클럽 다시 고르기", "Change club", "クラブを選び直す", "重新选夜店", "重新選夜店")}
          </button>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {t("언제 가시나요?", "When?", "いつ行きますか？", "什么时候去？", "什麼時候去？")}
          </h1>
        </div>
        {stepChip(2)}
      </div>

      <button
        type="button"
        onClick={() => openDetail([selectedClub], selectedClub)}
        className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border w-full text-left"
      >
        <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
          {selectedClub.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedClub.thumbnail_url} alt={displayClubName(selectedClub)} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-black text-foreground truncate">{displayClubName(selectedClub)}</p>
          <p className="text-[12px] text-muted-foreground">{areaLabel(selectedClub.area, lang)}</p>
        </div>
        {!picked && !presetClubId && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setSelectedClubIds([]); setFormStep(clubMode === "recommend" ? 2 : 1); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setSelectedClubIds([]); setFormStep(clubMode === "recommend" ? 2 : 1); } }}
            className="shrink-0 text-[12px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("바꾸기", "Change", "変更", "更换", "更換")}
          </span>
        )}
      </button>

      <section ref={dateSectionRef}>
        {label(<Calendar className="w-4 h-4 text-money" />, t("날짜", "Date", "日付", "日期"))}
        {/* 네이티브 date input의 플레이스홀더·표시 텍스트는 lang 속성이 아니라 브라우저/OS 로케일을
            따르는 WebKit 버그가 있음(특히 iOS Safari) — html lang·input lang을 다 맞춰도 한글로 샘.
            그래서 네이티브 입력은 투명하게 깔아 달력 피커 기능만 쓰고, 보이는 텍스트는 우리가 직접
            렌더링(placeholder/포맷 둘 다 우리 통제 하에 있어 로케일 새는 문제 자체가 없음).
            네이티브 입력은 브라우저마다 "달력 아이콘 부분 클릭해야만 피커가 열리고 텍스트 영역
            클릭은 그냥 포커스만 됨" — 그래서 showPicker()로 박스 어디를 눌러도 피커가 열리게 함. */}
        <button
          type="button"
          onClick={() => setDateOpen((v) => !v)}
          className={`w-full h-12 px-4 rounded-xl bg-card border flex items-center justify-between transition-colors ${
            dateOpen ? "border-amber-500" : "border-border"
          }`}
        >
          <span className={`text-[15px] ${eventDate ? "text-foreground" : "text-muted-foreground"}`}>
            {eventDate ? formatEventDate(eventDate, lang) : t("연도. 월. 일.", "Select date", "日付を選択", "选择日期")}
          </span>
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
        {dateOpen && (
          <div className="mt-2 rounded-xl bg-card border border-border p-2">
            <ClubDateCalendar
              lang={lang}
              openDows={selectedClubOpenDows}
              value={eventDate}
              onSelect={(d) => {
                setEventDate(d);
                setDateOpen(false);
              }}
            />
          </div>
        )}
        {closedNotice && (
          <p className="text-[12px] text-muted-foreground mt-1.5">{closedNotice}</p>
        )}
      </section>

      {/* 소프트 여행 게이트 — 켜면 요청 대신 이메일만 저장, D-3에 링크 메일(자동). */}
      <section>
        <div className={`rounded-xl border px-3.5 py-3 space-y-2.5 transition-colors ${remindMe ? "border-amber-500 bg-offer-well" : "border-border bg-offer-well"}`}>
          <button type="button" onClick={() => setRemindMe((v) => !v)} className="w-full flex items-center gap-3 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold">{t("일정이 아직 미정인가요?", "Trip not confirmed yet?", "予定はまだ未定ですか？", "行程还没定？", "行程還沒定？")}</p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                {t("날짜 3일 전에 이메일로 링크를 보내드려요.", "We'll email you a link 3 days before your date.", "日付の3日前にリンクをメールします。", "我们会在日期前 3 天发邮件提醒你。", "我們會在日期前 3 天寄信提醒你。")}
              </p>
            </div>
            <span role="switch" aria-checked={remindMe} className={`relative w-11 h-[26px] rounded-full shrink-0 transition-colors ${remindMe ? "bg-amber-500" : "bg-muted"}`}>
              <span className={`absolute top-[3px] w-5 h-5 rounded-full transition-all ${remindMe ? "left-[23px] bg-background" : "left-[3px] bg-muted-foreground"}`} />
            </span>
          </button>
          {remindMe && (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={remindEmail}
              onChange={(e) => setRemindEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
            />
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={handleDateContinue}
        disabled={savingReminder}
        className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all disabled:opacity-50"
      >
        {remindMe
          ? (savingReminder
              ? t("저장 중…", "Saving…", "保存中…", "保存中…", "儲存中…")
              : reminderDate
                ? t(`저장하고 ${formatEventDate(ymdLocal(reminderDate), lang)}에 알림받기`, `Save & remind me on ${formatEventDate(ymdLocal(reminderDate), lang)}`, `保存して ${formatEventDate(ymdLocal(reminderDate), lang)} に通知`, `保存并在 ${formatEventDate(ymdLocal(reminderDate), lang)} 提醒我`, `儲存並在 ${formatEventDate(ymdLocal(reminderDate), lang)} 提醒我`)
                : t("저장하고 알림받기", "Save & remind me", "保存して通知を受け取る", "保存并提醒我", "儲存並提醒我"))
          : t("술 고르기", "Choose drinks", "ドリンクを選ぶ", "选择酒水", "選擇酒水")}
      </button>

      {/* 메뉴 담기 우회 — 술을 직접 고르기 부담스러운 손님용. 알림 모드(remindMe)에선 숨긴다. */}
      {!remindMe && mdRecommendBox()}
      </>
      )}

      {/* ── Step 2 · Pick your night (추천 쇼트리스트) ────────────────────── */}
      {formStep === 2 && (
      <>
      {progress}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <button type="button" onClick={() => setFormStep(1)} className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
            {t("몇 명이서 가시나요?", "Who's coming?", "何人で行きますか？", "几位一起去？", "幾位一起去？")}
          </button>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {t("어떤 밤을 원하세요?", "Pick your night", "どんな夜にする？", "选择你的夜晚", "選擇你的夜晚")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {[
              area ? areaLabel(area, lang) : t("서울 어디든", "Anywhere in Seoul", "ソウルのどこでも", "首尔任何地方", "首爾任何地方"),
              genre ? (TAG_LABEL_I18N[genre]?.[lang] ?? genre) : null,
              t(`${groupSize}명`, `${groupSize} ${groupSize > 1 ? "people" : "person"}`, `${groupSize}名`, `${groupSize}人`, `${groupSize}人`),
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {stepChip(2)}
      </div>

      {/* 티어 — 쇼트리스트 정렬 + 메뉴판 프리셋. 최소금액을 미리 보여줘 메뉴판에서 놀라지 않게 한다. */}
      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "table" as const, title: t("테이블", "Table", "テーブル", "卡座", "包廂"), sub: t("₩50만~ · 홍대·이태원", `from ${wonWithLocal(500000)} · Hongdae, Itaewon`, `${wonWithLocal(500000)}〜 · 弘大·梨泰院`, `${wonWithLocal(500000)} 起 · 弘大·梨泰院`, `${wonWithLocal(500000)} 起 · 弘大·梨泰院`) },
            { key: "vip" as const, title: "VIP", sub: area && area !== "강남"
                ? t("₩100만~", `from ${wonWithLocal(1000000)}`, `${wonWithLocal(1000000)}〜`, `${wonWithLocal(1000000)} 起`, `${wonWithLocal(1000000)} 起`)
                : t("₩100만~ · 강남", `from ${wonWithLocal(1000000)} · Gangnam`, `${wonWithLocal(1000000)}〜 · 江南`, `${wonWithLocal(1000000)} 起 · 江南`, `${wonWithLocal(1000000)} 起 · 江南`) },
          ]).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setTier(o.key)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl border transition-colors ${
                tier === o.key ? "bg-inverse text-inverse-foreground border-transparent" : "bg-card border-border"
              }`}
            >
              <span className="text-[13px] font-black">{o.title}</span>
              <span className={`text-[11px] ${tier === o.key ? "opacity-70" : "text-muted-foreground"}`}>{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground leading-snug break-keep">
          {tier === "vip"
            ? t("프라임 테이블, 프리미엄 보틀, 호스트 서비스. 최소금액은 클럽이 정해요.", "Prime table, premium bottles, host service. The minimum is set by the club.", "プライムテーブル、プレミアムボトル、ホストサービス。最低金額はクラブが決めます。", "黄金桌位、高端酒水、专人服务。最低消费由夜店决定。", "黃金包廂、高端酒水、專人服務。最低消費由夜店決定。")
            : t("보틀 + 믹서, 우리 자리, 줄 서지 않고 입장. 최소금액은 클럽이 정해요.", "A bottle + mixers, your own seats, skip the line. The minimum is set by the club.", "ボトル＋ミキサー、専用席、並ばず入場。最低金額はクラブが決めます。", "一瓶酒 + 调酒、专属座位、免排队。最低消费由夜店决定。", "一瓶酒 + 調酒、專屬座位、免排隊。最低消費由夜店決定。")}
        </p>
      </section>

      {/* 추천 쇼트리스트 — 예약 가능한 클럽만(MD + 실제 메뉴). 카드 탭 = 상세, 버튼 = 메뉴판. */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-black">{t("추천 클럽", "Recommended for you", "おすすめ", "为你推荐", "為你推薦")}</p>
          <span className="text-[12px] font-bold text-muted-foreground">
            {t(`예약 가능 ${bookableTotal}곳 중 ${shortlist.length}곳`, `Top ${shortlist.length} of ${bookableTotal} bookable`, `予約可能 ${bookableTotal} 軒中 ${shortlist.length} 軒`, `${bookableTotal} 家可订中的前 ${shortlist.length} 家`, `${bookableTotal} 家可訂中的前 ${shortlist.length} 家`)}
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground -mt-1 break-keep">
          {t("지금 바로 잡아드릴 수 있는 클럽만 — 실제 메뉴판 가격 그대로. 탭하면 사진·메뉴·영업시간·리뷰.", "Only clubs we can book right now, at the club's real menu prices. Tap a club for photos, menu, hours & reviews.", "今すぐ予約できるクラブだけ — 実際のメニュー価格のまま。タップで写真・メニュー・営業時間・レビュー。", "只列出现在能订的夜店，按夜店真实酒单价格。点按查看照片、酒单、营业时间和评价。", "只列出現在能訂的夜店，依夜店真實酒單價格。點按查看照片、酒單、營業時間和評價。")}
        </p>
        {shortlist.length === 0 ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {genre
                ? t("이 조건에 맞는 클럽이 그 날엔 없어요. 음악 조건을 빼거나 지역을 넓혀보세요.", "No bookable club matches that music on that night — drop the music filter or widen the area.", "その条件に合うクラブがその日はありません。音楽の条件を外すかエリアを広げてみてください。", "当晚没有符合该音乐条件的夜店，去掉音乐条件或扩大区域试试。", "當晚沒有符合該音樂條件的夜店，去掉音樂條件或擴大區域試試。")
                : t("그 날 영업하는 클럽이 없어요. 날짜나 지역을 바꿔보세요.", "No bookable club is open that night — try another date or area.", "その日に営業するクラブがありません。日付かエリアを変えてみてください。", "当晚没有可订的夜店，换个日期或区域试试。", "當晚沒有可訂的夜店，換個日期或區域試試。")}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {genre && (
                <button type="button" onClick={() => setGenre(null)} className={chip(false)}>
                  {t("음악 조건 빼기", "Any music", "音楽の条件を外す", "不限音乐", "不限音樂")}
                </button>
              )}
              <button type="button" onClick={() => { setFormStep(1); openDatePicker(); }} className={chip(false)}>
                {t("날짜 바꾸기", "Change date", "日付を変更", "更改日期", "更改日期")}
              </button>
              {area && (
                <button type="button" onClick={() => setArea("")} className={chip(false)}>
                  {t("전 지역 보기", "Show all areas", "全エリアを見る", "查看所有区域", "查看所有區域")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {shortlist.map((c, i) => {
              const tl = clubTagline(c, lang) || (AREA_TAGLINE[c.area] ? t(...AREA_TAGLINE[c.area]) : "");
              return (
                <div key={c.id} className={`relative rounded-2xl bg-card border p-3 space-y-2.5 ${i === 0 ? "border-amber-500/60" : "border-border"}`}>
                  {i === 0 && (
                    <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black tracking-wide">
                      {t("1순위 추천", "Top pick", "イチオシ", "首选推荐", "首選推薦")}
                    </span>
                  )}
                  <button type="button" onClick={() => openDetail(shortlist, c)} className="w-full flex items-center gap-3 text-left">
                    <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
                      {c.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnail_url} alt={displayClubName(c)} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[15px] font-black truncate">{displayClubName(c)}</p>
                      <p className="flex items-center gap-1 text-[12px] text-muted-foreground truncate">
                        {c.google_rating != null && (c.google_review_count ?? 0) >= 5 && (
                          <>
                            <Star className="w-3 h-3 text-brand-amber fill-current shrink-0" />
                            {c.google_rating.toFixed(1)} ({c.google_review_count})
                            <span> · </span>
                          </>
                        )}
                        {areaLabel(c.area, lang)}
                        {tl ? ` · ${tl}` : ""}
                      </p>
                      {openDowsLine(c.open_dows) && (
                        <p className="text-[11px] text-muted-foreground">{openDowsLine(c.open_dows)}</p>
                      )}
                      {(() => {
                        const f = menuFloorByClub[c.id];
                        if (!f) return null;
                        const won = wonShort(f.amount);
                        const local = menuCurrency ? krwTo(f.amount, menuCurrency, fxRates) : null;
                        const money = local ? `${won} (≈ ${local})` : won;
                        return (
                          <p className="text-[12px] font-bold text-money truncate">
                            {f.kind === "set"
                              ? t(`테이블 ${money}~`, `Tables from ${money}`, `テーブル ${money}〜`, `卡座 ${money} 起`, `包廂 ${money} 起`)
                              : t(`메뉴 ${money}~`, `Menu from ${money}`, `メニュー ${money}〜`, `酒单 ${money} 起`, `酒單 ${money} 起`)}
                          </p>
                        );
                      })()}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseClub(c)}
                    className={`w-full h-11 rounded-full font-black text-[14px] flex items-center justify-center gap-1 transition-colors ${
                      i === 0 ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-inverse text-inverse-foreground hover:opacity-90"
                    }`}
                  >
                    {t("술 고르기", "Choose drinks", "ドリンクを選ぶ", "选择酒水", "選擇酒水")}
                    <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => setBrowseOpen(true)} className="w-full h-11 text-[13px] font-bold text-muted-foreground hover:text-foreground">
          {t(`예약 가능한 ${bookableTotal}곳 전부 보기 →`, `See all ${bookableTotal} bookable clubs →`, `予約可能な ${bookableTotal} 軒をすべて見る →`, `查看全部 ${bookableTotal} 家可订夜店 →`, `查看全部 ${bookableTotal} 家可訂夜店 →`)}
        </button>
      </section>

      <div className="flex items-start gap-2.5 rounded-xl bg-green-500/10 border border-green-500/35 px-3.5 py-3">
        <ShieldCheck className="w-4 h-4 text-money shrink-0 mt-0.5" />
        <p className="text-[12px] text-muted-foreground leading-snug break-keep">
          {t("다음 단계에서 클럽 실제 메뉴판에서 술을 고르면 그 총액을 클럽이 확인해요. 결제는 클럽에 직접. 바가지 쓰면 200% 환불.", "Next you pick the exact bottles from the club's real menu — that total is what the club confirms. You pay at the club. Overcharged? 200% back.", "次にクラブの実メニューからボトルを選びます。その合計をクラブが確認。支払いは現地で。ぼったくられたら200%返金。", "下一步从夜店真实酒单中选酒，该总额由夜店确认。到店付款。被多收？200% 退还。", "下一步從夜店真實酒單中選酒，該總額由夜店確認。到店付款。被多收？200% 退還。")}
        </p>
      </div>
      </>
      )}

      {/* 시트들 — 둘러보기 / 클럽 상세 (Step 1·2·3 공통) */}
      {(formStep === 1 || formStep === 2 || formStep === 3 || formStep === 6) && (
      <>
      {/* 클럽 둘러보기 팝업 — /clubs 수준 정렬+필터, 카드 클릭은 선택(toggleClub)으로 */}
      <Sheet open={browseOpen} onOpenChange={setBrowseOpen}>
        {/* overscroll-contain: 목록 맨 위에서 당기면 pull-to-refresh로 새서 화면이 날아간다. */}
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[88vh] overflow-y-auto overscroll-contain p-0">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-black text-[18px] text-foreground">
                {t("클럽 둘러보기", "Browse clubs", "クラブを見る", "浏览夜店")}
              </SheetTitle>
              <span className="text-[12px] text-muted-foreground">
                {selectedClubIds.length > 0
                  ? t("선택됨", "selected", "選択済み", "已选")
                  : t("한 곳 선택", "pick one", "1つ選択", "选一家", "選一家")}
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
                        onSelect={() => (selectedClubIds.includes(c.id) ? toggleClub(c.id) : chooseClub(c))}
                        onOpenDetail={() => openDetail(g.items, c)}
                        lang={lang}
                        note={closedOnDate(c) ? closedLabel : (openDowsLine(c.open_dows) ?? undefined)}
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
          // overscroll-contain: 목록 맨 위에서 당기면 pull-to-refresh로 새서 화면이 날아간다.
          className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto overscroll-contain p-0"
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
                showSave={false}
                cta={
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => (selectedClubIds.includes(detailClub.id) ? toggleClub(detailClub.id) : chooseClub(detailClub))}
                      disabled={!selectedClubIds.includes(detailClub.id) && closedOnDate(detailClub)}
                      className={`flex-[7] flex items-center justify-center gap-1.5 py-3.5 rounded-xl font-black text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedClubIds.includes(detailClub.id)
                          ? "bg-muted text-foreground/80 hover:bg-muted"
                          : "bg-amber-500 text-black hover:bg-amber-400"
                      }`}
                    >
                      {selectedClubIds.includes(detailClub.id)
                        ? t("선택 해제", "Remove selection", "選択解除", "取消选择")
                        : closedOnDate(detailClub)
                          ? `${closedLabel} · ${eventDate ? formatEventDate(eventDate, lang) : ""}`
                          : t("이 클럽으로 술 고르기", "Choose drinks here", "ここでドリンクを選ぶ", "在这家选酒", "在這家選酒")}
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
      </>
      )}

      {formStep === 3 && (
      <>
      {progress}
      {/* 요약 한 줄 — 클럽·날짜·인원·정확한 총액. 제안서에 실리는 숫자와 같다. */}
      <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-foreground tracking-tight">
          {t("어디로 회신할까요?", "Where do we reply?", "どこに返信しますか？", "回复到哪里？", "回覆到哪裡？")}
        </h1>
        <p className="text-[13px] text-muted-foreground break-keep">
          {[
            selectedClubId ? displayClubName(clubById[selectedClubId]) : null,
            eventDate ? formatEventDate(eventDate, lang) : null,
            t(`${groupSize}명`, `${groupSize} ${groupSize > 1 ? "people" : "person"}`, `${groupSize}名`, `${groupSize}人`, `${groupSize}人`),
            picked
              ? `₩${picked.total.toLocaleString("en-US")}${menuCurrency && krwTo(picked.total, menuCurrency, fxRates) ? ` (≈ ${krwTo(picked.total, menuCurrency, fxRates)})` : ""}`
              : null,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      {stepChip(3)}
      </div>
      {/* 담은 메뉴 요약 — 3장까지 넘어오면 총액을 확인할 곳이 확인 시트(제출 직전)
          뿐이었다. 그 전에 "내가 뭘 담았는지" 다시 볼 방법도, 잘못 담았을 때
          고칠 방법도 없었다. 1장의 요약 카드와 같은 형태로 여기 다시 둔다 —
          탭하면 메뉴 시트가 그대로 열려 수정할 수 있다. */}
      {picked?.snapshot.md_recommend && (
        <button
          type="button"
          onClick={() => { if (hasMenu) setMenuOpen(true); }}
          className="w-full rounded-xl border border-amber-500/60 bg-card px-4 py-3 text-left transition-colors"
        >
          <span className="text-[13px] font-bold text-foreground">
            {t(
              `클럽이 ₩${picked.total.toLocaleString("en-US")} 예산 안에서 가장 맞는 세트를 제안해요`,
              `The club suggests the best set within ₩${picked.total.toLocaleString("en-US")}`,
              `クラブが₩${picked.total.toLocaleString("en-US")}以内で一番合うセットを提案します`,
              `夜店会在 ₩${picked.total.toLocaleString("en-US")} 预算内推荐最合适的套餐`,
              `夜店會在 ₩${picked.total.toLocaleString("en-US")} 預算內推薦最合適的套餐`
            )}
          </span>
          <span className="block text-[12px] text-muted-foreground mt-1">
            {t("가격은 확정 전에 알려드려요 · 직접 고르려면 탭", "Price confirmed before you commit · tap to choose drinks yourself", "価格は確定前にお知らせします · 自分で選ぶならタップ", "价格会在确认前告知 · 想自己选请点这里", "價格會在確認前告知 · 想自己選請點這裡")}
          </span>
        </button>
      )}
      {hasMenu && picked && !picked.snapshot.md_recommend && (
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="w-full rounded-xl border border-amber-500/60 bg-card px-4 py-3 text-left transition-colors"
        >
          <span className="text-[13px] text-muted-foreground font-bold">
            {t(
              `${picked.snapshot.items.length}개 선택됨`,
              `${picked.snapshot.items.length} item${picked.snapshot.items.length > 1 ? "s" : ""} selected`,
              `${picked.snapshot.items.length}点選択`,
              `已选 ${picked.snapshot.items.length} 项`
            )}
          </span>
          {/* 이름만 " · "로 이어붙인 한 줄 요약은 뭘 몇 개씩 얼마에 담았는지
              안 보였다 — 카트 시트와 같은 줄 단위 리스트로 바꾼다(2026-09-06). */}
          <div className="mt-3 space-y-2.5">
            {picked.snapshot.items.map((it, i) => {
              const img = imageOf(it.item_id);
              return (
                <div key={i} className="flex items-center gap-2.5">
                  {img && (
                    <div className="w-9 h-9 shrink-0 rounded-md bg-black overflow-hidden flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="" loading="lazy" className="w-full h-full object-contain pointer-events-none select-none" />
                    </div>
                  )}
                  <span className="min-w-0 flex-1 text-[12px] text-foreground/90 truncate">
                    {it.name_en}
                    {it.qty > 1 && <span className="text-muted-foreground"> x{it.qty}</span>}
                  </span>
                  <span className="text-money font-bold tabular-nums text-[12px] shrink-0">
                    ₩{(it.price * it.qty).toLocaleString("en-US")}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold">
              {t("합계", "Total", "合計", "合计")}
            </span>
            <span className="text-[17px] font-black text-money tabular-nums shrink-0">
              ₩{picked.total.toLocaleString("en-US")}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {t("변경하려면 다시 탭", "tap to change", "タップで変更", "点按可更改")}
          </p>
        </button>
      )}

      {/* 뒤로 — 메뉴 있는 클럽이면 "주류 수정"으로 메뉴 시트를 바로 다시 연다.
          1장으로 통째로 보내면 날짜·인원까지 다시 지나야 해서 한 번 더 돈다.
          메뉴 없는 클럽만 1장(날짜·인원·예산)으로 보낸다 — 고칠 게 그것뿐이다.
          같은 동작을 페이지 상단 "返回"에서도 쓸 수 있다 — stepBack()(위쪽
          useImperativeHandle)이 formStep===3일 때 이 버튼과 똑같이 처리한다. 이
          버튼은 폼 안에서 스크롤 없이 바로 누를 수 있게 남겨둔 지름길이다. */}
      <button
        type="button"
        onClick={() => (hasMenu ? setMenuOpen(true) : setFormStep(1))}
        className="flex items-center gap-1 text-[13px] font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        {hasMenu
          ? t("주류 수정", "Edit drinks", "ドリンクを編集", "编辑酒水")
          : t("클럽·날짜 수정", "Edit details", "詳細を編集", "编辑详情")}
      </button>

      {/* 예약자 이름 — 입구에서 확인하는 이름. 확인서 발행에 필수. */}
      <section>
        {label(<UserRound className="w-4 h-4 text-money" />, t("예약자 이름", "Name for the booking", "予約者名", "预订人姓名"))}
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder={t("여권에 있는 이름", "As shown on your passport", "パスポートの表記", "护照上的姓名")}
          className="w-full h-12 px-4 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
        />
        <p className="text-[12px] text-muted-foreground mt-1.5">
          {t("입구에서 이 이름으로 확인해요", "The door checks this name", "入口でこの名前を確認します", "入场时以此姓名核对")}
        </p>
      </section>

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
        {loading ? t("전송 중…", "Sending…", "送信中…", "提交中…", "提交中…") : t("요청 보내기 — 무료", "Send request — free", "リクエスト送信 — 無料", "提交请求 — 免费", "提交請求 — 免費")}
      </button>
      <p className="text-center text-[12px] text-muted-foreground -mt-3">
        {t("대부분 몇 시간 안에 회신 · 보증금 없음 · 현장 결제", "Most requests get a reply within hours · No deposit · Pay at the club", "多くは数時間以内に返信 · デポジット不要 · 現地払い", "大多数几小时内回复 · 无需订金 · 到店付款", "大多數幾小時內回覆 · 無需訂金 · 到店付款")}
      </p>
      </>
      )}


      {/* ── Step 4 · 접수 확인 + 다음 단계 + 채널 핸드오프 ─────────────────── */}
      {formStep === 4 && (() => {
        const club = selectedClub;
        const home = `/${lang === "ko" ? "en" : lang}`;
        const refText = requestRef ? `#${requestRef}` : "";
        const waText = encodeURIComponent(
          t(`안녕하세요, 요청 ${refText} 관련입니다`, `Hi, this is about request ${refText}`, `こんにちは、リクエスト ${refText} の件です`, `你好，关于请求 ${refText}`, `你好，關於請求 ${refText}`)
        );
        const icsUrl = (() => {
          if (!eventDate) return null;
          const d = eventDate.replace(/-/g, "");
          const summary = `NightFlow · ${club ? displayClubName(club) : "Seoul club"}`;
          const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NightFlow//EN", "BEGIN:VEVENT",
            `UID:${requestRef ?? d}@nightflow.kr`, `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${summary}`,
            `DESCRIPTION:Request ${refText} — bring your passport (19+)`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
          return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
        })();
        return (
          <div className="space-y-5 pb-12">
            <div className="flex flex-col items-center text-center gap-2.5 pt-2">
              <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/40 flex items-center justify-center">
                <Check className="w-7 h-7 text-money" strokeWidth={2.5} />
              </div>
              <h2 className="text-[22px] font-black text-foreground tracking-tight break-keep">
                {t("접수됐어요 — 클럽이 확인 중이에요", "Got it — the club is checking now", "受け付けました — クラブが確認中", "已收到 — 夜店正在确认", "已收到 — 夜店正在確認")}
              </h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
                {t(
                  `대부분 몇 시간 안에 회신해요. 확정되는 즉시 ${CONTACT_LABEL[contactType]}로 알려드릴게요.`,
                  `Most requests get a reply within hours. We'll message you on ${CONTACT_LABEL[contactType]} the moment it's confirmed.`,
                  `多くは数時間以内に返信します。確定次第 ${CONTACT_LABEL[contactType]} でお知らせします。`,
                  `大多数几小时内回复。一确认就通过 ${CONTACT_LABEL[contactType]} 通知你。`,
                  `大多數幾小時內回覆。一確認就透過 ${CONTACT_LABEL[contactType]} 通知你。`
                )}
              </p>
              {requestRef && <p className="text-[12px] font-bold text-muted-foreground tabular-nums">{t("접수 번호", "Request", "受付番号", "请求编号", "請求編號")} #{requestRef}</p>}
            </div>

            {/* 타임라인 */}
            <div className="rounded-2xl bg-card border border-border p-4">
              {[
                { done: true, active: false, title: t("접수 완료", "Request received", "受付完了", "已收到请求", "已收到請求"), sub: contactType === "email" ? t(`${contactValue.trim()}로 사본을 보냈어요`, `Copy sent to ${contactValue.trim()}`, `${contactValue.trim()} に控えを送信`, `副本已发送至 ${contactValue.trim()}`, `副本已寄至 ${contactValue.trim()}`) : t("방금", "Just now", "たった今", "刚刚", "剛剛") },
                { done: false, active: true, title: t("클럽이 테이블 확인 중", "Club confirming your table", "クラブがテーブルを確認中", "夜店正在确认桌位", "夜店正在確認包廂"), sub: t("보통 몇 시간 · 메뉴판 기준으로 가격 검수", "Usually within hours · Price checked against the menu", "通常数時間 · メニューで価格を照合", "通常几小时 · 按酒单核对价格", "通常幾小時 · 依酒單核對價格") },
                { done: false, active: false, title: t(`${CONTACT_LABEL[contactType]}로 예약 패스 발송`, `Booking pass on ${CONTACT_LABEL[contactType]}`, `${CONTACT_LABEL[contactType]} で予約パス`, `通过 ${CONTACT_LABEL[contactType]} 发送入场凭证`, `透過 ${CONTACT_LABEL[contactType]} 傳送入場憑證`), sub: t("입구에서 여권과 함께 보여주세요", "Show it at the door with your passport", "入口でパスポートと一緒に提示", "入口出示凭证和护照", "入口出示憑證和護照") },
              ].map((step, i, arr) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${
                      step.done ? "bg-money" : step.active ? "bg-amber-400 animate-pulse" : "border-2 border-border"
                    }`}>
                      {step.done && <Check className="w-3 h-3 text-background" strokeWidth={3} />}
                    </span>
                    {i < arr.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] ${step.done ? "bg-money" : "bg-border"}`} />}
                  </div>
                  <div className={`space-y-0.5 ${i < arr.length - 1 ? "pb-3.5" : ""}`}>
                    <p className={`text-[14px] font-extrabold ${step.active ? "text-brand-amber" : step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.title}</p>
                    <p className="text-[12px] text-muted-foreground break-all">{step.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 요약 */}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-2.5">
              {club && (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-muted">
                    {club.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={club.thumbnail_url} alt={displayClubName(club)} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-black text-foreground truncate">{displayClubName(club)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {areaLabel(club.area, lang)}
                      {club.google_rating != null && (club.google_review_count ?? 0) >= 5 ? ` · Google ${club.google_rating.toFixed(1)}` : ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("날짜", "Date", "日付", "日期", "日期")}</span>
                <span className="font-bold text-foreground">{eventDate ? formatEventDate(eventDate, lang) : "-"}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("인원", "Group", "人数", "人数", "人數")}</span>
                <span className="font-bold text-foreground">{t(`${groupSize}명`, `${groupSize} ${groupSize > 1 ? "people" : "person"}`, `${groupSize}名`, `${groupSize}人`, `${groupSize}人`)}</span>
              </div>
              {picked && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("총액", "Total", "合計", "总额", "總額")}</span>
                  <span className="font-black text-money tabular-nums">₩{picked.total.toLocaleString("en-US")} · {t("내가 고른 술", "your drinks", "選んだドリンク", "你选的酒", "你選的酒")}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("회신", "Reply to", "返信先", "回复到", "回覆到")}</span>
                <span className="font-bold text-foreground break-all text-right">{CONTACT_LABEL[contactType]} {contactValue.trim()}</span>
              </div>
            </div>

            {/* 채널 핸드오프 — WhatsApp 번호가 있으면 wa.me, 없으면 인스타 DM. */}
            <div className="space-y-2.5">
              {whatsapp ? (
                <a
                  href={`https://wa.me/${whatsapp}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-14 rounded-full bg-money text-background font-black text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
                >
                  <MessageCircle className="w-[18px] h-[18px]" strokeWidth={2.5} />
                  {t("WhatsApp으로 이어가기", "Continue on WhatsApp", "WhatsApp で続ける", "在 WhatsApp 继续", "在 WhatsApp 繼續")}
                </a>
              ) : (
                <a
                  href="https://ig.me/m/nightflow.kr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-14 rounded-full bg-inverse text-inverse-foreground font-black text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
                >
                  <Instagram className="w-[18px] h-[18px]" />
                  {t("인스타그램 DM 열기", "Open Instagram DM", "Instagram の DM を開く", "打开 Instagram 私信", "打開 Instagram 私訊")}
                </a>
              )}
              {icsUrl && (
                <a
                  href={icsUrl}
                  download="nightflow-booking.ics"
                  className="w-full h-12 rounded-full bg-card border border-border text-foreground font-extrabold text-[14px] flex items-center justify-center gap-2 hover:bg-muted transition-colors"
                >
                  <CalendarPlus className="w-4 h-4" />
                  {t("캘린더에 추가", "Add to calendar", "カレンダーに追加", "添加到日历", "加入行事曆")}
                </a>
              )}
              {whatsapp ? (
                <p className="text-center text-[12px] text-muted-foreground">
                  {t(`"요청 ${refText}" 메시지가 미리 채워져 열려요`, `Opens a chat with "request ${refText}" pre-filled`, `「リクエスト ${refText}」入りのチャットが開きます`, `将打开预填“请求 ${refText}”的聊天`, `將打開預填「請求 ${refText}」的聊天`)}
                </p>
              ) : requestRef ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`Request #${requestRef}`).then(
                      () => toast.success(t("복사됐어요", "Copied", "コピーしました", "已复制", "已複製")),
                      () => toast.error(t("복사 실패", "Couldn't copy", "コピー失敗", "复制失败", "複製失敗"))
                    );
                  }}
                  className="w-full text-center text-[12px] text-muted-foreground underline underline-offset-2"
                >
                  {t(`DM 첫 줄에 "요청 #${requestRef}"을 붙여주세요 · 탭해서 복사`, `Start your DM with "Request #${requestRef}" · tap to copy`, `DM の最初に「Request #${requestRef}」を · タップでコピー`, `私信第一行写 "Request #${requestRef}" · 点按复制`, `私訊第一行寫 "Request #${requestRef}" · 點按複製`)}
                </button>
              ) : null}
            </div>

            {/* 준비물 */}
            <div className="space-y-2">
              <p className="text-[14px] font-black">{t("가기 전에", "Before you go", "行く前に", "出发前", "出發前")}</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-2.5 text-[13px] font-bold">
                  <ShieldCheck className="w-4 h-4 text-money shrink-0" />
                  {t("입구에서 여권 확인 · 19세 이상", "Passport at the door · 19+", "入口でパスポート確認 · 19歳以上", "入口查验护照 · 19岁以上", "入口查驗護照 · 19歲以上")}
                </div>
                <Link href={`${home}/dress-code`} className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-2.5 text-[13px] font-bold hover:bg-muted transition-colors">
                  <Sparkles className="w-4 h-4 text-money shrink-0" />
                  <span className="flex-1">{t("드레스코드 보기", "Dress code guide", "ドレスコードを見る", "查看着装要求", "查看服裝規定")}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
                <div className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-2.5 text-[13px] font-bold">
                  <Mail className="w-4 h-4 text-money shrink-0" />
                  {t("결제는 클럽에 직접 · 나플에 내는 돈 없음", "Pay the club directly · nothing to NightFlow", "支払いはクラブへ直接 · NightFlow への支払いなし", "直接付给夜店 · 不经 NightFlow", "直接付給夜店 · 不經 NightFlow")}
                </div>
              </div>
            </div>

            <Link href={`${home}/clubs`} className="block w-full h-12 text-center leading-[48px] text-[13px] font-bold text-muted-foreground hover:text-foreground">
              {t("다른 밤도 계획 중? 클럽 둘러보기 →", "Planning another night? Browse clubs →", "別の夜も？クラブを見る →", "还想安排别的夜晚？浏览夜店 →", "還想安排別的夜晚？瀏覽夜店 →")}
            </Link>
          </div>
        );
      })()}

      {/* ── Step 5 · 리마인더 저장 완료 ─────────────────────────────────── */}
      {formStep === 5 && (
        <div className="space-y-6 pb-12 text-center">
          <div className="text-[44px] pt-4">📬</div>
          <div className="space-y-2">
            <h2 className="text-[20px] font-black text-foreground tracking-tight break-keep">
              {reminderDate
                ? t(`${formatEventDate(ymdLocal(reminderDate), lang)}에 이메일 드릴게요`, `We'll email you on ${formatEventDate(ymdLocal(reminderDate), lang)}`, `${formatEventDate(ymdLocal(reminderDate), lang)} にメールします`, `我们会在 ${formatEventDate(ymdLocal(reminderDate), lang)} 发邮件给你`, `我們會在 ${formatEventDate(ymdLocal(reminderDate), lang)} 寄信給你`)
                : t("저장됐어요", "Saved", "保存しました", "已保存", "已儲存")}
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">
              {t(
                "요청을 마치기 전까지 클럽에는 아무것도 전달되지 않아요. 일정이 확정되면 링크로 돌아와 몇 분 안에 끝낼 수 있어요.",
                "Nothing goes to the club until you finish the request. When your trip is set, come back through the link and finish in a couple of minutes.",
                "リクエストを完了するまでクラブには何も送られません。予定が決まったらリンクから戻って数分で完了できます。",
                "在你完成请求之前，不会向夜店发送任何内容。行程定了以后通过链接回来，几分钟就能完成。",
                "在你完成請求之前，不會向夜店傳送任何內容。行程定了以後透過連結回來，幾分鐘就能完成。"
              )}
            </p>
          </div>
          <div className="space-y-2.5">
            <Link href={`/${lang === "ko" ? "en" : lang}/clubs`} className="block w-full h-14 rounded-full bg-inverse text-inverse-foreground font-black text-[15px] leading-[56px] hover:opacity-90 transition-opacity">
              {t("그동안 클럽 둘러보기", "Browse clubs meanwhile", "その間にクラブを見る", "先看看夜店", "先看看夜店")}
            </Link>
            <button type="button" onClick={() => router.replace(`/${lang === "ko" ? "en" : lang}`)} className="w-full h-12 rounded-full bg-card border border-border text-foreground font-bold text-[14px]">
              {t("홈으로", "Back to home", "ホームへ", "返回首页", "返回首頁")}
            </button>
          </div>
        </div>
      )}

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
              <span className="text-muted-foreground">{t("예약자", "Name", "予約者", "预订人")}</span>
              <span className="text-foreground font-semibold">{guestName.trim()}</span>
            </div>
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
            {picked && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{picked.snapshot.md_recommend ? t("예산 (클럽 추천)", "Budget (club suggests)", "予算（クラブおまかせ）", "预算（夜店推荐）", "預算（夜店推薦）") : t("총액", "Total", "合計", "总额")}</span>
                <span className="text-money font-black tabular-nums">
                  ₩{picked.total.toLocaleString("en-US")}
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

      {/* 술 메뉴 시트 — 담기를 끝내면 picked에 스냅샷과 총액이 들어온다.
          h-[92vh]로 거의 전체를 덮는다: 카테고리 탭 + 목록 + 하단 합계가 한 화면에
          들어와야 "지금 얼마인지" 보면서 고를 수 있다. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          /* sheet.tsx의 side="bottom" 기본값엔 데스크탑 폭 제한이 없지만, 이 시트는
             부모(폼)가 lg:max-w-lg 안에 있어서 그 폭을 그대로 물려받아 데스크탑에서도
             좁게 잡혔다 — 2열 그리드 오른쪽 절반이 화면 밖으로 잘리던 원인.
             전체 뷰포트 폭을 쓰도록 명시한다. */
          /* overscroll-contain: 목록 맨 위에서 아래로 당기면 브라우저가 새로고침으로
             채가서 담은 게 전부 날아갔다. 실제 스크롤 컨테이너가 이 시트라 여기에 건다. */
          className="rounded-t-3xl bg-background border-border h-[92vh] w-screen max-w-none p-0 overflow-y-auto overscroll-contain"
        >
          <SheetTitle className="sr-only">
            {t("술 고르기", "Choose drinks", "ドリンクを選ぶ", "选择酒水")}
          </SheetTitle>
          <MenuPicker
            lang={lang}
            items={menuItems}
            combos={menuCombos}
            isWeekend={isWeekend}
            tableChargeWeekday={menuCharge.weekday}
            tableChargeWeekend={menuCharge.weekend}
            zone={menuZone}
            onZoneChange={setMenuZone}
            rates={fxRates}
            fxAsOf={fxAsOf}
            defaultCurrency={menuCurrency}
            /* 시트 안에서는 앱 하단 네비가 오버레이에 가려지므로 바닥에 붙인다. */
            bottomOffset={0}
            minAmount={minBudget}
            /* 확정본이 있으면 그걸, 없으면 닫으면서 남긴 초안을 되돌린다. */
            /* 티어 프리셋(세트 1개)은 아무것도 담긴 게 없을 때만. */
            initialSnapshot={picked?.snapshot ?? menuDraft?.snapshot ?? presetSnapshot}
            /* 시트로 먼저 들어온 손님용 출구. 이미 담은 게 있으면(수정하러 연 경우) 방해라 뺀다. */
            topSlot={!picked || picked.snapshot.md_recommend ? mdRecommendBox(true) : undefined}
            onDraftChange={(snapshot, total) => setMenuDraft({ snapshot, total })}
            onDone={(snapshot, total) => {
              setPicked({ snapshot, total });
              setMenuDraft({ snapshot, total });
              setMenuOpen(false);
              // 담기를 마치면 3장(연락처)으로 자동 전환한다 — 클럽·날짜·인원은
              // 이미 확정된 값이라 손님이 다시 1장으로 돌아갈 이유가 없다.
              setFormStep(3);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
});

// 캐러셀 카드 — 카드(썸네일) 탭하면 onOpenDetail(상세시트), 우상단 체크 버튼 탭하면 onSelect(선택).
// 꾹 누르기는 발견성이 낮아서(사용자가 존재를 모름) 제거 — 탭 한 번으로 누구나 상세를 볼 수 있게.
function ClubCard({
  club,
  selected,
  onSelect,
  onOpenDetail,
  lang,
  note,
}: {
  club: ClubItem;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  lang: Lang;
  /** "그날 휴무" 같은 경고. 있으면 카드를 흐리게 하고 선택 버튼을 막는다. */
  note?: string;
}) {
  const t = makeT(lang);
  const reviewsLabel = t("리뷰", "reviews", "件のレビュー", "条评价");
  const selectLabel = t("선택", "Select", "選択", "选择");
  const removeLabel = t("선택 해제", "Remove", "選択解除", "取消选择");

  return (
    <div className="shrink-0 w-[120px] snap-start select-none">
      {/* overflow-clip 이유: 가로 스크롤 스트립 안 카드 전체 크기 이미지 컨테이너에
          overflow-hidden을 쓰면 브라우저가 그 요소를 잠재적 스크롤 컨테이너로 취급해
          위에서 시작한 스와이프가 부모 스트립으로 전파되지 않는다(2026-09-07 실측,
          EnHomeClient ClubThumb과 동일 패턴). */}
      <div className={`relative w-[120px] h-[120px] rounded-2xl overflow-clip bg-muted border-2 ${selected ? "border-amber-500" : "border-border"} ${note ? "opacity-60" : ""}`}>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${displayClubName(club)} — ${t("상세정보", "details", "詳細", "详情")}`}
          className="block w-full h-full text-left active:opacity-70 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {club.thumbnail_url && <img src={club.thumbnail_url} alt={displayClubName(club)} draggable={false} className="w-full h-full object-cover" />}
        </button>
        {/* 시각 크기(24px 원)는 유지하되 터치 영역을 44px로 넓힌다 — 카드 전체는
            상세보기로 먹혀 있어, 이 버튼이 클럽을 고르는 유일하게 짧은 경로다. */}
        <button
          type="button"
          onClick={onSelect}
          disabled={!!note && !selected}
          aria-label={selected ? removeLabel : selectLabel}
          aria-pressed={selected}
          className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center disabled:cursor-not-allowed"
        >
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              selected ? "bg-amber-500" : "bg-black/45 border border-white/50"
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
          </span>
        </button>
      </div>
      <p className="text-[13px] font-bold text-foreground mt-2 truncate">{displayClubName(club)}</p>
      {note && <p className="text-[11px] text-red-400 font-bold">{note}</p>}
      {club.google_review_count != null && (
        <p className="text-[12px] text-muted-foreground">
          {club.google_review_count.toLocaleString()} {reviewsLabel}
        </p>
      )}
    </div>
  );
}
