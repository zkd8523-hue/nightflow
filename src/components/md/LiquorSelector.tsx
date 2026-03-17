"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Wine, Search, X, Plus } from "lucide-react";
import {
  LIQUOR_CATEGORIES,
  LIQUOR_BRANDS,
  BRAND_ALIASES,
  QUANTITY_OPTIONS,
  type LiquorCategoryKey,
} from "@/lib/constants/liquor";

interface LiquorSelectorProps {
  selected: string[];
  onSelect: (items: string[]) => void;
  disabled?: boolean;
}

export function LiquorSelector({ selected, onSelect, disabled }: LiquorSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<LiquorCategoryKey | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customQty, setCustomQty] = useState(1);

  // 검색 결과 필터링
  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // 카테고리별 또는 전체 브랜드
    let brands: { brand: string; category: string }[] = [];

    if (activeCategory) {
      brands = (LIQUOR_BRANDS[activeCategory] || []).map((b) => ({
        brand: b,
        category: activeCategory,
      }));
    } else {
      // 전체 카테고리에서 검색
      for (const [cat, list] of Object.entries(LIQUOR_BRANDS)) {
        brands.push(...list.map((b) => ({ brand: b, category: cat })));
      }
    }

    if (!query) return brands;

    // 영문 검색: alias에서 한글 브랜드 찾기
    const aliasMatches = Object.entries(BRAND_ALIASES)
      .filter(([en]) => en.includes(query))
      .map(([, kr]) => kr);

    return brands.filter(
      ({ brand }) =>
        brand.toLowerCase().includes(query) ||
        aliasMatches.some((alias) => brand.includes(alias))
    );
  }, [activeCategory, searchQuery]);

  // 이미 선택된 브랜드 (중복 방지)
  const selectedBrandSet = new Set(selected);

  const addLiquor = (brand: string, qty: number) => {
    const item = `${brand} ${qty}병`;
    if (!selectedBrandSet.has(item)) {
      onSelect([...selected, item]);
    }
  };

  const removeLiquor = (item: string) => {
    onSelect(selected.filter((s) => s !== item));
  };

  const handleCustomAdd = () => {
    const brand = customBrand.trim();
    if (!brand) return;

    // "브랜드명 N병" 패턴이 이미 포함되어 있으면 그대로 추가
    const match = brand.match(/^(.+)\s+(\d+)병$/);
    if (match) {
      if (!selectedBrandSet.has(brand)) {
        onSelect([...selected, brand]);
      }
    } else {
      addLiquor(brand, customQty);
    }

    setCustomBrand("");
    setCustomQty(1);
  };

  return (
    <section className={`space-y-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 text-white font-bold mb-2">
        <Wine className="w-4 h-4 text-purple-500" />
        <span>주류 선택</span>
      </div>

      <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
        {/* 카테고리 버튼 */}
        <div className="flex flex-wrap gap-2">
          {LIQUOR_CATEGORIES.map(({ key, label, emoji }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveCategory(activeCategory === key ? null : key);
                setSearchQuery("");
              }}
              className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                activeCategory === key
                  ? "bg-white text-black"
                  : "bg-neutral-900 text-neutral-500 border border-neutral-800"
              }`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* 검색 입력 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeCategory
                ? `${LIQUOR_CATEGORIES.find((c) => c.key === activeCategory)?.label} 브랜드 검색...`
                : "브랜드 검색 (한글/영어)..."
            }
            className="bg-neutral-900 border-neutral-800 h-11 pl-10 text-white placeholder:text-neutral-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 검색 결과 */}
        {(searchQuery || activeCategory) && (
          <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
            {filteredBrands.length === 0 ? (
              <p className="text-neutral-500 text-xs text-center py-4">
                검색 결과가 없습니다. 아래에서 직접 입력해주세요.
              </p>
            ) : (
              filteredBrands.map(({ brand }) => (
                <div
                  key={brand}
                  className="flex items-center justify-between bg-neutral-900/50 rounded-lg px-3 py-2"
                >
                  <span className="text-white text-[13px] font-medium truncate mr-2">
                    {brand}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {QUANTITY_OPTIONS.slice(0, 3).map((qty) => {
                      const item = `${brand} ${qty}병`;
                      const isSelected = selectedBrandSet.has(item);
                      return (
                        <button
                          key={qty}
                          type="button"
                          onClick={() =>
                            isSelected ? removeLiquor(item) : addLiquor(brand, qty)
                          }
                          className={`w-8 h-8 rounded-md text-[11px] font-bold transition-all ${
                            isSelected
                              ? "bg-purple-500 text-white"
                              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                          }`}
                        >
                          {qty}
                        </button>
                      );
                    })}
                    {/* 더 많은 수량 */}
                    <select
                      onChange={(e) => {
                        const qty = parseInt(e.target.value);
                        if (qty > 0) addLiquor(brand, qty);
                        e.target.value = "";
                      }}
                      className="w-8 h-8 bg-neutral-800 text-neutral-400 rounded-md text-[10px] text-center appearance-none cursor-pointer hover:bg-neutral-700"
                      defaultValue=""
                    >
                      <option value="" disabled>+</option>
                      {QUANTITY_OPTIONS.slice(3).map((qty) => (
                        <option key={qty} value={qty}>{qty}병</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 직접 입력 */}
        <div className="pt-3 border-t border-neutral-800/50 space-y-2">
          <p className="text-neutral-500 text-[10px] font-bold">
            목록에 없으면 직접 입력
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={customBrand}
              onChange={(e) => setCustomBrand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCustomAdd();
                }
              }}
              placeholder="브랜드명"
              className="bg-neutral-900 border-neutral-800 h-9 text-white text-[12px] flex-1"
            />
            <select
              value={customQty}
              onChange={(e) => setCustomQty(parseInt(e.target.value))}
              className="w-16 h-9 bg-neutral-900 border border-neutral-800 rounded-md text-white text-[12px] text-center appearance-none cursor-pointer"
            >
              {QUANTITY_OPTIONS.map((qty) => (
                <option key={qty} value={qty}>{qty}병</option>
              ))}
            </select>
            <Button
              type="button"
              onClick={handleCustomAdd}
              disabled={!customBrand.trim()}
              className="h-9 px-3 bg-neutral-800 hover:bg-neutral-700 text-white"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 선택된 주류 */}
        {selected.length > 0 && (
          <div className="pt-3 border-t border-neutral-800/50 space-y-2">
            <p className="text-purple-400 text-[10px] font-bold">
              선택된 주류 ({selected.length}개)
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-500/20 text-purple-300 rounded-lg text-[11px] font-bold"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeLiquor(item)}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
