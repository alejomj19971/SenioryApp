import { HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <HeartHandshake className="size-5" aria-hidden="true" />
      </span>
      {!iconOnly && (
        <span className="text-xl font-bold tracking-tight text-foreground">
          Seniory
        </span>
      )}
    </span>
  );
}
