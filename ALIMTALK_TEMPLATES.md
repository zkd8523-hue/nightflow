# NightFlow 카카오 알림톡 템플릿 (SOLAPI 등록용)

> **Model B 반영**: 결제 중개 없음. 낙찰 후 MD에게 직접 연락하는 플로우.
>
> **등록 방법**: SOLAPI 콘솔 → 알림톡 템플릿 → 신규 등록 → 카카오톡 채널 선택 → 내용 붙여넣기 → 검수 요청
>
> **승인 후**: SOLAPI 대시보드에서 템플릿 ID 복사 → `.env.local`의 해당 `ALIMTALK_TPL_*` 변수에 입력

---

## 거래성 알림 (동의 불필요)

### 1. 낙찰 알림 (AUCTION_WON)

**환경변수**: `ALIMTALK_TPL_AUCTION_WON`
**대상**: 얼리버드 낙찰자
**트리거**: `close-expired-auctions` Edge Function
**변수**: `#{clubName}`, `#{winningPrice}`, `#{auctionUrl}`
**버튼**: 웹링크 — "MD에게 연락하기" → `#{auctionUrl}`

```
[NightFlow] 축하합니다!

#{clubName} 경매에서 #{winningPrice}에 낙찰되었습니다.

지금 바로 MD에게 연락하여 예약을 확정하세요.
※ 60분 내 미연락 시 낙찰이 취소될 수 있어요
```

---

### 2. 연락 마감 경고 (CONTACT_DEADLINE_WARNING)

**환경변수**: `ALIMTALK_TPL_CONTACT_DEADLINE_WARNING`
**대상**: 얼리버드 낙찰자 (마감 20분 전)
**트리거**: `notify-contact-deadline` Edge Function (Cron: */2분)
**변수**: `#{userName}`, `#{clubName}`, `#{remainingMinutes}`, `#{auctionUrl}`
**버튼**: 웹링크 — "지금 연락하기" → `#{auctionUrl}`

```
[NightFlow] MD가 #{userName}님의 연락을 기다리고 있어요!

#{clubName} 얼리버드 예약 기회가 #{remainingMinutes}분 남았습니다.

※ 시간 초과 시 자격 박탈 및 스트라이크가 부과될 수 있습니다.
```

---

### 3. 미연락 제재 알림 (NOSHOW_BANNED)

**환경변수**: `ALIMTALK_TPL_NOSHOW_BANNED`
**대상**: 연락 타이머 만료된 낙찰자
**트리거**: `expire-contacts` Edge Function (Cron: *1분)
**변수**: `#{userName}`, `#{strikeCount}`, `#{penaltyStatus}`
**버튼**: 없음

```
[NightFlow] 미연락 제재 안내

#{userName}님, 낙찰 후 연락 시간이 만료되어 미연락 스트라이크가 부과되었습니다.

현재 스트라이크: #{strikeCount}회
#{penaltyStatus}

자세한 내용은 고객센터로 문의해주세요.
```

---

### 4. 차순위 낙찰 제안 (FALLBACK_WON)

**환경변수**: `ALIMTALK_TPL_FALLBACK_WON`
**대상**: 차순위 입찰자 (앱을 안 보고 있을 확률 높음 → 알림톡 필수)
**트리거**: `expire-contacts` Edge Function (원래 낙찰자 미연락 시)
**변수**: `#{clubName}`, `#{userName}`, `#{winningPrice}`, `#{contactDeadline}`, `#{auctionUrl}`
**버튼**: 웹링크 — "수락하기" → `#{auctionUrl}`

```
[NightFlow] 차순위 낙찰 제안

#{userName}님, #{clubName} 경매에서 #{winningPrice} 낙찰 기회가 생겼습니다.

수락 마감: #{contactDeadline}
지금 앱에서 수락하세요!
```

> 수락 제한시간: 15분. 미수락 시 패널티 없이 다음 차순위로 넘어감.

---

### 5. 얼리버드 당일 방문 리마인더 (EARLYBIRD_DDAY_REMINDER)

**환경변수**: `ALIMTALK_TPL_EARLYBIRD_DDAY_REMINDER`
**대상**: 얼리버드 낙찰자 (방문 당일)
**트리거**: `notify-earlybird-dday` Edge Function (Cron: 매일 오전 10시 KST)
**변수**: `#{clubName}`, `#{eventTime}`
**버튼**: 없음

```
[NightFlow] 오늘 방문 리마인더

오늘 #{eventTime} #{clubName} 방문 예정입니다.

즐거운 시간 되세요!
```

> `entry_time`이 없으면 `#{eventTime}` = "저녁"

---

## 마케팅성 알림 (수신 동의 필요)

### 6. 입찰 역전 알림 (OUTBID)

**환경변수**: `ALIMTALK_TPL_OUTBID`
**대상**: 역전당한 입찰자
**트리거**: 미구현 (인앱 알림만 동작 중)
**변수**: `#{clubName}`, `#{newBidAmount}`, `#{auctionUrl}`
**버튼**: 웹링크 — "다시 입찰하기" → `#{auctionUrl}`

```
[NightFlow] 입찰이 역전되었습니다

#{clubName} 경매에서 새로운 입찰이 들어왔습니다.
현재 최고가: #{newBidAmount}

다시 입찰하시려면 아래 버튼을 눌러주세요.
```

---

### 7. 경매 시작 알림 (AUCTION_STARTED)

**환경변수**: `ALIMTALK_TPL_AUCTION_STARTED`
**대상**: 관심 경매 구독자
**트리거**: 미구현
**변수**: `#{clubName}`, `#{auctionTitle}`, `#{auctionUrl}`
**버튼**: 웹링크 — "경매 참여하기" → `#{auctionUrl}`

```
[NightFlow] 경매가 시작되었습니다!

#{clubName}의 #{auctionTitle} 경매가 시작되었습니다.

지금 바로 입찰에 참여해보세요!
```

---

### 8. 내 지역 새 경매 알림 (NEW_AUCTION_IN_AREA)

**환경변수**: `ALIMTALK_TPL_NEW_AUCTION_IN_AREA`
**대상**: 지역 알림 구독자
**트리거**: 미구현
**변수**: `#{area}`, `#{clubName}`, `#{auctionTitle}`, `#{auctionUrl}`
**버튼**: 웹링크 — "경매 보기" → `#{auctionUrl}`

```
[NightFlow] 새 경매가 등록되었습니다

#{area} #{clubName}에서 #{auctionTitle} 경매가 시작됩니다.

지금 확인해보세요!
```

---

## MD 수신

### 9. MD 낙찰 안내 (MD_NEW_MATCH)

**환경변수**: `ALIMTALK_TPL_MD_NEW_MATCH`
**대상**: 경매 등록 MD
**트리거**: 미구현
**변수**: `#{clubName}`, `#{winningPrice}`, `#{auctionUrl}`
**버튼**: 웹링크 — "확인하기" → `#{auctionUrl}`

```
[NightFlow] 경매가 낙찰되었습니다

#{clubName} 경매가 #{winningPrice}에 낙찰되었습니다.
낙찰자가 곧 연락할 예정입니다.

대시보드에서 확인하세요.
```

---

## SOLAPI 등록 가이드

### 등록 순서 (우선순위)

| 순위 | 템플릿 | 구분 | 이유 |
|------|--------|------|------|
| 1 | AUCTION_WON | 거래성 | 핵심 플로우 |
| 2 | CONTACT_DEADLINE_WARNING | 거래성 | 노쇼 방지 |
| 3 | NOSHOW_BANNED | 거래성 | 유저 고지 의무 |
| 4 | FALLBACK_WON | 거래성 | 15분 제한 → 빠른 도달 필수 |
| 5 | EARLYBIRD_DDAY_REMINDER | 거래성 | 노쇼 방지 |
| 6 | MD_NEW_MATCH | 거래성 | MD 경험 |
| 7 | OUTBID | 마케팅 | 재참여 유도 |
| 8 | AUCTION_STARTED | 마케팅 | 구독자 알림 |
| 9 | NEW_AUCTION_IN_AREA | 마케팅 | 지역 알림 |

### SOLAPI 콘솔에서 등록 방법

1. [console.solapi.com](https://console.solapi.com) 로그인
2. 좌측 메뉴 → **알림톡** → **템플릿 관리**
3. **+ 새 템플릿** 클릭
4. 카카오톡 채널 선택 (PFID 확인)
5. 템플릿 코드: 자유 입력 (예: `nightflow_auction_won`)
6. 템플릿 내용: 위 ``` ``` 블록 내용 붙여넣기
7. 변수 `#{변수명}` 자동 인식 확인
8. **버튼 추가** (해당 템플릿만):
   - 버튼 타입: **웹링크**
   - 버튼명: 위에 명시된 텍스트
   - URL (Mobile): `#{auctionUrl}` 등
   - URL (PC): 동일
9. **검수 요청** 클릭

### 카카오 승인 후

1. 승인 상태 확인 (24-48시간 소요)
2. 승인된 템플릿의 **템플릿 ID** 복사
3. `.env.local`의 해당 `ALIMTALK_TPL_*` 변수에 붙여넣기
4. Supabase Edge Function secrets에도 동일하게 설정
5. 서버 재시작 (`npm run dev`)
6. 테스트 발송 확인

### 주의사항

- 변수명은 코드(`alimtalk.ts`)와 정확히 일치해야 함
- 버튼 URL에 변수 사용 시 `#{변수명}` 형태 그대로 입력
- 강조 표현(광고성 문구)은 카카오 정책상 거절 사유 → "지금 바로", "놓치지 마세요" 정도만 허용

### 환경변수 전체 목록

```env
# SOLAPI 인증
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER_NUMBER=
SOLAPI_PFID=

# 알림톡 템플릿 ID (카카오 승인 후 입력)
ALIMTALK_TPL_AUCTION_WON=
ALIMTALK_TPL_CONTACT_DEADLINE_WARNING=
ALIMTALK_TPL_NOSHOW_BANNED=
ALIMTALK_TPL_FALLBACK_WON=
ALIMTALK_TPL_EARLYBIRD_DDAY_REMINDER=
ALIMTALK_TPL_OUTBID=
ALIMTALK_TPL_AUCTION_STARTED=
ALIMTALK_TPL_NEW_AUCTION_IN_AREA=
ALIMTALK_TPL_MD_NEW_MATCH=
```
