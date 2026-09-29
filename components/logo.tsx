import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icon.png"
        alt=""
        className="size-10 shrink-0 object-contain"
      />
      {!iconOnly && (
        <span className="text-xl font-bold tracking-tight text-foreground">
          Seniory
        </span>
      )}
    </span>
  );
}
