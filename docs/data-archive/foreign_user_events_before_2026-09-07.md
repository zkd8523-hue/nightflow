# 외국인 트랙 이벤트 아카이브 — 초기화 전 요약

**아카이브 시점** 2026-09-06T15:55:50Z
**원본** `foreign_user_events_before_2026-09-07.json` (6,189건, 컬럼 전체 보존)
**기간** 2026-07-04 ~ 2026-09-06

## 왜 초기화했나

2026-09-06에 계측을 대폭 보강했다 — 21개 SEO 페이지(guide·faq·kpop·vip·nightlife·hiphop × 4언어)와
사이드바 CTA에 추적이 아예 없었고, 이탈 이벤트(`foreign_page_exit`)는 존재하지 않았다.
그 이전 데이터는 **분모(랜딩)와 분자(전환) 양쪽에 구멍**이 있어 전환율이 왜곡된다.
두 왜곡이 반대 방향이라 보정도 불가능해서, 새 기준으로 다시 쌓기로 했다.

`foreign_requests`(실제 예약 요청 10건)와 한국 트랙(`lang=ko`, 107,147건)은 건드리지 않았다.

## 규모

| | 값 |
|---|---|
| 이벤트 | 6,189 |
| 고유 방문자(anon_id) | 2,437 |
| 세션 | 2,617 |

언어별 이벤트: en 4,064 · ja 1,142 · zh-tw 621 · zh 362

## 세션 퍼널 (참고용 — 위 왜곡 감안)

| 언어 | 랜딩 | CTA | 폼 | 게이트 | 제출 |
|---|---|---|---|---|---|
| en | 1,451 | 250 | 169 | 91 | 8 |
| ja | 617 | 59 | 55 | 8 | 0 |
| zh-tw | 326 | 31 | 24 | 5 | 0 |
| zh | 223 | 29 | 28 | 7 | 0 |

> 폼 > CTA인 언어가 있는 건 오류가 아니다. 폼 도달의 69%가 CTA를 안 거쳤다
> (사이드바·저장된 링크·직접 진입). 그래서 단계 간 비율이 아니라 랜딩 대비로 봐야 한다.

## 유입 채널 (referrer 호스트 상위)

- (direct): 3,272
- google.com: 1,835
- l.instagram.com: 347
- instagram.com: 130
- m.blog.naver.com: 97
- chatgpt.com: 87
- search.yahoo.co.jp: 80
- m.search.naver.com: 57
- nightflow.kr: 48
- bing.com: 43

## 이벤트 종류 상위

- `foreign_clubs_view`: 1,630
- `en_home_view`: 763
- `foreign_club_page_view`: 744
- `foreign_club_card_click`: 532
- `foreign_request_form_view`: 403
- `foreign_trip_gate_view`: 389
- `foreign_club_page_scroll`: 300
- `foreign_guide_page_view`: 209
- `foreign_trip_gate_qualified`: 152
- `foreign_guide_page_scroll`: 146
- `foreign_book_at_club_click`: 130
- `foreign_login_view`: 129
- `puzzle_detail_view`: 95
- `ja_home_view`: 94
- `zh_home_view`: 69

## 이 기간 확인된 사실 (다른 세션에서 실측)

- 일본어·중국어 CTA 클릭률이 영어의 1/4 (2.6% / 2.3% vs 11.5%)
- 외국어 트랙 주간 방문자: 7월 2주 111 → 8월 5주 573 (5배, 광고 0원)
- 유료 광고 흔적 0 — utm_source가 organic/direct/instagram/chatgpt뿐
- ChatGPT·Perplexity 유입 실재 (chatgpt.com 262건)
- 620만원 예약 1건은 Microsoft Teams 링크 공유로 유입 (UK 번호)

## 복원

필요하면 JSON의 `rows`를 `user_events`에 그대로 INSERT하면 된다. `id`가 원본 그대로라
충돌 시 제외하고 넣을 것.
