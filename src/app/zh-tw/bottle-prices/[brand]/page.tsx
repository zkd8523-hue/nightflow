import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BottlePricePage, bottlePriceMetadata, BOTTLE_BRANDS, type BottleBrand } from "@/components/foreign/HighEndPages";

// 메뉴 가격이 바뀌면 1시간 내 반영. route segment 파일에만 유효.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return BOTTLE_BRANDS.map((brand) => ({ brand }));
}

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const { brand } = await params;
  if (!(BOTTLE_BRANDS as readonly string[]).includes(brand)) return {};
  return bottlePriceMetadata(brand as BottleBrand, "zh-tw");
}

export default async function Page({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  if (!(BOTTLE_BRANDS as readonly string[]).includes(brand)) notFound();
  return <BottlePricePage brand={brand as BottleBrand} lang="zh-tw" />;
}
