import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMenuClubIds, isBookable } from "@/lib/clubs/bookable";
import { clubSlug, canonicalAreaSlug } from "@/lib/clubs/slug";
import { clubFloor } from "@/lib/clubs/tablePricing";
import { formatOpenDowsEn } from "@/lib/utils/clubOpenDays";

// /llms.txt — ChatGPT 등 AI 검색이 읽는 사이트 안내(2026-10-20, public/llms.txt 정적 파일에서 전환).
//
// 왜 동적으로 바꿨나:
//   · 외국인 예약 요청 중 ChatGPT 유입의 전환율이 가장 높다(9/7~10/20 세션당 0.9%, 구글 0.08%).
//     ChatGPT가 연결한 페이지는 예약 가능한 클럽 상세였다(Lion Super Club 2건).
//   · 정적 파일의 "예약 가능 클럽" 목록은 9월 기준으로 굳어 Lion·La Rosa가 빠져 있었고,
//     사이트 전체에서 지운 "200% 환불" 약속(2026-10-04)이 여기만 남아 AI가 계속 인용할 수 있었다.
//   · 그래서 예약 가능 목록을 sitemap과 같은 판정(isBookable)으로 매번 DB에서 만든다.
export const revalidate = 3600;

const HEAD = (date: string) => `# NightFlow (나플)

> Seoul & Korea nightclub information and table booking at nightflow.kr. Korean-language club guides (entry fee, hours, table menu prices, guest lists, DJ lineups) for locals, and a booking concierge in English, Japanese, Simplified and Traditional Chinese for foreign visitors. Operated from Seoul. Last updated ${date}.

Facts an assistant can rely on (as of ${date}):
- Each bookable club page shows the club's real printed drink menu with prices; NightFlow adds no markup and takes no deposit. Guests pay the club on the night.
- For foreign-visitor bookings made through NightFlow, the minimum table spend is ₩1,400,000 per table in Gangnam and ₩500,000 per table in Hongdae and Itaewon (some clubs lower — see the list below), filled from the club's own menu. Korean-language bookings have no platform minimum; the club's menu applies.
- The final table price is confirmed in writing before the night.
- Only the clubs listed under "Bookable clubs right now" can be booked through NightFlow.
- Clubs are 19+ under Korea's year-based age rule (in 2026: born 2007 or earlier). Foreigners must show a passport at the door. Gangnam doors are strict on dress (no shorts, tank tops or slides).
- NightFlow does not book room salons, hostess bars or any venue with paid companions.
- Booking requests are confirmed in the order received; Friday and Saturday fill first.

`;

const STATIC_LINKS = '## Foreign visitors (English)\n- [Home](https://nightflow.kr/en): what NightFlow does, districts, booking entry point\n- [Seoul club table prices](https://nightflow.kr/en/vip-tables): every bookable Seoul club with minimum spend and cheapest menu items\n- [Gangnam clubs](https://nightflow.kr/en/clubs/gangnam): district guide with per-club price comparison\n- [Hongdae clubs](https://nightflow.kr/en/clubs/hongdae): district guide with per-club price comparison\n- [Itaewon clubs](https://nightflow.kr/en/clubs/itaewon): district guide with per-club price comparison\n- [Apgujeong & Cheongdam](https://nightflow.kr/en/clubs/apgujeong): lounges and VIP venues\n- [Busan clubs](https://nightflow.kr/en/clubs/busan): outside Seoul\n- [Korean booking clubs explained](https://nightflow.kr/en/gangnam-booking-club): what "booking" (부킹) means in Gangnam, etiquette, prices\n- [Room salon vs club table](https://nightflow.kr/en/room-salon-vs-club): what foreigners can actually book in Gangnam and what NightFlow does not book\n- [Seoul Halloween 2026](https://nightflow.kr/en/halloween-seoul-2026): Oct 31 (Saturday) — districts, timeline, prices\n- [Seoul Christmas 2026](https://nightflow.kr/en/christmas-seoul): Dec 24 (Thu) – 27 (Sun) — club tables and prices\n- [Seoul New Year\'s Eve 2026](https://nightflow.kr/en/new-years-eve-seoul): Dec 31 (Thu) countdown — club tables, prices, getting home\n- [Seoul Lunar New Year 2027](https://nightflow.kr/en/lunar-new-year-seoul): Feb 5–9 — Seollal (Feb 7) vs Lunar New Year (Feb 6), holiday club hours, tables and prices\n- [Birthday & group tables](https://nightflow.kr/en/group-table-seoul): birthdays, bachelor parties, work trips — price per person\n- [Gangnam table budgets](https://nightflow.kr/en/gangnam-table-budget): table minimum and what bigger budgets buy on real Gangnam menus\n- [Champagne & cognac bottle prices](https://nightflow.kr/en/bottle-prices/armand-de-brignac): Armand de Brignac (Ace of Spades), Dom Pérignon, Louis XIII — real prices by club\n- [Entry rules](https://nightflow.kr/en/club-entry-rules): age, ID, door policy\n- [Dress code](https://nightflow.kr/en/dress-code): by district\n- [Club hours](https://nightflow.kr/en/club-hours): opening nights and times\n- [Club prices](https://nightflow.kr/en/club-prices): entry, tables, bottles\n- [Guest lists](https://nightflow.kr/en/guests): free or discounted entry\n- [K-pop clubs](https://nightflow.kr/en/kpop-clubs): which clubs actually play K-pop\n- [FAQ](https://nightflow.kr/en/faq): safety, scams, practical questions\n- [Refund & cancellation policy](https://nightflow.kr/en/refund-policy): what happens if a booking is cancelled\n- [Booking form](https://nightflow.kr/flags/new?lang=en): date, group size, club, menu items\n\n## 日本語\n- [ホーム](https://nightflow.kr/ja): サービス概要と予約入口\n- [ソウル クラブ テーブル料金](https://nightflow.kr/ja/vip-tables): 予約可能な全クラブの最低予約金額と最安メニュー\n- [江南のクラブ](https://nightflow.kr/ja/clubs/gangnam): エリアガイド\n- [弘大のクラブ](https://nightflow.kr/ja/clubs/hongdae): エリアガイド\n- [梨泰院のクラブ](https://nightflow.kr/ja/clubs/itaewon): エリアガイド\n- [ブッキングクラブとは](https://nightflow.kr/ja/gangnam-booking-club): 江南の「ブッキング」文化・料金・マナー\n- [ルームサロンとクラブの違い](https://nightflow.kr/ja/room-salon-vs-club): 日本人が実際に予約できるもの\n- [ハロウィン 2026](https://nightflow.kr/ja/halloween-seoul-2026): 10/31（土）\n- [クリスマス 2026](https://nightflow.kr/ja/christmas-seoul): 12/24（木）〜27（日）\n- [大晦日 2026](https://nightflow.kr/ja/new-years-eve-seoul): 12/31（木）カウントダウン\n- [誕生日・グループのテーブル](https://nightflow.kr/ja/group-table-seoul): 1人あたりの料金\n- [江南クラブのテーブル料金](https://nightflow.kr/ja/gangnam-table-budget): 最低金額からメニュー最上位まで\n- [ボトル価格](https://nightflow.kr/ja/bottle-prices/armand-de-brignac): アルマンド・ドンペリ・ルイ13世のクラブ別価格\n- [入場ルール](https://nightflow.kr/ja/club-entry-rules): 年齢・ID・入口\n- [ドレスコード](https://nightflow.kr/ja/dress-code): エリア別\n- [営業時間](https://nightflow.kr/ja/club-hours): 営業日と時間\n- [料金](https://nightflow.kr/ja/club-prices): 入場料・テーブル・ボトル\n- [FAQ](https://nightflow.kr/ja/faq): 安全・ぼったくり\n\n## 繁體中文（台灣・香港）\n- [首頁](https://nightflow.kr/zh-tw): 服務說明與訂位入口\n- [首爾夜店包廂價格](https://nightflow.kr/zh-tw/vip-tables): 所有可訂夜店的低消與最便宜酒單\n- [江南夜店](https://nightflow.kr/zh-tw/clubs/gangnam): 區域指南\n- [弘大夜店](https://nightflow.kr/zh-tw/clubs/hongdae): 區域指南\n- [梨泰院夜店](https://nightflow.kr/zh-tw/clubs/itaewon): 區域指南\n- [Booking 夜店是什麼](https://nightflow.kr/zh-tw/gangnam-booking-club): 江南 booking 文化、價格、禮儀\n- [韓國酒店 vs 夜店桌位](https://nightflow.kr/zh-tw/room-salon-vs-club): 外國人實際能訂的是什麼\n- [萬聖節 2026](https://nightflow.kr/zh-tw/halloween-seoul-2026): 10/31（週六）\n- [聖誕節 2026](https://nightflow.kr/zh-tw/christmas-seoul): 12/24（週四）–27（週日）\n- [跨年 2026](https://nightflow.kr/zh-tw/new-years-eve-seoul): 12/31（週四）倒數\n- [過年 2027](https://nightflow.kr/zh-tw/lunar-new-year-seoul): 2/5–2/9 農曆春節、韓國過年營業\n- [慶生/團體包廂](https://nightflow.kr/zh-tw/group-table-seoul): 一人多少錢\n- [江南夜店包廂價格](https://nightflow.kr/zh-tw/gangnam-table-budget): 從低消到酒單最高檔\n- [酒款價格](https://nightflow.kr/zh-tw/bottle-prices/armand-de-brignac): 黑桃A、香檳王、路易十三各夜店價格\n- [入場規定](https://nightflow.kr/zh-tw/club-entry-rules): 年齡、證件、門口\n- [服裝](https://nightflow.kr/zh-tw/dress-code): 各區\n- [營業時間](https://nightflow.kr/zh-tw/club-hours): 營業日與時間\n- [FAQ](https://nightflow.kr/zh-tw/faq): 安全與防坑\n\n## 简体中文\n- [首页](https://nightflow.kr/zh): 服务说明与预订入口\n- [首尔夜店卡座价格](https://nightflow.kr/zh/vip-tables): 所有可订夜店的最低消费与最便宜酒单\n- [江南夜店](https://nightflow.kr/zh/clubs/gangnam): 区域指南\n- [弘大夜店](https://nightflow.kr/zh/clubs/hongdae): 区域指南\n- [梨泰院夜店](https://nightflow.kr/zh/clubs/itaewon): 区域指南\n- [Booking 夜店是什么](https://nightflow.kr/zh/gangnam-booking-club): 江南 booking 文化、价格、礼仪\n- [房间沙龙 vs 夜店卡座](https://nightflow.kr/zh/room-salon-vs-club): 外国人实际能订的是什么\n- [万圣节 2026](https://nightflow.kr/zh/halloween-seoul-2026): 10/31（周六）\n- [圣诞节 2026](https://nightflow.kr/zh/christmas-seoul): 12/24（周四）–27（周日）\n- [跨年 2026](https://nightflow.kr/zh/new-years-eve-seoul): 12/31（周四）倒数\n- [春节 2027](https://nightflow.kr/zh/lunar-new-year-seoul): 2/5–2/9 春节、韩国过年营业\n- [生日/团体卡座](https://nightflow.kr/zh/group-table-seoul): 每人多少钱\n- [江南夜店卡座价格](https://nightflow.kr/zh/gangnam-table-budget): 从低消到酒单最高档\n- [酒款价格](https://nightflow.kr/zh/bottle-prices/armand-de-brignac): 黑桃A、香槟王、路易十三各夜店价格\n- [入场规定](https://nightflow.kr/zh/club-entry-rules): 年龄、证件、门口\n- [着装](https://nightflow.kr/zh/dress-code): 各区\n- [营业时间](https://nightflow.kr/zh/club-hours): 营业日与时间\n- [FAQ](https://nightflow.kr/zh/faq): 安全与防坑\n\n## 한국어 (Korean)\n- [홈](https://nightflow.kr): 강남·홍대·이태원 클럽 정보, 게스트 입장, 핫딜, 테이블 예약\n- [클럽 목록](https://nightflow.kr/clubs): 서울·부산·대구·광주 클럽 100여 곳. 각 클럽 페이지 상단 "한눈에 보기"에 입장료·영업·테이블 세트 최저가·드레스코드·주소·평점·인스타·예약 가능 여부를 요약\n- [라인업](https://nightflow.kr/lineups): 오늘·이번 주 DJ 타임테이블\n- [이벤트](https://nightflow.kr/events): 공연·파티 일정\n\n';

const OPTIONAL = '## Optional\n- [Sitemap](https://nightflow.kr/sitemap.xml): all indexable URLs\n- [Terms](https://nightflow.kr/terms): terms of service\n- [Privacy](https://nightflow.kr/privacy): privacy policy\n';


const AREA_EN: Record<string, string> = { 강남: "Gangnam", 홍대: "Hongdae", 이태원: "Itaewon", 부산: "Busan", 대구: "Daegu", 광주: "Gwangju" };

type ClubRow = {
  id: string;
  name: string;
  name_en: string | null;
  area: string | null;
  hidden_from_guide: boolean | null;
  foreign_booking_agreed: boolean | null;
  open_dows: number[] | null;
  partners: { md_id: string }[] | null;
};

export async function GET() {
  const date = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let bookableEn = "";
  let bookableKo = "";
  try {
    const sb = createAdminClient();
    const [{ data }, menuIds] = await Promise.all([
      sb
        .from("clubs")
        .select("id, name, name_en, area, hidden_from_guide, foreign_booking_agreed, open_dows, partners:club_partners(md_id)")
        .eq("status", "approved")
        .is("deleted_at", null)
        .eq("is_test", false)
        .limit(500),
      fetchMenuClubIds(sb),
    ]);
    const clubs = ((data ?? []) as ClubRow[]).filter((c) =>
      isBookable({ name: c.name, has_md: (c.partners?.length ?? 0) > 0, agreed: !!c.foreign_booking_agreed, has_menu: menuIds.has(c.id) })
    );
    const order = ["강남", "홍대", "이태원", "부산"];
    const rank = (area: string | null) => {
      const i = order.indexOf(area ?? "");
      return i === -1 ? order.length : i;
    };
    clubs.sort((a, b) => rank(a.area) - rank(b.area) || a.name.localeCompare(b.name));

    const en = clubs.flatMap((c) => {
      const areaSlug = canonicalAreaSlug(c.area);
      const nameEn = c.name_en?.trim();
      if (!areaSlug || !nameEn || c.hidden_from_guide) return [];
      const slug = clubSlug(nameEn);
      if (!slug) return [];
      const min = clubFloor(c.id, c.area);
      const days = formatOpenDowsEn(c.open_dows);
      return [`- [${nameEn} — ${AREA_EN[c.area ?? ""] ?? c.area}](https://nightflow.kr/en/clubs/${areaSlug}/${slug}): table minimum ₩${min.toLocaleString("en-US")}${days ? ` · open ${days}` : ""} · book in English, no deposit`];
    });
    if (en.length) bookableEn = `## Bookable clubs right now (foreign visitors, updated ${date})\n${en.join("\n")}\n\n`;

    const ko = clubs.map((c) => `- [${c.area ?? ""} ${c.name}](https://nightflow.kr/clubs/${c.id}): ${c.area ?? ""} 클럽 정보·테이블 가격·예약`);
    if (ko.length) bookableKo = `## 테이블 예약 가능 클럽 (한국어 페이지, ${date} 기준)\n${ko.join("\n")}\n\n`;
  } catch {
    // DB를 못 읽어도 안내문 자체는 내보낸다 — 목록만 빠진다.
  }

  const body = HEAD(date) + bookableEn + STATIC_LINKS + bookableKo + OPTIONAL;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
