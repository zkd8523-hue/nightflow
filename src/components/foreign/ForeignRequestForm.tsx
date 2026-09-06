"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X, Check, MapPin, Users, UserRound, Calendar, Coins, MessageCircle, Languages, ChevronRight, Heart, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FILTER_GROUPS, makeTag } from "@/lib/clubs/tags";
import { TAG_LABEL_I18N } from "@/lib/clubs/tagLabelsI18n";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";
import { krwToAll, formatAsOfLocale } from "@/lib/utils/currency";
import { useKrwRates } from "@/lib/utils/useKrwRates";
import { pinFeatured } from "@/lib/clubs/foreignSort";
import { ClubDateCalendar } from "@/components/clubs/ClubDateCalendar";
import { formatOpenDows, formatOpenDowsEn, isClubOpenOn } from "@/lib/utils/clubOpenDays";
import { trackForeignEvent, trackEvent } from "@/lib/analytics/events";
import { getCurrentUtm } from "@/lib/analytics/userEvents";
import { useSavedClubs } from "@/lib/clubs/savedClubs";
import { MenuPicker } from "@/components/foreign/MenuPicker";
import { saveFormDraft, loadFormDraft, clearFormDraft, FOREIGN_BOOKING_DRAFT_KEY } from "@/lib/utils/formDraft";
import { useUnsavedFormGuard } from "@/hooks/useUnsavedFormGuard";
import type { ClubMenuItem, ClubMenuCombo, SelectedMenuSnapshot } from "@/types/database";


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
const BROWSE_AREAS = ["이태원", "홍대", "강남"];
// 이태원 Recommend 상위 3자리 수동 큐레이션 — 자동 알고리즘(리뷰수 기준)이 구글 장소 오매칭 등으로
// 신뢰 못 할 값을 낼 때가 있어(예: BAT 리뷰수 급증), 검증된 클럽 3곳을 고정 후보로 두고 노출 순서만 섞음.
const ITAEWON_RECOMMEND_CURATED = ["Dawn", "BADASS", "Day&night"];
// 3개면 MD가 비교 제안하기 충분하고, 그 이상은 고르다 지쳐 폼을 못 끝낸다.
// 클럽은 한 곳만 고른다. 호텔을 잡을 때 세 곳을 동시에 찔러놓지 않는 것과 같다 —
// 무엇보다 손님이 그 클럽의 메뉴를 직접 골라 총액을 확정하는 흐름이라, 클럽이
// 여러 곳이면 어느 메뉴판을 담을지 정해지지 않는다.
// 칩은 토글로 해제되므로 미선택 = 전 지역. "서울 어디든" 칩은 그 상태와 중복이라 뺐다.
const AREAS = ["이태원", "홍대", "강남"];
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
  const fx = useKrwRates();
  const fxRates = fx.rates;
  const fxAsOf = formatAsOfLocale(fx.asOfIso, lang);

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
  const [area, setArea] = useState<string>(presetArea && AREAS.includes(presetArea) ? presetArea : "이태원");
  const [groupSize, setGroupSize] = useState(2);
  // 기본 40만원으로 시작. 빈칸이면 외국인은 시세를 몰라 아무 숫자도 못 적고 이탈했다
  // (게이트까지 통과한 13명 중 12명이 폼에서 증발, 상당수가 클럽 목록으로 되돌아감).
  // 40만 = private table + 보틀 2~3병 수준이라, 금액과 받는 것을 같이 보여줄 수 있는 기준점.
  // 빈칸으로 시작한다. 기본값을 박아두면 그 숫자가 앵커가 돼서 대부분 그대로 보낸다
  // (실제로 40만 기본값일 때 접수 3건 중 2건이 40만 이하였다).
  // 대신 아래 금액 버튼으로 시세를 모르는 사람도 한 번에 고를 수 있게 한다.
  const [budget, setBudget] = useState("");
  const budgetAmount = () => Number(budget.replace(/[^0-9]/g, "")) || 0;


  // 금액이 오르면 받는 것도 달라져야 한다 — 고정 문구면 "올려도 그대로"라 올릴 이유가 없어진다.
  // 구간은 실제 업장 통념 기준(입장만 → 스탠딩 → 프라이빗+보틀 → VIP). 클럽마다 편차가 커서
  // 단정하지 않고 "보통 이 정도"로 표현한다.
  const budgetTier = (won: number) => {
    if (won < 700000)
      return t(
        "프라이빗 테이블 + 보틀 2~3병 (클럽에 따라 다름)",
        "Private table + 2–3 bottles (varies by club)",
        "プライベートテーブル + ボトル2〜3本（クラブにより異なる）",
        "私人卡座 + 2~3瓶酒（因店而异）",
        "私人包廂 + 2~3瓶酒（因店而異）"
      );
    if (won < 1500000)
      return t(
        "좋은 자리의 프라이빗 테이블 + 보틀 4병 이상",
        "Prime private table + 4+ bottles",
        "良い位置のプライベートテーブル + ボトル4本以上",
        "位置好的私人卡座 + 4瓶以上",
        "位置好的私人包廂 + 4瓶以上"
      );
    return t(
      "VIP 테이블 · 샴페인 세트 (대형 클럽 최상위 라인)",
      "VIP table · champagne service",
      "VIPテーブル・シャンパンサービス",
      "VIP 卡座 · 香槟服务",
      "VIP 包廂 · 香檳服務"
    );
  };
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

  // 고른 클럽의 영업요일 — 달력에서 휴무일을 막는 근거. 클럽을 안 골랐으면
  // 막을 근거가 없으니 null(=제한 없음)이다.
  const selectedClubOpenDows =
    (selectedClubId ? clubs.find((c) => c.id === selectedClubId)?.open_dows : null) ?? null;

  const closedNotice = selectedClubOpenDows?.length
    ? t(
        `${formatOpenDows(selectedClubOpenDows)} 영업 · 그 외 요일은 선택할 수 없어요 (공휴일·공휴일 전날은 가능)`,
        `Open ${formatOpenDowsEn(selectedClubOpenDows)} · other days can't be selected (holidays and their eves are open)`,
        `${formatOpenDowsEn(selectedClubOpenDows)} 営業 · 他の曜日は選択できません（祝日・祝日前日は可）`,
        `${formatOpenDowsEn(selectedClubOpenDows)} 营业 · 其他日期无法选择（节假日及前一天可选）`
      )
    : null;

  // 금·토는 주말 가격표를 쓴다. 클럽 영업이 새벽까지라 "금요일 밤"이 주말의 시작이다.
  const isWeekend = (() => {
    if (!eventDate) return false;
    const d = new Date(eventDate + "T00:00:00").getDay();
    return d === 5 || d === 6;
  })();

  // 클럽이 바뀌면 이전 클럽 메뉴로 담은 건 무효다 — 반드시 비운다.
  useEffect(() => {
    setPicked(null);
    setMenuDraft(null);
    setMenuZone(null);
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
    })();
    return () => {
      alive = false;
    };
  }, [selectedClubId]);

  // 메뉴 데이터가 있는 클럽만 메뉴 단계를 태운다. 아직 29곳뿐이라 나머지는
  // 기존처럼 예산만 받고 운영자가 조율한다.
  const hasMenu = menuItems.length > 0;

  // 메뉴를 골랐으면 그 합계가, 아니면 직접 입력한 예산이 주문 금액이다.
  // 최소주문금액 검증과 DB 저장이 같은 값을 봐야 한다.
  const orderAmount = picked ? picked.total : budgetAmount();

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
  // 여행 확정 게이트 — 계획중(막연) 유저는 깃발 마켓 오염·MD 오퍼 낭비라 걸러 홈으로 회유.
  //
  // ⚠️ 클럽을 지정해서 왔다고(presetClubId) 게이트를 건너뛰지 않는다.
  // "Book at ○○" 버튼은 현재 관심을 표현하는 유일한 수단이라 사실상 찜 대용으로 눌린다 —
  // 확정된 방문 의사로 보기엔 신호가 약해서, 게이트를 스킵하면 미확정 리드가 그대로 들어온다.
  // 대신 게이트 화면에 고른 클럽명을 띄워 "내 선택이 살아있다"는 것만 보여준다.
  const [tripStatus, setTripStatus] = useState<null | "qualified" | "planning">(null);
  // 폼을 세 장으로 나눈다 — 한 화면에 클럽+메뉴+연락처를 다 우겨넣으면 스크롤이
  // 너무 길어져 "지금 뭘 채우고 있는지"를 잃는다. 호텔 예약 사이트들이 이미
  // 검증한 패턴: 대상(1) → 상세 옵션(2) → 연락처(3).
  //   1장: 클럽(자동 확정) + 날짜 + 인원 → "주류 선택"
  //   2장: 메뉴 시트 (전체화면급) — 담기 완료하면 자동으로 3장
  //   3장: 이름·연락처·언어·메모 → 전송
  const [formStep, setFormStep] = useState<1 | 3 | 4>(1);

  // 강제종료·새로고침·오조작으로 입력하던 걸 통째로 잃는 사고 방지(2026-09-06,
  // 한국인 폼과 동일 정책). "술을 하나라도 담았을 때"부터 지킨다 — 클럽 탐색
  // 단계(1장 초반)까지 막으면 그냥 구경하다 나가려는 손님까지 붙잡게 된다.
  type ForeignDraft = {
    eventDate: string;
    groupSize: number;
    area: string;
    budget: string;
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
  useUnsavedFormGuard(hasProgress && formStep !== 4);
  const [resumePrompt, setResumePrompt] = useState<ForeignDraft | null>(null);

  // 마운트 시 1회 — 저장된 초안이 있으면 "이어하시겠습니까?"부터 묻는다.
  useEffect(() => {
    const draft = loadFormDraft<ForeignDraft>(draftKey);
    if (draft?.picked) setResumePrompt(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진행 중인 입력을 계속 저장 — 강제종료돼도 다음 방문 때 복원 후보가 된다.
  useEffect(() => {
    if (!hasProgress || formStep === 4) return;
    saveFormDraft<ForeignDraft>(draftKey, {
      eventDate, groupSize, area, budget, selectedClubIds, picked, menuZone,
      guestName, contactType, preferredLang, contactValue, notes,
    });
  }, [hasProgress, formStep, eventDate, groupSize, area, budget, selectedClubIds, picked, menuZone, guestName, contactType, preferredLang, contactValue, notes]);

  const applyDraft = (d: ForeignDraft) => {
    setEventDate(d.eventDate);
    setGroupSize(d.groupSize);
    setArea(d.area);
    setBudget(d.budget);
    setSelectedClubIds(d.selectedClubIds);
    setPicked(d.picked);
    setMenuZone(d.menuZone);
    setGuestName(d.guestName);
    setContactType(d.contactType);
    setPreferredLang(d.preferredLang);
    setContactValue(d.contactValue);
    setNotes(d.notes);
    // 여행 확정 게이트는 이미 통과한 상태였다 — 다시 묻지 않는다.
    setTripStatus("qualified");
    // 술까지 담았으면 연락처 단계(3장)로 바로 복귀한다.
    setFormStep(d.picked ? 3 : 1);
    setResumePrompt(null);
  };

  // 게이트·폼에서 "네가 고른 클럽"을 확인시켜 줄 이름.
  // 이게 없으면 "Book at BADASS"를 눌렀는데 클럽 얘기 없는 질문 화면이 떠서 선택이 증발한 걸로 보임.
  const [intentClubName, setIntentClubName] = useState<string | null>(() => {
    const preset = presetClubId ? clubs.find((c) => c.id === presetClubId) : undefined;
    return preset ? displayClubName(preset) : null;
  });

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
        setIntentClubName((prev) => prev ?? displayClubName(match));
      }
      if (intent.area && AREAS.includes(intent.area)) setArea((prev) => prev || intent.area!);
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
  const [clubSortKey, setClubSortKey] = useState<"recommend" | "reviews" | "rating">("recommend");
  const RECOMMEND_QUOTA_PER_AREA = 4;
  const LOAD_MORE_BATCH = 8;
  const INITIAL_BATCH = 8;
  // 위쪽 "지역" 탭에서 특정 지역을 고르면 그 지역 클럽만 보여줌 — 미선택이면 3지역 섞어서 노출.
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
    // 임시저장에서 복원된 날짜, 혹은 날짜를 고른 뒤 클럽을 바꾼 경우 — 달력에서
    // 막았다고 끝이 아니다.
    if (!isClubOpenOn(selectedClubOpenDows, eventDate)) {
      setDateOpen(true);
      return toast.error(
        t(
          "그 날은 클럽이 쉬는 날이에요. 날짜를 다시 골라주세요",
          "The club is closed that day. Please pick another date",
          "その日はクラブが休みです。別の日を選んでください",
          "该夜店当天休息，请另选日期"
        )
      );
    }
    // 메뉴가 있는 클럽은 담은 총액이 곧 예약 금액이다. 이때 예산 입력칸은 아예
    // 렌더되지 않으므로 budgetAmount()만 보면 영원히 0이라 제출이 통째로 막힌다.
    if (menuLoading) {
      return toast.error(t("메뉴를 불러오는 중이에요", "Loading the menu…", "メニューを読み込み中です", "正在加载酒单"));
    }
    if (hasMenu && !picked) {
      return toast.error(t("술을 먼저 골라주세요", "Choose your drinks first", "先にドリンクを選んでください", "请先选择酒水"));
    }
    // 최소주문금액 강제. 예전엔 `> 0` 조건이 붙어 있어 비워두면 그냥 통과했는데,
    // 그러면 하한선이 안내문일 뿐 아무것도 막지 못한다. 이 금액 아래로는 MD가
    // 자리를 못 잡아 왕복만 늘고 결국 무산되므로 입력 자체를 요구한다.
    if (orderAmount < minBudget) {
      return toast.error(minBudgetNotice);
    }
    if (!guestName.trim())
      return toast.error(t("예약자 이름을 입력해주세요", "Enter the name for the booking", "予約者名を入力", "请填写预订人姓名"));
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
      // 유료 광고(구글애즈 등) 채널별 전환 분석용. 새 파싱 로직 없이 세션에 이미
      // 기록된 UTM(userEvents.ts SSOT)을 그대로 실어 보낸다.
      const utm = getCurrentUtm();
      const { error } = await supabase.from("foreign_requests").insert({
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
        has_menu: !!picked,
        anonymous: !userId,
      });

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

  // 제목 한 줄로 통일 — 부제(무엇을 하면 무슨 일이 일어나는지)는 이미 1장 폼의
  // 클럽 카드·Choose drinks 버튼이 스스로 설명해서 중복이었다. 접수 완료(4단계)
  // 에선 숨긴다 — 완료 화면이 이미 "Your request is in" 제목을 자체로 갖고
  // 있어서 위에 남아있으면 제목이 중복돼 보인다(2026-09-06). 예전엔 이 타이틀이
  // 부모 페이지(서버 컴포넌트)에 있어서 formStep을 몰라 못 숨겼다 — 그래서
  // 게이트 화면 포함 모든 return에서 재사용하게 여기로 옮겼다.
  const formTitle = formStep !== 4 && (
    <h1 className="text-2xl font-black text-foreground tracking-tight">
      {t("서울의 밤 예약하기", "Book your Seoul night", "ソウルの夜を予約", "预订你的首尔夜晚")}
    </h1>
  );

  // ── 여행 확정 게이트 ────────────────────────────────────────────────
  // 계획중(막연)인 사람은 실제 방문 불확실 → MD 오퍼 낭비·마켓 오염. 확정된 유저만 폼 노출.
  if (tripStatus === null) {
    return (
      <div className="space-y-6 pb-12">
        {formTitle}
        {/* 고른 클럽을 게이트에서도 보여줌 — 이게 없으면 "Book at BADASS"를 눌렀는데
            클럽 얘기가 없는 질문 화면이 떠서, 선택이 날아간 줄 알고 목록으로 되돌아가 이탈했음.
            메인 폼(3장 구조)의 클럽 카드와 같은 형태로 통일 — 이미지 + 이름만.
            "선택했다"는 문장을 덧붙이면 오히려 뭘 확인해야 하는지 헷갈린다. */}
        {intentClubName && (() => {
          const intentClub = presetClubId ? clubById[presetClubId] : null;
          return (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
              <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
                {intentClub?.thumbnail_url && (
                  <img
                    src={intentClub.thumbnail_url}
                    alt={intentClubName}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <p className="text-[15px] font-black text-foreground truncate">{intentClubName}</p>
            </div>
          );
        })()}
        <div className="bg-card rounded-3xl border border-border p-6 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-black text-foreground leading-snug tracking-tight">
              {t(
                "한국 여행 일정이 확정됐나요?",
                "Is your Korea trip confirmed?",
                "韓国旅行の予定は確定していますか？",
                "你的韩国行程确定了吗?",
                "你的韓國行程確定了嗎?"
              )}
            </h2>
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
        {formTitle}
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
      {formTitle}

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
        description={t(
          `${resumePrompt?.picked?.snapshot.items.length ?? 0}개 주류 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 이어서 작성하시겠어요?`,
          `${resumePrompt?.picked?.snapshot.items.length ?? 0} drink${(resumePrompt?.picked?.snapshot.items.length ?? 0) > 1 ? "s" : ""} · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · Continue where you left off?`,
          `ドリンク${resumePrompt?.picked?.snapshot.items.length ?? 0}点 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 続きから再開しますか？`,
          `${resumePrompt?.picked?.snapshot.items.length ?? 0}款酒水 · ₩${(resumePrompt?.picked?.total ?? 0).toLocaleString("en-US")} · 是否继续之前的预订？`
        )}
        cancelText={t("아니요", "No", "いいえ", "否")}
        confirmText={t("이어하기", "Continue", "続ける", "继续")}
      />

      {/* 클럽을 이미 골랐으면 재선택 목록(캐러셀·검색·정렬탭) 전체를 걷어내고
          이 카드 하나로 대체한다 — 어차피 한 곳만 고르는 흐름이라, 다시 고를 목록을
          계속 띄워두는 건 "확정했다"는 느낌을 깨고 화면만 길어지게 한다.
          지우는 버튼은 안 둔다 — 클럽 상세에서 "Book at ○○"로 이미 확정하고 넘어온
          손님에게 "지금이라도 뺄 수 있다"는 걸 보여주는 게 오히려 모순이다.
          클럽을 바꾸려면 뒤로 가서 다른 클럽에서 다시 눌러야 한다. */}
      {formStep !== 4 && (() => {
        const selectedClub = selectedClubIds[0] ? clubById[selectedClubIds[0]] : null;
        if (!selectedClub) return null;
        return (
          <button
            type="button"
            onClick={() => openDetail([selectedClub], selectedClub)}
            className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border w-full text-left"
          >
            <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-muted">
              {selectedClub.thumbnail_url && (
                <img
                  src={selectedClub.thumbnail_url}
                  alt={displayClubName(selectedClub)}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-foreground truncate">
                {displayClubName(selectedClub)}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t("이 클럽으로 요청해요", "We'll request this club", "このクラブでリクエスト", "我们会申请这家夜店")}
              </p>
            </div>
          </button>
        );
      })()}

      {formStep !== 4 && (
      <>
      {/* 날짜 */}
      <section>
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
      </>
      )}

      {formStep === 1 && (
      <>
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

      {/* 술 메뉴 — 손님이 직접 담는다. 담은 합계가 곧 예약 금액이라 예산을 따로 묻지 않는다.
          "Drinks" 라벨은 뺐다 — 바로 아래 "Choose drinks" 버튼이 스스로 설명해서 중복이었다. */}
      {selectedClubId && (hasMenu || menuLoading) && (
        <section>
          {menuLoading ? (
            <div className="h-12 rounded-xl bg-card border border-border flex items-center px-4 text-[13px] text-muted-foreground">
              {t("메뉴 불러오는 중…", "Loading menu…", "メニューを読み込み中…", "正在加载酒单…")}
            </div>
          ) : picked ? (
            // 이미 담았으면 카드형 요약으로 — 탭하면 재선택. 다 고른 뒤에도 화면
            // 내내 큰 노란 버튼이 떠 있으면 "또 눌러야 하나" 싶어 오히려 방해된다.
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
          ) : (
            // 아직 안 골랐으면 화면 하단에 고정한다 — Date/인원 아래로 스크롤해도
            // "다음에 뭘 눌러야 하는지"가 계속 보여야 한다. 앱 하단 네비
            // (fixed bottom-0, h-60px, z-50)를 가려서 MenuPicker.tsx의 합계바와
            // 같은 방식으로 그 위에 얹는다.
            // 데스크탑 사이드바(lg:w-[248px])를 안 가리도록 그만큼 왼쪽에서 띄운다.
            // left-0으로 두면 뷰포트 전체 폭을 덮어 "Recently viewed" 등 사이드바
            // 콘텐츠와 겹쳤다.
            <div className="fixed bottom-[60px] left-0 right-0 lg:left-[248px] z-40 px-4 pb-3 pt-2 bg-background/95 backdrop-blur-sm border-t border-border">
              <button
                type="button"
                onClick={() => {
                  // 날짜가 없으면 메뉴를 열 수 없다 — 평일/주말 가격표가 갈려서
                  // 날짜를 모르면 애초에 값을 못 매긴다. 안내만 띄우고 끝내면
                  // "그래서 어디를 누르라는 건데" 가 되니 달력까지 같이 연다.
                  if (!eventDate) {
                    toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期"));
                    openDatePicker();
                    return;
                  }
                  setMenuOpen(true);
                }}
                className="w-full max-w-lg mx-auto h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all flex items-center justify-center"
              >
                {t("술 고르기", "Choose drinks", "ドリンクを選ぶ", "选择酒水")}
              </button>
            </div>
          )}
        </section>
      )}

      {/* 예산 — 메뉴 데이터가 없는 클럽에서만. 있으면 위에서 총액이 확정된다. */}
      {!hasMenu && !menuLoading && (
        <section>
          {/* 최소주문금액을 라벨 줄에 상시 띄운다. placeholder에만 두면 입력을 시작하는
              순간 사라져서, 정작 금액을 고민하는 동안에는 하한선이 안 보인다. */}
          <div className="flex items-center justify-between mb-2">
            {label(<Coins className="w-4 h-4 text-money" />, t("총 예산", "Total budget", "予算", "总预算"))}
            <span className="text-[12px] text-muted-foreground font-bold shrink-0">
              {t(
                `최소 ₩${minBudget.toLocaleString("en-US")}`,
                `Min ₩${minBudget.toLocaleString("en-US")}`,
                `最低 ₩${minBudget.toLocaleString("en-US")}`,
                `最低 ₩${minBudget.toLocaleString("en-US")}`,
                `最低 ₩${minBudget.toLocaleString("en-US")}`
              )}
            </span>
          </div>
          <div className="relative">
            <input
              inputMode="numeric"
              value={budget}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setBudget(raw ? Number(raw).toLocaleString("en-US") : "");
              }}
              placeholder={`${t("예)", "e.g.", "例)", "例)")} ${minBudget.toLocaleString("en-US")}`}
              className="w-full h-12 pl-4 pr-9 rounded-xl bg-card border border-border text-foreground text-[15px] focus:border-amber-500 outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-[15px] font-bold pointer-events-none">
              ₩
            </span>
          </div>
          {/* 가독성: 통화 4개를 한 줄에 나열하면 332px 안에 숫자가 뭉쳐 스캔이 안 된다.
              2열로 펼치고 역할별로 크기를 나눈다(받는 것 = 가장 큼 > 환산 > 기준일). */}
          {budget.trim() !== "" && budgetAmount() < minBudget && (
            <p className="text-[12px] text-red-400 font-semibold mt-1.5 break-keep">
              {minBudgetNotice}
            </p>
          )}
          {budgetAmount() > 0 && (
            <div className="mt-2 rounded-xl bg-card border border-border overflow-hidden">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-3">
                {krwToAll(budgetAmount(), fxRates).split(" · ").map((v) => (
                  <span key={v} className="text-[14px] text-foreground font-bold tabular-nums">
                    ≈ {v}
                  </span>
                ))}
              </div>
              {/* 이 박스의 핵심 정보 — 구분선으로 띄우고 가장 크게 */}
              <div className="border-t border-border px-3 py-2.5">
                <p className="text-[14px] text-foreground leading-relaxed break-keep">
                  <span className="text-money font-bold">✓</span> {budgetTier(budgetAmount())}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t(
                    `환율 ${fxAsOf} 기준 · 참고용`,
                    `Rates as of ${fxAsOf}`,
                    `${fxAsOf} 時点のレート`,
                    `汇率参考 ${fxAsOf}`,
                    `匯率參考 ${fxAsOf}`
                  )}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 1장 CTA. 메뉴가 있는 클럽은 위 "Choose drinks" 버튼 자체가 다음 단계로
          가는 문이라 여기 따로 버튼을 안 둔다 — 두 개를 나란히 두면 뭘 눌러야
          하는지 헷갈린다. 메뉴가 없는 클럽만 "다음"으로 3장(연락처)으로 간다. */}
      {!hasMenu && !menuLoading && (
        <button
          type="button"
          onClick={() => {
            if (!eventDate) {
              toast.error(t("날짜를 골라주세요", "Pick a date", "日付を選択", "请选择日期"));
              openDatePicker();
              return;
            }
            if (orderAmount < minBudget) return toast.error(minBudgetNotice);
            setFormStep(3);
          }}
          className="w-full h-14 rounded-full bg-amber-500 text-black font-black text-[16px] hover:bg-amber-400 active:scale-[0.99] transition-all"
        >
          {t("다음", "Next", "次へ", "下一步")}
        </button>
      )}

      {/* 클럽을 이미 골랐으면 재선택 목록(캐러셀·검색·정렬탭)은 위 카드로 대체됐으니 숨긴다.
          클럽을 지우면(위 카드 X) 다시 여기서 골라야 하니 그때만 보인다. */}
      {selectedClubIds.length === 0 && (
      <section>
        <div className="flex items-center justify-between mb-2">
          {label(<Search className="w-4 h-4 text-money" />, t("가고싶은 클럽", "Clubs you want", "行きたいクラブ", "想去的夜店"))}
          <span className="text-[12px] text-muted-foreground font-bold">
            {t("한 곳만 선택", "pick one", "1つだけ", "只选一家", "只選一家")}
          </span>
        </div>
        {selectedClubIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedClubIds.map((id) => {
              const full = clubById[id];
              const selectedList = selectedClubIds.map((x) => clubById[x]).filter(Boolean);
              return (
                <span key={id} className="flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 text-brand-amber text-[13px] font-bold">
                  {/* 이름 탭 = 상세 열기 (담은 뒤에도 다시 확인할 수 있어야 함), X = 빼기 */}
                  <button
                    type="button"
                    disabled={!full}
                    onClick={() => full && openDetail(selectedList, full)}
                    className="pl-3 pr-1.5 py-1.5 disabled:cursor-default"
                  >
                    {full ? displayClubName(full) : ""}
                  </button>
                  <button
                    type="button"
                    aria-label={t("빼기", "Remove", "外す", "移除")}
                    onClick={() => toggleClub(id)}
                    className="pl-0.5 pr-2.5 py-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

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
      )}

      {/* 클럽 둘러보기 팝업 — /clubs 수준 정렬+필터, 카드 클릭은 선택(toggleClub)으로 */}
      <Sheet open={browseOpen} onOpenChange={setBrowseOpen}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
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
                showSave={false}
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
      </>
      )}

      {formStep === 3 && (
      <>
      {/* 담은 메뉴 요약 — 3장까지 넘어오면 총액을 확인할 곳이 확인 시트(제출 직전)
          뿐이었다. 그 전에 "내가 뭘 담았는지" 다시 볼 방법도, 잘못 담았을 때
          고칠 방법도 없었다. 1장의 요약 카드와 같은 형태로 여기 다시 둔다 —
          탭하면 메뉴 시트가 그대로 열려 수정할 수 있다. */}
      {hasMenu && picked && (
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
          페이지 상단 "Back"은 router.back()이라 여기선 못 쓴다 — 그건 폼
          바깥(이전 페이지)으로 나가버려 3장에서 누르면 폼 자체가 사라진다. */}
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
        {loading ? t("전송 중…", "Sending…", "送信中…", "提交中…") : t("요청 보내기", "Send request — we'll connect you", "リクエスト送信", "提交 — 我们帮你连接")}
      </button>
      <p className="text-center text-[12px] text-muted-foreground -mt-3">
        {t("한국어·인맥 없어도 OK. 우리가 클럽에 연결해드려요.", "No Korean, no connections needed. We connect you.", "韓国語・人脈不要。私たちがつなぎます。", "无需韩语·人脉。我们帮你搞定。")}
      </p>
      </>
      )}

      {/* 접수 확인(4단계) — 예전엔 토스트 하나 뜨고 바로 홈으로 튕겼다. 몇 분간
          술을 고르고 연락처까지 넣은 손님이 정말 접수됐는지, 언제 연락이 오는지
          확인할 방법이 없었다. 무엇을 요청했는지 다시 보여주고 다음 단계를 알린다. */}
      {formStep === 4 && (() => {
        const club = selectedClubIds[0] ? clubById[selectedClubIds[0]] : null;
        return (
          <div className="space-y-6 pb-12 text-center">
            <div className="text-[48px] pt-4">✅</div>
            <div className="space-y-2">
              <h2 className="text-[20px] font-black text-foreground tracking-tight break-keep">
                {t("요청이 접수됐어요", "Your request is in", "リクエストを受け付けました", "已收到你的请求")}
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">
                {t(
                  "24시간 안에 연락드릴게요.",
                  "We'll reach out within 24 hours.",
                  "24時間以内にご連絡します。",
                  "我们会在24小时内联系你。"
                )}
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 text-left space-y-3">
              {club && (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-muted">
                    {club.thumbnail_url && (
                      <img src={club.thumbnail_url} alt={displayClubName(club)} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p className="text-[15px] font-black text-foreground truncate">{displayClubName(club)}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("날짜", "Date", "日付", "日期")}</span>
                <span className="font-bold text-foreground">{eventDate || "-"}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t("인원", "Group size", "人数", "人数")}</span>
                <span className="font-bold text-foreground">{groupSize}{t("명", "", "人", "人")}</span>
              </div>
              {picked && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{t("금액", "Amount", "金額", "金额")}</span>
                  <span className="font-black text-money">₩{picked.total.toLocaleString("en-US")}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.replace(`/${lang === "ko" ? "en" : lang}`)}
              className="w-full h-14 rounded-full bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 active:scale-[0.99] transition-all"
            >
              {t("홈으로", "Back to home", "ホームへ", "返回首页")}
            </button>
          </div>
        );
      })()}

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
                <span className="text-muted-foreground">{t("총액", "Total", "合計", "总额")}</span>
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
          className="rounded-t-3xl bg-background border-border h-[92vh] w-screen max-w-none p-0 overflow-y-auto"
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
            /* 시트 안에서는 앱 하단 네비가 오버레이에 가려지므로 바닥에 붙인다. */
            bottomOffset={0}
            minAmount={minBudget}
            /* 확정본이 있으면 그걸, 없으면 닫으면서 남긴 초안을 되돌린다. */
            initialSnapshot={picked?.snapshot ?? menuDraft?.snapshot ?? null}
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
        {/* 시각 크기(24px 원)는 유지하되 터치 영역을 44px로 넓힌다 — 카드 전체는
            상세보기로 먹혀 있어, 이 버튼이 클럽을 고르는 유일하게 짧은 경로다. */}
        <button
          type="button"
          onClick={onSelect}
          aria-label={selected ? removeLabel : selectLabel}
          aria-pressed={selected}
          className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
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
      {club.google_review_count != null && (
        <p className="text-[12px] text-muted-foreground">
          {club.google_review_count.toLocaleString()} {reviewsLabel}
        </p>
      )}
    </div>
  );
}
