import Link from "next/link";
import { HeartHandshake, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Arriba del todo, no un enlace escondido al final: dos caminos muy distintos (familia que busca cuidado, cuidador
// que se postula) deben verse ANTES de escribir nada. Son enlaces reales (no pestañas con estado): cada uno es su
// propia página, así que funciona sin JavaScript y se puede compartir o recargar.
export function SelectorDeTipoDeCuenta({ comoCuidador }: { comoCuidador: boolean }) {
  return (
    <nav aria-label="Tipo de cuenta" className="grid grid-cols-2 gap-2">
      <Link href="/registro" aria-current={comoCuidador ? undefined : "page"} className={buttonVariants({ variant: comoCuidador ? "outline" : "default" })}>
        <Users aria-hidden="true" />
        Soy familia
      </Link>
      <Link href="/registro/cuidador" aria-current={comoCuidador ? "page" : undefined} className={buttonVariants({ variant: comoCuidador ? "default" : "outline" })}>
        <HeartHandshake aria-hidden="true" />
        Soy cuidador
      </Link>
    </nav>
  );
}
