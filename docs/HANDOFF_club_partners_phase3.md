# 대화 이어가기: club_partners Phase 3 진행 현황

**작성일**: 2026-05-16
**작성자**: Claude Opus 4.7 → Sonnet 4.6 → Opus 4.7
**상태**: Phase 1 완료 ✅ / Phase 3 코드 + Migration 작성 완료 ✅ (배포 대기)
**마이그레이션 번호 변경**: Phase 3 = **177** (원래 175 예정이었으나 175/176이 다른 작업으로 선점됨)

---

## 📌 현재 컨텍스트 한 줄 요약

`clubs.md_id`(단일 MD) 구조를 `club_partners` 조인 테이블(N:N)로 전환하는 작업. **Phase 1(DB 백필) 완료, 푸시됨. Phase 3(코드+RLS 전환) 시작 직전에 빌드 에러 발생으로 중단.**

---

## ✅ Phase 1 (완료 + 푸시)

**커밋**: `85b868b feat(db): club_partners 조인 테이블 도입 (Phase 1)`

**적용된 SQL** (Supabase 콘솔에서 실행 완료):
- `supabase/migrations/174_club_partners_phase1.sql`
- `club_partners (id, club_id, md_id, role, joined_at, ...)` 테이블 생성
- 28개 active 클럽 백필 완료
- `AFTER INSERT` 트리거 `after_club_insert_sync_partner` 활성화 (Phase 1↔3 갭 방어)

**검증 통과**:
- (1) active MD인데 club_partners 0인 사람 = 0건
- (2) clubs.md_id ↔ club_partners 불일치 = 0건
- (3) clubs_count(28) = partners_count(28)

`clubs.md_id` 컬럼은 그대로 유지 (Phase 3 코드 전환 전까지 양립).

---

## 🚨 미해결: 빌드 에러

마지막 사용자 메시지에서 "빌드에러났어"라고 보고됨. 에러 원인 미확인 상태로 작업 중단.

**조사 시작점**:
- `npx tsc --noEmit` 실행 → 출력 없음 (성공으로 추정, 단 확실치 않음)
- `npm run build` 백그라운드 실행 → 결과 미확인

**의심 후보 (최근 변경 사항 기준)**:
1. **`age_pref: AgePref[]` 타입 변경** ([types/database.ts:561](nightflow/src/types/database.ts#L561))
   - PuzzleCard/PuzzleDetailClient는 배열 처리로 수정됨
   - 다른 곳에서 `puzzle.age_pref` 단일값으로 쓰는 곳이 남아있을 가능성
2. **PuzzleList/AuctionList 수정** — TypeScript 에러 없을 거라 hint만 떴었음
3. **clubs/page.tsx VISIBLE_CLUB_IDS 제거** — Gemini 확인 결과 코드 자체엔 문제 없음
4. **PuzzleForm.tsx age_pref toggle 로직** — 타입 변경 영향

**디버그 명령**:
```bash
cd "/Users/gimmingi/project 1/nightflow"
npm run build 2>&1 | tee /tmp/build.log
# 또는
npx tsc --noEmit 2>&1
```

Vercel 빌드 로그도 확인 필요 (실제 에러 메시지 보면 빠르게 해결).

---

## ✅ Phase 3 코드 작업 완료 (배포 전)

**플랜 문서**: `/Users/gimmingi/.claude/plans/parsed-riding-hammock.md`

### 작성 완료 파일
- `supabase/migrations/178_club_partners_rls.sql` ✅
- `src/types/database.ts` — `ClubPartner` 타입 + `Club.partners` 옵셔널 추가 ✅
- 코드 11개 파일 수정 완료 ✅ (아래 목록)

### 배포 절차 (남은 작업)
1. Supabase SQL Editor 에서 `178_club_partners_rls.sql` 실행
2. 검증 쿼리 실행 (마이그레이션 파일 하단 주석 참조)
3. 코드 푸시 + Vercel 배포 — **단, 빌드 에러 다른 채팅에서 해결되어야 함**
4. 동작 검증: MD 클럽 목록 / 새 클럽 신청 / 경매 등록 / Admin 클럽 관리

---

### Phase 3 작업 범위 (참고용, 완료됨)

#### A. Migration 178 신규 (RLS + RPC + 트리거)
파일: `supabase/migrations/178_club_partners_rls.sql`

**변경 대상 (이미 분석 완료)**:

1. **`check_club_limit()` 트리거 함수** (현재: Migration 144)
```sql
-- 현재 (Migration 144)
SELECT COUNT(*) FROM clubs WHERE md_id = NEW.md_id AND deleted_at IS NULL

-- 변경 후
SELECT COUNT(*) FROM club_partners cp
JOIN clubs c ON c.id = cp.club_id
WHERE cp.md_id = NEW.md_id AND c.deleted_at IS NULL
```

2. **`set_default_club()` RPC** (현재: Migration 012)
```sql
-- 현재
SELECT EXISTS(SELECT 1 FROM clubs WHERE id = p_club_id AND md_id = v_user_id)

-- 변경 후
SELECT EXISTS(SELECT 1 FROM club_partners WHERE club_id = p_club_id AND md_id = v_user_id)
```

3. **`merge_clubs()` RPC** (현재: Migration 145)
   - club_partners INSERT ON CONFLICT + DELETE 패턴 추가 (Gemini 지적 #2)
   - 추가 FK 테이블(user_favorite_clubs 등) 처리

4. **RLS 정책 추가** (기존 md_id 정책과 병행):
```sql
-- MD UPDATE (club_partners 기반)
CREATE POLICY "MD via club_partners can update own clubs" ON clubs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM club_partners cp
    WHERE cp.club_id = clubs.id AND cp.md_id = auth.uid()
  ));
```
기존 `auth.uid() = md_id` 정책은 **유지** (양립 모드).

#### B. TypeScript 코드 11개 파일 수정

**쿼리 패턴 변환**:
```typescript
// Before
.from("clubs").select("*").eq("md_id", user.id).is("deleted_at", null)

// After (옵션 1: clubs를 base로)
.from("clubs")
  .select("*, club_partners!inner(md_id)")
  .eq("club_partners.md_id", user.id)
  .is("deleted_at", null)

// After (옵션 2: club_partners를 base로)
.from("club_partners")
  .select("club:clubs!inner(*)")
  .eq("md_id", user.id)
  .eq("clubs.deleted_at", null)
```

**수정 대상 파일 (이미 grep으로 확인된 라인)**:

| 파일 | 라인 | 패턴 |
|------|------|------|
| [src/types/database.ts](nightflow/src/types/database.ts) | - | `ClubPartner` 인터페이스 추가, `Club.md_id` deprecated 주석 |
| [src/app/(dashboard)/admin/clubs/page.tsx](nightflow/src/app/(dashboard)/admin/clubs/page.tsx) | 27, 49-55 | `md:users!clubs_md_id_fkey` 조인, `club.md_id` 참조 |
| [src/app/(dashboard)/admin/mds/page.tsx](nightflow/src/app/(dashboard)/admin/mds/page.tsx) | 26 | `owned_clubs:clubs!md_id(*)` |
| [src/app/(dashboard)/admin/mds/[id]/page.tsx](nightflow/src/app/(dashboard)/admin/mds/%5Bid%5D/page.tsx) | 67 (ownedClubs) | `.eq("md_id", id).is("deleted_at", null)` ← **이것만 clubs 관련**. 다른 4곳(63,70,86,94,106)은 md_sanctions/auctions/puzzle_offers/md_health_scores라 안 건드림 |
| [src/app/(dashboard)/md/clubs/page.tsx](nightflow/src/app/(dashboard)/md/clubs/page.tsx) | 28-33 | `.eq("md_id", user.id).is("deleted_at", null)` |
| [src/app/(dashboard)/md/auctions/new/page.tsx](nightflow/src/app/(dashboard)/md/auctions/new/page.tsx) | 53-58 | `.eq("md_id", user.id).is("deleted_at", null)` |
| [src/app/(dashboard)/md/auctions/[id]/edit/page.tsx](nightflow/src/app/(dashboard)/md/auctions/%5Bid%5D/edit/page.tsx) | 48 | `.eq("md_id", auction.md_id)` |
| [src/app/api/md/apply/route.ts](nightflow/src/app/api/md/apply/route.ts) | 148-153 | `.eq("md_id", user.id).is("deleted_at", null)` — INSERT 시 club_partners 자동 동기화는 트리거가 처리 |
| [src/app/api/md/clubs/update-image/route.ts](nightflow/src/app/api/md/clubs/update-image/route.ts) | 64, 76 | `club.md_id !== user.id` 권한 검증 → club_partners 기반 |
| [src/components/admin/MDManagement.tsx](nightflow/src/components/admin/MDManagement.tsx) | 64 부근 | clubsMap 구성 |
| [src/components/puzzles/OfferSheet.tsx](nightflow/src/components/puzzles/OfferSheet.tsx) | 82-83 | `.eq("md_id", user.id)` |

#### C. 배포 절차
1. SQL Editor에서 175 마이그레이션 실행
2. 검증 쿼리 (Phase 3 검증 — 추후 작성)
3. 코드 푸시 후 Vercel 배포
4. 로컬 + 프로덕션에서 MD 클럽 목록 동작 확인

---

## 🔜 Phase 2 (후속, Phase 3 안정화 후)

플랜 파일 참조. 같은 (name, area) 중복 클럽 머지.
- Migration 176 (혹은 적절한 번호)
- INSERT ON CONFLICT + DELETE 패턴
- FK 전수 조사 (information_schema) → user_favorite_clubs, auction_templates 등 누락 방지
- 사전 Supabase Database Snapshot 필수

---

## 📝 작업 재개 체크리스트

대화 새로 시작하면:

1. **이 문서 읽기**: `docs/HANDOFF_club_partners_phase3.md`
2. **플랜 파일 읽기**: `/Users/gimmingi/.claude/plans/parsed-riding-hammock.md`
3. **빌드 에러 먼저 해결**:
   - `npm run build` 실행 후 에러 메시지 확인
   - 또는 Vercel 빌드 로그 확인
   - 최근 변경(age_pref array, PuzzleForm, PuzzleList 등) 검토
4. **Phase 3 시작**: Migration 175 작성 → 코드 11개 파일 수정 → 푸시 → 배포

---

## 🗂 관련 파일 정리

**완료된 작업**
- `supabase/migrations/174_club_partners_phase1.sql` (배포됨)

**미작성 예정 파일**
- `supabase/migrations/178_club_partners_rls.sql` (Phase 3)
- `supabase/migrations/176_club_dedupe_phase2.sql` (Phase 2)

**플랜 문서**
- `/Users/gimmingi/.claude/plans/parsed-riding-hammock.md` — 전체 3-Phase 마스터플랜

---

## 💡 협업 참고

- **Claude / Gemini 협업**: 마이그레이션 순서, 트리거 패턴 등 핵심 설계는 Gemini 검토 반영됨
- **사용자 결정사항**: Phase 1 → Phase 3 → Phase 2 순서 확정, 양립 모드 채택
- **메모리 참조**: `feedback_plan_only_default.md` — 명시적 "구현해" 지시 전엔 코드 수정 X
