import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function SetupAdminPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // 현재 유저 정보
  const { data: currentUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  // 이미 Admin이면 Admin 페이지로
  if (currentUser?.role === "admin") {
    redirect("/admin");
  }

  // 기존 Admin 확인
  const { count: adminCount } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");

  async function makeAdmin() {
    "use server";
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) return;

    await supabase
      .from("users")
      .update({ role: "admin" })
      .eq("id", authUser.id);

    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🛠️</div>
          <h1 className="text-3xl font-black text-foreground mb-2">Admin 설정</h1>
          <p className="text-muted-foreground">
            {adminCount && adminCount > 0
              ? "⚠️ 이미 Admin 계정이 존재합니다"
              : "버튼을 눌러 Admin이 되세요"}
          </p>
        </div>

        <div className="bg-background border border-border rounded-xl p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-2">현재 로그인:</p>
          <p className="font-bold text-foreground">{currentUser?.name || "알 수 없음"}</p>
          <p className="text-sm text-muted-foreground">{authUser.email || currentUser?.phone}</p>
          <p className="text-xs text-muted-foreground mt-2">현재 권한: {currentUser?.role || "user"}</p>
        </div>

        {adminCount && adminCount > 0 && (
          <p className="text-sm text-brand-amber mb-4 text-center">
            기존 Admin 계정이 {adminCount}개 존재합니다.
            아래 버튼을 누르면 이 계정도 Admin이 됩니다.
          </p>
        )}

        <form action={makeAdmin}>
          <Button
            type="submit"
            className="w-full bg-inverse text-inverse-foreground font-black rounded-full hover:opacity-90 transition-colors"
          >
            나를 Admin으로 만들기
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-4">
            ⚠️ 개발 환경 전용 기능입니다
          </p>
        </form>
      </div>
    </div>
  );
}
