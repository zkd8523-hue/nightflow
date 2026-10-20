# 아티클 뉴스레터 발송 SOP

매주 목요일, 아티클 한 호를 구독자에게 이메일로 보내는 절차.
**cron 없음. 사람이 어드민에서 버튼을 눌러야만 나간다.**

---

## 0. 한 번만 하는 준비

| 할 일 | 어디서 | 확인 |
|---|---|---|
| Migration `695_newsletter_sends.sql` 적용 | Supabase 대시보드 SQL Editor (파일 내용 그대로 붙여넣기) | `select count(*) from newsletter_sends;` 가 0을 돌려주면 끝 |
| `RESEND_API_KEY` | Vercel 환경변수 (이미 있음 — 구독 확인 메일이 쓰는 그 키) | — |
| 발신 주소 | 기본값 `NightFlow <team@nightflow.kr>` (`RESEND_FROM` 미설정 시) | — |

> 695를 적용하지 않으면 발송 라우트가 **에러를 내고 멈춘다.** 중복 방지 장치 없이 메일이
> 나가느니 발송이 안 되는 쪽이 낫다는 판단이다. `db push` 는 쓰지 않는다.

---

## 1. 호 조판 (개발)

1. 웹 원고를 `src/components/weekly/IssueYYYYMMDD.tsx` 에 쓰고 `src/lib/weekly/issues.ts` 에 등록 (기존 절차)
2. **메일판을 `src/lib/email/weeklyIssue.ts` 에 따로 짠다** — 웹 컴포넌트를 재사용하지 않는다
   (Next `<Image>`, iframe, Web Audio, Tailwind 가 메일에서 전부 죽는다)
3. `WEEKLY_EMAIL_ISSUES` 배열에 `{ slug, volume, subject, preheader, webUrl, html }` 추가

조판되지 않은 호는 어드민 드롭다운에 **아예 뜨지 않는다**. 실수로 고를 수 없다.

### 메일 HTML 규칙 (어기면 지메일·네이버·아웃룩에서 깨진다)
- `<table>` 레이아웃만. flex / grid / position 금지
- 스타일은 전부 인라인 `style=`. `<style>` 블록은 지메일이 잘라낸다
- 웹폰트 금지 (시스템 폰트 스택)
- 본문 폭 600px 고정, 이미지는 `width="100%" + max-width:600px;height:auto;display:block`
- 흰/미색 배경 + 검정 글씨. 어두운 배경을 깔지 않는다 (다크모드 반전 대비)
- 이미지가 차단돼도 뜻이 통해야 한다 — 날짜·장소·가격을 이미지 안에만 두지 않는다
- `<iframe>` / `<video>` / `<audio>` / JS 금지

---

## 2. 매주 발송 절차

`/admin/newsletter` → "이번 호 발송" 패널. **반드시 이 순서대로.**

### ① 미리보기 (아무것도 안 나감)
"미리보기" 버튼 → 새 탭에 메일 HTML 그대로.
직링크: `/api/admin/newsletter/preview?slug=2026-10-22`

### ② 대상 세기 (아무것도 안 나감)
"대상 세기" 버튼 → 네 칸이 뜬다.

| 칸 | 뜻 |
|---|---|
| 구독 중 | 수신거부·반송이 아닌 전체 |
| **보낼 대상** | 이번에 실제로 나갈 수 |
| 이미 보냄 | 이 호를 이미 받은 사람 (`newsletter_sends`) |
| 실패 | Resend 가 거절한 건. 재시도 대상 |

### ③ 테스트 1통
주소를 입력하고 "테스트". **그 한 곳에만** 간다. 발송 기록에 남기지 않는다.
제목·본문은 실제 발송과 글자 하나까지 같다 (접두사 안 붙임).

- 입력한 주소가 구독자면 진짜 수신거부 토큰이 들어간다 → 링크까지 실제로 눌러볼 수 있다
- 구독자가 아니면 더미 토큰 → 눌러도 "처리할 수 없는 주소입니다". 남의 구독을 끊지 않는다
- 지메일 / 네이버 / 아웃룩 / 아이폰 메일 각각에서 한 번씩 볼 것. 특히 **다크모드**

### ④ 전체 발송
확인 칸에 슬러그(`2026-10-22`)를 **직접 타이핑**해야 빨간 버튼이 열린다.

- 한 번에 최대 **300통**. 남으면 버튼을 다시 누른다 (대상 세기로 남은 수 확인)
- 내부적으로 Resend 배치 100통씩, 배치 사이 600ms (레이트리밋 초당 2요청)
- 실패가 있으면 패널 아래 "실패한 N건만 다시 보내기" 가 뜬다

---

## 3. 중복 방지가 어떻게 되나

`newsletter_sends (subscriber_id, issue_slug)` **유니크 인덱스**가 전부다.
애플리케이션 조건문이 아니라 DB 제약으로 막는다.

순서가 중요하다 — **보내기 전에 줄을 먼저 잡는다.**

```
1. upsert(..., ignoreDuplicates: true).select()   ← 줄 잡기. 중복은 조용히 빠진다
2. 돌아온 줄만 Resend 로 보낸다
3. 응답에 따라 status = 'sent' / 'failed'
```

| status | 뜻 | 재시도 |
|---|---|---|
| `claimed` | 선점했지만 Resend 응답 전 (프로세스가 중간에 죽으면 여기 남는다) | **자동 재시도 안 함.** 눈으로 보고 판단 |
| `sent` | Resend 가 접수 | 안 함 |
| `failed` | Resend 가 거절 | retry 모드로 재시도 |

보낸 뒤에 기록하는 구조였다면 버튼이 두 번 눌렸을 때 둘 다 통과한다.
선점이 먼저면 최악의 경우가 "안 보냈는데 보낸 걸로 남는 것"인데, 중복 수신보다 이쪽이 낫다.

**제외 대상**: `unsubscribed_at IS NOT NULL`, `bounced_at IS NOT NULL`.
`welcome_sent_at` 은 보지 않는다 — 확인 메일이 실패했어도 구독 의사는 유효하다.

---

## 4. API 직접 호출 (어드민 쿠키 필요)

```
POST /api/admin/newsletter/send
{ "slug": "2026-10-22", "mode": "count" }                      // 세기만
{ "slug": "2026-10-22", "mode": "test", "testEmail": "me@x.com" }
{ "slug": "2026-10-22", "mode": "live", "confirm": "2026-10-22", "limit": 300 }
{ "slug": "2026-10-22", "mode": "retry", "confirm": "2026-10-22" }
```

- `mode` 에 기본값이 없다. 빼먹으면 400. 발송이 기본인 경로는 만들지 않았다
- `live` / `retry` 는 `confirm` 이 slug 와 정확히 같아야 한다

---

## 5. 발송 후 확인

```sql
-- 호별 현황
select issue_slug, status, count(*) from newsletter_sends group by 1,2 order by 1,2;

-- 응답 전에 끊긴 줄 (사람이 판단)
select * from newsletter_sends
where status = 'claimed' and claimed_at < now() - interval '10 minutes';
```

반송·스팸신고는 `/api/webhooks/resend` 가 받는다.
(현재 그 웹훅은 `users.email_bounced` 만 건드린다 — 구독자 테이블의 `bounced_at` 까지
채우려면 웹훅을 한 번 더 손봐야 한다. 아직 안 했다.)

---

## 6. 알려진 한계 / 미룬 것

| 항목 | 상태 |
|---|---|
| `List-Unsubscribe` 헤더 | 넣음 (지메일 상단 수신거부 버튼) |
| `List-Unsubscribe-Post` 원클릭 | **안 넣음.** 메일 클라이언트가 POST 를 쏘는데 수신거부가 Next 페이지(GET)라 405 가 난다. 라우트로 바꿔야 가능 |
| Resend 웹훅 → `newsletter_subscribers.bounced_at` | 미연결 |
| 오픈율·클릭률 | 미집계 (Resend 웹훅에 `email.opened` / `email.clicked` 를 붙이면 된다) |
| 예약 발송 | 없음. 사람이 누른다 |
