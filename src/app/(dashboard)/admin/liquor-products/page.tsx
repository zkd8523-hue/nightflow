import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AdminLiquorProductsList } from "@/components/admin/AdminLiquorProductsList";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { LiquorProduct } from "@/types/database";

export default async function AdminLiquorProductsPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", authUser.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data: products } = await supabase
    .from("liquor_products")
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .returns<LiquorProduct[]>();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <h1 className="text-xl font-black text-foreground flex-1">주류 정보 관리</h1>
      </div>
      <AdminLiquorProductsList initialProducts={products || []} />
    </div>
  );
}
