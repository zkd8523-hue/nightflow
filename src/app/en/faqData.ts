// Seoul nightlife FAQ for foreign visitors.
// Researched & cross-checked (KTO/VisitKorea, Korea Herald, CNN, Resident Advisor,
// embassy advisories, recent 2024-2026 guides). Answers are written for tourists.
// Keep facts conservative — no specific club names (venues close fast), no soft-pedaling drug law.

export type FaqCategory =
  | "entry"
  | "cost"
  | "safety"
  | "culture"
  | "areas"
  | "practical";

export interface FaqItem {
  id: string;
  category: FaqCategory;
  q: string;
  a: string;
  /** 강한 경고/안전 항목은 시각적으로 강조 */
  emphasis?: "warning" | "safety";
}

export const FAQ_CATEGORIES: { code: FaqCategory; label: string; emoji: string }[] = [
  { code: "entry", label: "Entry & ID", emoji: "🪪" },
  { code: "cost", label: "Cost & Payment", emoji: "💳" },
  { code: "safety", label: "Safety & Scams", emoji: "🛡️" },
  { code: "culture", label: "Club Culture", emoji: "🍾" },
  { code: "areas", label: "Areas & Timing", emoji: "📍" },
  { code: "practical", label: "Practical", emoji: "🧭" },
];

export const FAQ_ITEMS: FaqItem[] = [
  // ── Entry & ID ──────────────────────────────────────────────
  {
    id: "age",
    category: "entry",
    q: "What's the legal age to drink and enter clubs?",
    a: "19 — but Korea counts it by birth year, not your exact birthday. You qualify on January 1 of the year you turn 19, so in 2026 anyone born in 2007 or earlier is fine. Ignore the common online myth that you 'add 1 to your Western age' — for alcohol it's purely your birth year. Doors check strictly.",
  },
  {
    id: "id",
    category: "entry",
    q: "What ID do I need? Is a passport required?",
    a: "Bring your physical passport (or your ARC if you live in Korea). That's the only foreign ID reliably accepted. Foreign driver's licenses are often refused, and a photo/scan of your passport is hit-or-miss. Carry the real passport even though there's a small loss risk.",
  },
  {
    id: "dresscode",
    category: "entry",
    q: "Is there a dress code?",
    a: "It depends on the area. Gangnam is strictest — no shorts, sandals/slides, or sweatpants; dress sharp. Hongdae is casual (jeans and sneakers are fine). Itaewon is the most relaxed and international. When unsure, dressing well improves your odds with picky Gangnam doors.",
  },
  {
    id: "foreigner-refusal",
    category: "entry",
    q: "Do some clubs refuse foreigners?",
    a: "Unfortunately yes, and it's legal — Korea has no broad anti-discrimination law, so private venues can refuse entry. It's most common at upscale Gangnam spots. Itaewon is the most foreigner-friendly, Hongdae is also welcoming. Bringing your passport and dressing well reduces friction.",
  },
  {
    id: "solo",
    category: "entry",
    q: "Can I get in alone, or do I need a group?",
    a: "Solo entry is fine — lots of foreigners club alone, especially in Hongdae and Itaewon. There's no formal group or gender-ratio rule for normal entry, though solo men can face pickier doors (dressing well helps). Women often get easier or free entry early in the night.",
  },
  {
    id: "guestlist",
    category: "entry",
    q: "Do I need a guest list or a promoter (MD)?",
    a: "No, you can just walk up and pay the cover. But a guest list or promoter (called an 'MD' here) can skip or discount the cover and smooth entry. Arriving before ~11pm–midnight often means free or reduced entry too. In Gangnam, the equivalent is reserving a table through an MD — that usually includes entry.",
  },

  // ── Cost & Payment ──────────────────────────────────────────
  {
    id: "cover",
    category: "cost",
    q: "How much is the entry / cover charge?",
    a: "Roughly: Hongdae ₩5,000–20,000, Itaewon ₩10,000–30,000, Gangnam ₩20,000–30,000. A free drink is very commonly included. It's often free before ~11pm, and sometimes free for women on weeknights. Street promoters hand out discount and free-drink tickets early in the night.",
  },
  {
    id: "table",
    category: "cost",
    q: "How much does a table / bottle service cost?",
    a: "It's a minimum spend on bottles, not a flat fee. In Gangnam mega-clubs, entry-level tables start around ₩500,000–700,000 (2 bottles, up to ~6 people), mid-tier ₩800,000–1,050,000, and premium/champagne sets run ₩2,000,000+. A small ~₩50,000 table charge is usually added; mixers are included. A table is never required — you can just pay the cover and dance.",
  },
  {
    id: "payment",
    category: "cost",
    q: "Cash or card? Do foreign cards work?",
    a: "Korea is overwhelmingly card-based and most clubs accept foreign Visa/Mastercard. Still, carry some cash (₩20,000–50,000) as backup for small bars, lockers, or the occasional decline. Tell your bank you're traveling so the card isn't blocked.",
  },
  {
    id: "tipping",
    category: "cost",
    q: "Do I tip?",
    a: "No. Korea has no tipping culture, and that includes clubs, bars, and bottle service. Don't tip — it's not expected and can cause confusion. The only exception is some upscale hotel bars / fine dining that add an automatic ~10% service charge to the bill, which is a printed line item, not a discretionary tip.",
  },
  {
    id: "night-total",
    category: "cost",
    q: "What does a full night out realistically cost?",
    a: "Budget night in Hongdae/Itaewon (pre-drinks + one cover + a few drinks + shared taxi): about ₩40,000–90,000. VIP night in Gangnam is the table — ₩500,000–1,000,000+ total, which split among a group of 6–10 is roughly ₩70,000–170,000 each.",
  },
  {
    id: "hidden-fees",
    category: "cost",
    q: "Any hidden charges to watch for?",
    a: "Mainly the table minimum spend (the real reason Gangnam tables feel pricey) plus a small ~₩50,000 table charge. Some clubs add tax/venue fees on top of bottle minimums. At Korean pubs/pochas (not clubs) it's a social norm to order at least one food dish with drinks. Korean law requires final prices be displayed — always check the menu.",
  },

  // ── Safety & Scams ──────────────────────────────────────────
  {
    id: "scam-overview",
    category: "safety",
    q: "What scams target foreigners at night?",
    a: "The big one is the 'no-menu' inflated-bill bar: a tout pulls you into a small bar with no posted prices, then hands you a huge bill at the end. Related traps: street touts offering 'free shots / free entry,' and 'juicy bars' where women push you to buy expensive drinks. These are a small number of predatory venues — easily avoided once you know the pattern.",
    emphasis: "warning",
  },
  {
    id: "no-menu",
    category: "safety",
    q: "How does the 'no-menu' bill scam work — and how do I avoid it?",
    a: "You're invited into a venue with no printed prices, order a few drinks, and get a wildly inflated bill (prosecuted cases hit millions of won for under two hours). Avoid it: only enter bars with visibly printed prices, refuse 'free entry/drink' invites from people on the street, never let staff take your card out of sight, and check each round's price before ordering. If trapped with a shocking bill, call 1330 or 112 instead of paying on the spot.",
    emphasis: "warning",
  },
  {
    id: "spiking",
    category: "safety",
    q: "Is drink spiking a real risk?",
    a: "It's documented but uncommon. There are court-prosecuted cases of staff drugging solo foreign tourists to run their cards, and reported GHB cases in the major nightlife areas. Take the universal precautions: buy your own drinks, watch them poured, never leave a drink unattended, don't accept drinks from strangers, and stay with people you trust.",
    emphasis: "safety",
  },
  {
    id: "emergency",
    category: "safety",
    q: "What are the emergency & help numbers?",
    a: "112 — Police. 119 — Fire / Ambulance (ambulance is free, including for foreigners). 1330 — Korea Travel Hotline: 24/7, free, English-speaking, and it also handles tourist complaints like overcharging. Dial 1330 in Korea (press 2 for English). Even a phone with no SIM can reach 112/119.",
    emphasis: "safety",
  },
  {
    id: "safe-solo",
    category: "safety",
    q: "Is Seoul nightlife safe for solo travelers and women?",
    a: "Yes — Seoul is one of the safest big cities in the world, and it's normal to see women out alone late. Violent street crime is rare; the main annoyances are drunk behavior and harassment in the busiest zones. Get home with the Kakao T app (it logs your route) rather than an unofficial street taxi, and keep your phone charged.",
  },
  {
    id: "watch-venues",
    category: "safety",
    q: "Which venues should I be cautious about?",
    a: "Be most careful with small 'juicy bars' and hostess-style bars (notably around Itaewon's back alleys and the edges of Hongdae), where the whole model is hidden, inflated tabs. The simple rule: avoid any venue without clearly posted prices, and avoid any bar a street tout pulled you into. Big, well-known dance clubs are not where these scams happen.",
    emphasis: "warning",
  },

  // ── Club Culture ────────────────────────────────────────────
  {
    id: "what-i-want",
    category: "culture",
    q: "What kind of club do I actually want?",
    a: "A regular 'dance club' is just like a Western nightclub — DJ, dance floor, you stay with your own group. That's what most travelers want (Hongdae, Itaewon, and the dance floors of Gangnam mega-clubs). Avoid 'room salons' (expensive private-room hostess venues that often refuse foreigners) — that's not a tourist night out.",
  },
  {
    id: "booking",
    category: "culture",
    q: "What is Korean 'booking' culture?",
    a: "At certain table-service 'booking clubs,' a waiter physically walks guests over to introduce them to other tables — waiter-brokered matchmaking. The people involved are ordinary clubgoers (not staff) and can decline or leave anytime. It's specific to those venues — Hongdae dance clubs and underground electronic clubs don't work this way.",
  },
  {
    id: "md-role",
    category: "culture",
    q: "What does an 'MD' (promoter) do?",
    a: "An MD is a club promoter — a middleman who builds guest lists, fills tables, and curates the crowd. Tourists contact an MD (usually via Instagram or KakaoTalk) for easier/cheaper entry or to reserve a table. English sources call this role a 'promoter' or 'host.' On NightFlow, you skip the DMs — you post what you want and clubs come to you.",
  },
  {
    id: "table-what",
    category: "culture",
    q: "What do I get with a table, and do I have to dance?",
    a: "A reserved table or booth, one or more bottles with mixers, ice, glasses, and a server. It's about space, status, and group seating — not a requirement to have fun. You can absolutely skip the table, pay the cover, and just dance. Hongdae and Itaewon are mostly standing/dance venues anyway.",
  },
  {
    id: "etiquette",
    category: "culture",
    q: "Any etiquette I should know?",
    a: "Don't film strangers — many clubs discourage dance-floor photography and privacy is taken seriously. Don't crash private tables. If a waiter tries to 'book' you and you're not interested, a polite smile and clear 'no thank you' is totally fine. When drinking with older or higher-status Koreans, pour with two hands — though among same-age friends on a dance floor it's relaxed.",
  },
  {
    id: "music",
    category: "culture",
    q: "What music do the different areas play?",
    a: "Gangnam mega-clubs: mainstream EDM, big-room and commercial house — glossy and high-budget. Hongdae: a young mix of indie, hip-hop, K-pop and electronic in smaller, cheaper clubs. Itaewon: the most underground — techno, house, UK bass, plus hip-hop rooms — the pick for serious music fans.",
  },

  // ── Areas & Timing ──────────────────────────────────────────
  {
    id: "area-compare",
    category: "areas",
    q: "Gangnam vs Hongdae vs Itaewon — which is for me?",
    a: "Hongdae: young, energetic, budget-friendly, student crowd — great for a casual lively party. Itaewon: the most international and inclusive, strongest underground/techno scene, very English-friendly. Gangnam: upscale, dress-to-impress mega-clubs with table service and mainstream EDM — glamorous but pricier.",
  },
  {
    id: "timing",
    category: "areas",
    q: "What time do clubs open, peak, and close?",
    a: "Most open between 10pm and midnight but are dead that early. Crowds build after midnight and peak around 1am–3am (Gangnam even later). Many stay open until 5–6am, so Seoul nightlife genuinely runs till morning. The local rhythm is bars first (9–11pm), clubs after midnight.",
  },
  {
    id: "best-nights",
    category: "areas",
    q: "Which nights are best?",
    a: "Friday and Saturday are the peak by far — biggest crowds, top DJs, best energy in all three areas. Weeknights are much quieter; some smaller venues feel dead mid-week, though a few underground/Itaewon spots host weeknight events. For guaranteed atmosphere, go Friday or Saturday.",
  },
  {
    id: "which-clubs",
    category: "areas",
    q: "Which specific clubs should I go to?",
    a: "Seoul's club scene turns over fast and many travel blogs recommend venues that have already closed (the once-famous Club Octagon, for example, shut in 2020). Rather than chase a blog's list, verify any club on Instagram or Resident Advisor (ra.co) for a recent or upcoming event before you go. The NightFlow map shows currently active venues.",
    emphasis: "warning",
  },
  {
    id: "getting-home",
    category: "areas",
    q: "How do I get home after clubs close?",
    a: "Three options: (1) wait for the first subway around 5:30am — a popular plan; (2) taxi via the Kakao T app (expect late-night surcharges, roughly +20–40% from ~11pm–4am, and a real wait at closing time); (3) night buses ('Owl Buses,' marked N) run midnight–5am between hubs every ~30–40 min. Use Naver Map or KakaoMap for live routing.",
  },
  {
    id: "halloween",
    category: "areas",
    q: "Anything seasonal I should know?",
    a: "Halloween (late October) is the biggest event, historically huge in Itaewon and Hongdae. Since the 2022 Itaewon crowd-crush tragedy it's now heavily regulated, with strong police presence and crowd control — expect restrictions and plan carefully. Otherwise, weekends year-round are the reliable peak.",
  },

  // ── Practical ───────────────────────────────────────────────
  {
    id: "smoking",
    category: "practical",
    q: "Can I smoke inside?",
    a: "Not on the dance floor or main areas — Korea bans indoor smoking in all bars and clubs. Most venues have a designated smoking room or an outdoor spot near the entrance; keep your stamp/wristband so you can get back in. Some venues now only offer outdoor areas.",
  },
  {
    id: "coat-check",
    category: "practical",
    q: "Is there a coat check / bag storage?",
    a: "Most bigger clubs have one, but it's usually not free — around ₩3,000 per item (varies by venue). Worth it in winter so you're not carrying a coat on a packed floor. Travel light and leave large bags behind. Keep the claim ticket.",
  },
  {
    id: "language",
    category: "practical",
    q: "Do I need to speak Korean? What apps help?",
    a: "No — Hongdae and Itaewon are very foreigner-friendly and staff at popular clubs handle basic English. Download Papago (Naver's translator, better than Google for Korean) for signs and menus, and Kakao T for taxis (type your destination in English, it sends the Korean address to the driver). There's also k.ride, a foreigner-only taxi app.",
  },
  {
    id: "atm",
    category: "practical",
    q: "Where can I get cash with a foreign card?",
    a: "Convenience-store ATMs (CU, GS25, 7-Eleven, Emart24) are 24/7 and easy to find in every nightlife district — look for a 'Global ATM' sticker meaning it takes foreign cards. They charge ~₩3,000–6,000 and cap around ₩300,000 per withdrawal. If one rejects your card, try a different bank or brand.",
  },
  {
    id: "drugs",
    category: "practical",
    q: "What about drugs?",
    a: "Don't. Korea has one of the strictest zero-tolerance drug regimes in the world, and it applies fully to foreigners while you're here. Any amount of any drug can mean up to 5 years in prison plus huge fines, and for foreigners typically arrest, detention, deportation, and a re-entry ban. Police do urine and hair-follicle testing, and 'I didn't know' is no defense. Don't buy, carry, accept, or use anything — not even something offered inside a club.",
    emphasis: "warning",
  },
  {
    id: "lgbtq",
    category: "practical",
    q: "Where's the LGBTQ+ nightlife?",
    a: "Itaewon, on a short lane long nicknamed 'Homo Hill' (officially Usadan-ro 12-gil) — about 10–15 queer bars and clubs, openly welcoming to foreigners, with a mixed local and international crowd. Itaewon Station (Line 6), Exit 3, ~5 min walk. Things start after 11pm and run till 5–6am. The scene itself is friendly and safe.",
  },
  {
    id: "what-to-bring",
    category: "practical",
    q: "What should I bring?",
    a: "Always your passport (the only reliably accepted foreign ID — a driver's license usually won't cut it). Some cash for the cover plus a card and your phone with taxi/translation apps. Dress for the area. Travel light — leave big bags at the hotel. A T-money card (any convenience store) is handy for subway, bus, and some taxis.",
  },
];
