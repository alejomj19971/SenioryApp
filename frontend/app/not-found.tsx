import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-secondary/30 px-6 py-20 text-center">
      <Logo />
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass className="size-8" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          No encontramos esta página
        </h1>
        <p className="mt-2 max-w-sm text-base text-muted-foreground">
          Puede que el enlace esté mal escrito o que la página ya no exista.
          Vamos de vuelta a un lugar conocido.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={cn(buttonVariants({ size: "lg", className: "h-12 rounded-full px-6" }))}>
          Ir al inicio
        </Link>
        <Link
          href="/app"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-full px-6" }),
          )}
        >
          Ir a la app
        </Link>
      </div>
    </div>
  );
}
