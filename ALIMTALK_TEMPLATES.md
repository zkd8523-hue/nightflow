# NightFlow 카카오 알림톡 템플릿 (SOLAPI 등록용)

> **Model B 반영**: 결제 중개 없음. 낙찰 후 MD에게 직접 연락하는 플로우.
>
> **등록 방법**: SOLAPI 콘솔 → 알림톡 템플릿 → 신규 등록 → 카카오톡 채널 선택 → 내용 붙여넣기 → 검수 요청
>
> **승인 후**: SOLAPI 대시보드에서 템플릿 ID 복사 → `.env.local`의 해당 `ALIMTALK_TPL_*` 변수에 입력

---

## 1. 경매 시작 알림 (AUCTION_STARTED)

**환경변수**: `ALIMTALK_TPL_AUCTION_STARTED`
**변수**: `#{clubName}`, `#{auctionTitle}`, `#{auctionUrl}`
**버튼**: 웹링크 — "경매 참여하기" → `#{auctionUrl}`
**동의 필요**: YES (마케팅성)

```
[NightFlow] 경매가 시작되었습니다!

#{clubName}의 #{auctionTitle} 경매가 시작되었습니다.

지금 바로 입찰에 참여해보세요!
```

---

## 2. 입찰 역전 알림 (OUTBID)

**환경변수**: `ALIMTALK_TPL_OUTBID`
**변수**: `#{clubName}`, `#{newBidAmount}`, `#{auctionUrl}`
**버튼**: 웹링크 — "다시 입찰하기" → `#{auctionUrl}`
**동의 필요**: YES (마케팅성)

```
[NightFlow] 입찰이 역전되었습니다

#{clubName} 경매에서 새로운 입찰이 들어왔습니다.
현재 최고가: #{newBidAmount}

다시 입찰하시려면 아래 버튼을 눌러주세요.
```

---

## 3. 낙찰 알림 (AUCTION_WON)

**환경변수**: `ALIMTALK_TPL_AUCTION_WON`
**변수**: `#{clubName}`, `#{winningPrice}`, `#{contactDeadline}`, `#{auctionUrl}`
**버튼**: 웹링크 — "MD에게 연락하기" → `#{auctionUrl}`
**동의 필요**: NO (거래 관련 정보)

```
[NightFlow] 축하합니다! 낙찰되었습니다

#{clubName} 경매에서 #{winningPrice}에 낙찰되었습니다.

연락 마감: #{contactDeadline}
※ 마감 시간 내 MD에게 연락하지 않으면 노쇼 스트라이크가 부과됩니다.
```

---

## 4. 연락 마감 경고 (CONTACT_DEADLINE_WARNING) — 신규

**환경변수**: `ALIMTALK_TPL_CONTACT_DEADLINE_WARNING`
**변수**: `#{clubName}`, `#{remainingMinutes}`, `#{auctionUrl}`
**버튼**: 웹링크 — "지금 연락하기" → `#{auctionUrl}`
**동의 필요**: NO (거래 관련 정보)

```
[NightFlow] 연락 마감이 임박합니다!

#{clubName} 경매 낙찰 연락 마감까지 #{remainingMinutes}분 남았습니다.

지금 바로 MD에게 연락하여 예약을 확정하세요.
※ 미연락 시 노쇼 스트라이크가 부과됩니다.
```

---

## 5. 노쇼 알림 (NOSHOW_BANNED) — 신규

**환경변수**: `ALIMTALK_TPL_NOSHOW_BANNED`
**변수**: `#{userName}`, `#{strikeCount}`, `#{penaltyStatus}`
**버튼**: 없음
**동의 필요**: NO (거래 관련 정보)

```
[NightFlow] 노쇼 알림

#{userName}님, 낙찰 후 연락 시간이 만료되어 노쇼 스트라이크가 부과되었습니다.

현재 스트라이크: #{strikeCount}회
#{penaltyStatus}

자세한 내용은 고객센터로 문의해주세요.
```

---

## 6. 차순위 낙찰 알림 (FALLBACK_WON) — 신규

**환경변수**: `ALIMTALK_TPL_FALLBACK_WON`
**변수**: `#{clubName}`, `#{userName}`, `#{winningPrice}`, `#{contactDeadline}`, `#{auctionUrl}`
**버튼**: 웹링크 — "MD에게 연락하기" → `#{auctionUrl}`
**동의 필요**: NO (거래 관련 정보)

```
[NightFlow] 차순위 낙찰 안내

#{clubName} 경매에서 #{userName}님에게 #{winningPrice}에 낙찰되었습니다.

연락 마감: #{contactDeadline}
지금 바로 MD에게 연락하세요!
```

---

## 7. 마감 임박 알림 (CLOSING_SOON)

**환경변수**: `ALIMTALK_TPL_CLOSING_SOON`
**변수**: `#{clubName}`, `#{currentBid}`, `#{auctionUrl}`, `#{remainingTime}`
**버튼**: 웹링크 — "입찰하기" → `#{auctionUrl}`
**동의 필요**: YES (마케팅성)

```
[NightFlow] 경매가 곧 마감됩니다!

#{clubName} 경매 마감까지 #{remainingTime} 남았습니다.
현재 최고가: #{currentBid}

마지막 입찰 기회를 놓치지 마세요!
```

---

## 8. 방문 확인 알림 (VISIT_CONFIRMED)

**환경변수**: `ALIMTALK_TPL_VISIT_CONFIRMED`
**변수**: `#{clubName}`, `#{eventDate}`
**버튼**: 없음
**동의 필요**: NO (거래 관련 정보)

```
[NightFlow] 방문이 확인되었습니다

#{clubName} #{eventDate} 방문이 확인되었습니다.

이용해주셔서 감사합니다.
다음에도 NightFlow에서 만나요!
```

---

## 등록 순서 가이드

### SOLAPI 콘솔에서 등록

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

### 등록 우선순위

1. **AUCTION_WON** (낙찰) — 핵심 플로우
2. **CONTACT_DEADLINE_WARNING** (연락 마감 경고) — 노쇼 방지
3. **NOSHOW_BANNED** (노쇼 알림) — 유저 고지
4. **FALLBACK_WON** (차순위 낙찰) — 유저 전환
5. **OUTBID** (입찰 역전) — 재참여 유도
6. **AUCTION_STARTED** (경매 시작) — 구독자 알림
7. **CLOSING_SOON** (마감 임박) — 참여 유도
8. **VISIT_CONFIRMED** (방문 확인) — 만족도 증대

### 환경변수 전체 목록

```env
# SOLAPI 인증
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER_NUMBER=
SOLAPI_PFID=

# 알림톡 템플릿 ID (카카오 승인 후 입력)
ALIMTALK_TPL_AUCTION_STARTED=
ALIMTALK_TPL_OUTBID=
ALIMTALK_TPL_AUCTION_WON=
ALIMTALK_TPL_CONTACT_DEADLINE_WARNING=
ALIMTALK_TPL_NOSHOW_BANNED=
ALIMTALK_TPL_FALLBACK_WON=
ALIMTALK_TPL_CLOSING_SOON=
ALIMTALK_TPL_VISIT_CONFIRMED=
```
