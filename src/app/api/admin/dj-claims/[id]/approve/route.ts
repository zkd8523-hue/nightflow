import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { normalizeDjName } from "@/lib/lineups/djName";
import { logger } from "@/lib/utils/logger";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-");
  return base || `dj-${Date.now()}`;
}

// Admin: DJ 인증 신청 승인. dj_id가 있으면 기존 DJ에 소유자 연결, 없으면
// (신규 등록 요청) dj_aliases로 중복 확인 후 새 DJ를 만들거나 기존 DJ에 연결한다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: claimId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAdmin = createAdminClient();
    const { data: admin } = await supabaseAdmin.from("users").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") {
      return NextResponse.json({ error: "Admin 권한이 필요합니다." }, { status: 403 });
    }

    const { data: claim } = await supabaseAdmin
      .from("dj_claims")
      .select("id, status, dj_id, requested_name, claimed_instagram, claimant_id")
      .eq("id", claimId)
      .single();

    if (!claim || claim.status !== "pending") {
      return NextResponse.json({ error: "pending 상태의 신청만 승인할 수 있습니다." }, { status: 400 });
    }

    let targetDjId = claim.dj_id;

    if (targetDjId) {
      // 기존 DJ — 그 사이 다른 신청이 먼저 승인됐을 수 있다(선점 경쟁)
      const { data: dj } = await supabaseAdmin.from("djs").select("claimed_by_user_id").eq("id", targetDjId).single();
      if (dj?.claimed_by_user_id) {
        return NextResponse.json({ error: "이미 다른 계정이 인증한 프로필입니다." }, { status: 409 });
      }
      const { error: updateErr } = await supabaseAdmin
        .from("djs")
        .update({
          claimed_by_user_id: claim.claimant_id,
          claimed_at: new Date().toISOString(),
          instagram: claim.claimed_instagram,
        })
        .eq("id", targetDjId);
      if (updateErr) throw updateErr;
    } else {
      // 신규 등록 요청 — 같은 이름의 DJ가 이미 있는지 먼저 확인(중복 DJ 생성 방지)
      const displayName = (claim.requested_name || "").trim();
      if (!displayName) {
        return NextResponse.json({ error: "신청에 활동명이 없습니다." }, { status: 400 });
      }
      const normalized = normalizeDjName(displayName);
      const { data: existingAlias } = await supabaseAdmin
        .from("dj_aliases")
        .select("dj_id")
        .eq("normalized", normalized)
        .maybeSingle();

      if (existingAlias) {
        const { data: dj } = await supabaseAdmin.from("djs").select("claimed_by_user_id").eq("id", existingAlias.dj_id).single();
        if (dj?.claimed_by_user_id) {
          return NextResponse.json({ error: "이미 다른 계정이 인증한 프로필입니다." }, { status: 409 });
        }
        targetDjId = existingAlias.dj_id;
        const { error: updateErr } = await supabaseAdmin
          .from("djs")
          .update({
            claimed_by_user_id: claim.claimant_id,
            claimed_at: new Date().toISOString(),
            instagram: claim.claimed_instagram,
          })
          .eq("id", targetDjId);
        if (updateErr) throw updateErr;
      } else {
        const slug = slugify(displayName);
        const { data: newDj, error: djError } = await supabaseAdmin
          .from("djs")
          .insert({
            display_name: displayName,
            slug,
            instagram: claim.claimed_instagram,
            claimed_by_user_id: claim.claimant_id,
            claimed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (djError || !newDj) throw djError || new Error("DJ 생성 실패");
        targetDjId = newDj.id;

        await supabaseAdmin.from("dj_aliases").insert({ dj_id: targetDjId, alias: displayName, normalized }).select().maybeSingle();
      }
    }

    const { error: claimErr } = await supabaseAdmin
      .from("dj_claims")
      .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", claimId);
    if (claimErr) throw claimErr;

    // 같은 DJ를 가리키던 다른 pending 신청은 일괄 반려 — 안 하면 운영자 큐에 처리 불가 항목이 남는다
    if (targetDjId) {
      await supabaseAdmin
        .from("dj_claims")
        .update({ status: "rejected", reject_reason: "다른 신청이 먼저 승인되었습니다.", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("dj_id", targetDjId)
        .eq("status", "pending")
        .neq("id", claimId);
    }

    try {
      await supabaseAdmin.rpc("notify_user_push", {
        p_user_id: claim.claimant_id,
        p_title: "DJ 인증 완료",
        p_body: "프로필이 인증됐어요. 사진과 소개를 채워보세요.",
        p_data: { type: "dj_claim_approved" },
        p_url: "/dj/apply",
      });
    } catch (notifyErr) {
      logger.error("[Admin dj-claims approve] 알림 발송 실패:", notifyErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[Admin dj-claims approve] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
