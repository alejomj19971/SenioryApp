import Image from "next/image";
import { ShieldCheck } from "lucide-react";

// El lado derecho de las pantallas de cuenta en escritorio (`lg:` en adelante). Sin esto, la tarjeta angosta
// (pensada para celular) deja mucho espacio vacío en una pantalla ancha. Una foto a sangre con el mensaje abajo
// (mini-landing) en vez de un bloque centrado: así se usa TODO el alto del panel, no solo el medio.
//
// A diferencia de los adornos puramente decorativos (manchas de color), la foto y el degradado NO se apagan en
// modo alto contraste: son lo que hace legible el texto encima, y blanco sobre casi negro ya es, de por sí, alto
// contraste. Apagarlos dejaría el texto blanco flotando sobre el fondo claro del panel, ilegible.
//
// Puramente de marca: nada interactivo, así que no afecta el orden de tabulación ni lo que lee un lector de pantalla.
export function PanelDeMarca() {
  return (
    <div className="relative hidden overflow-hidden bg-secondary lg:block lg:w-[70%]">
      <Image src="/img/dona-carmen.jpg" alt="" aria-hidden="true" fill sizes="(min-width: 1024px) 70vw, 100vw" priority className="object-cover" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
      <div aria-hidden="true" className="relative z-10 flex h-full flex-col justify-end gap-5 p-10 text-center xl:p-12">
        <span className="mx-auto rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-primary">Creciendo y cuidando juntos</span>
        <h2 className="font-serif text-2xl font-bold leading-tight text-white">
          Dejar solos a tus padres todo el día no debería darte tanta angustia.
        </h2>
        <p className="text-base text-white/90">Seniory conecta a tu familia con cuidadores verificados por horas, con teleasistencia incluida.</p>
        <div className="mx-auto flex items-center gap-2 text-sm font-medium text-white/90">
          <ShieldCheck className="size-5 shrink-0 text-white" aria-hidden="true" />
          Antecedentes, títulos y prueba psicotécnica verificados.
        </div>
      </div>
    </div>
  );
}
