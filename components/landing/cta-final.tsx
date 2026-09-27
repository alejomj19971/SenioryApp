import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="bg-primary py-16 text-primary-foreground sm:py-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Porque envejecer con dignidad no es un lujo, es un derecho.
        </h2>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          Empieza hoy a cuidar mejor, con la confianza que tu familia merece.
        </p>
        <Link
          href="/app"
          className={buttonVariants({
            size: "lg",
            variant: "secondary",
            className: "h-14 rounded-full px-8 text-lg",
          })}
        >
          Probar la app
        </Link>
      </div>
    </section>
  );
}
