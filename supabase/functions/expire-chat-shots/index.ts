// Deno Edge Function: 만료된 SHOT 정리
// Cron: 매 30분 (*/30 * * * *)
//
// - chat_shots.expires_at < now()인 row를 hard delete
// - chat-media 스토리지의 해당 파일도 같이 정리 (디스크 누적 방지)
// - chat_shot_likes는 ON DELETE CASCADE로 자동 정리됨
// - chat_shot_reports도 CASCADE로 정리

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  try {
    // 1) 만료된 SHOT 조회 (media_url 정리용)
    const { data: expired, error: selectError } = await supabase
      .from("chat_shots")
      .select("id, media_url")
      .lt("expires_at", new Date().toISOString())
      .limit(500);

    if (selectError) {
      console.error("[expire-chat-shots] select error", selectError);
      return new Response(
        JSON.stringify({ ok: false, error: selectError.message }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, deleted: 0, duration_ms: Date.now() - startedAt }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // 2) chat-media 스토리지에서 파일 path 추출 후 삭제
    // public URL 형식: https://<project>.supabase.co/storage/v1/object/public/chat-media/<userId>/<filename>
    const storagePaths: string[] = [];
    for (const shot of expired) {
      try {
        const url = new URL(shot.media_url);
        const marker = "/storage/v1/object/public/chat-media/";
        const idx = url.pathname.indexOf(marker);
        if (idx !== -1) {
          const path = url.pathname.slice(idx + marker.length);
          if (path) storagePaths.push(path);
        }
      } catch {
        /* URL 파싱 실패 시 무시 — DB row만 정리 */
      }
    }

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("chat-media")
        .remove(storagePaths);
      if (storageError) {
        // 스토리지 삭제 실패해도 DB row는 계속 정리 (orphan file로 남는 게 누적보단 나음)
        console.warn("[expire-chat-shots] storage remove error", storageError.message);
      }
    }

    // 3) DB row 삭제 (CASCADE로 likes/reports 같이 정리)
    const ids = expired.map((s) => s.id);
    const { error: deleteError } = await supabase
      .from("chat_shots")
      .delete()
      .in("id", ids);

    if (deleteError) {
      console.error("[expire-chat-shots] delete error", deleteError);
      return new Response(
        JSON.stringify({ ok: false, error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[expire-chat-shots] deleted=${ids.length} files=${storagePaths.length} duration=${Date.now() - startedAt}ms`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        deleted: ids.length,
        storage_files_removed: storagePaths.length,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[expire-chat-shots] unexpected error", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  }
});
