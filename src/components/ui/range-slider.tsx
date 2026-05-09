"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface RangeSliderProps {
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  onValueCommit?: (value: [number, number]) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
}

export const RangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  RangeSliderProps
>(({ value, onValueChange, onValueCommit, min, max, step = 1, className }, ref) => {
  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      onValueChange={(v) => onValueChange([v[0], v[1]] as [number, number])}
      onValueCommit={(v) => onValueCommit?.([v[0], v[1]] as [number, number])}
      min={min}
      max={max}
      step={step}
      minStepsBetweenThumbs={1}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-neutral-800">
        <SliderPrimitive.Range className="absolute h-full bg-white" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-5 w-5 rounded-full bg-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50"
        aria-label="최소 가격"
      />
      <SliderPrimitive.Thumb
        className="block h-5 w-5 rounded-full bg-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50"
        aria-label="최대 가격"
      />
    </SliderPrimitive.Root>
  );
});

RangeSlider.displayName = "RangeSlider";
