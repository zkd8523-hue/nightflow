#!/usr/bin/env bash
# Migration 549/550 적용 후 뷰 값이 REST 실측과 일치하는지 대조.
# 사용법: bash scripts/verify_admin_stats_views.sh   (nightflow/ 에서 실행)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a
H=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "=== admin_coupon_overview ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admin_coupon_overview?select=*" "${H[@]}" | python3 -m json.tool
echo
echo "기대값(2026-08-25 실측): total_issues=9, total_claims=7, total_redeems=1, redeem_rate=14.3, zero_claim_issues=4"
echo
echo "=== admin_party_overview ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admin_party_overview?select=*" "${H[@]}" | python3 -m json.tool
echo
echo "기대값(2026-08-25 실측): total_parties=902, parties_with_joiner=11, join_rate=1.2,"
echo "                        matched_count=0, churn_rate=96.1, auto_published=549, clubs_covered=9"
echo
echo "=== admin_party_weekly (최근 6주) ==="
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admin_party_weekly?select=week_start,published,auto_published,with_joiner,join_rate&limit=6" "${H[@]}" | python3 -m json.tool
echo
echo "기대값: 2026-08-03 → published=798, auto_published=499, with_joiner=0"
