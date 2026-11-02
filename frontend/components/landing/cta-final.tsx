import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28">
      <Image
        src="/img/pareja-bw.jpg"
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        className="object-cover opacity-30 mix-blend-luminosity"
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-primary via-primary/95 to-primary/80"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Porque envejecer con dignidad no es un lujo, es un derecho.
        </h2>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          Empieza hoy a cuidar mejor, con la confianza que tu familia merece.
        </p>
        <Link
          href="/ingresar"
          className={buttonVariants({
            size: "lg",
            variant: "secondary",
            className: "h-14 rounded-full px-8 text-lg",
          })}
        >
          Ingresar
        </Link>
      </div>
    </section>
  );
}
