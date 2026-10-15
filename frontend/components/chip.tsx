"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChipProps {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ activo, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50",
        className,
      )}
    >
      {children}
    </button>
  );
}
