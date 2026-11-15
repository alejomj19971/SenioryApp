import { ShieldCheck } from "lucide-react";

// El lado derecho de las pantallas de cuenta en escritorio (`lg:` en adelante). Sin esto, la tarjeta angosta
// (pensada para celular) deja mucho espacio vacío en una pantalla ancha. Puramente de marca: nada interactivo,
// así que no afecta el orden de tabulación ni lo que lee un lector de pantalla.
export function PanelDeMarca() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-secondary/70 via-background to-accent/10 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:px-12 xl:px-20">
      <div aria-hidden="true" className="adorno-panel-de-marca pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden="true" className="adorno-panel-de-marca pointer-events-none absolute -bottom-32 -left-16 size-[24rem] rounded-full bg-success/15 blur-3xl" />
      <div aria-hidden="true" className="relative z-10 flex max-w-md flex-col gap-5 text-center">
        <span className="mx-auto rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">Creciendo y cuidando juntos</span>
        <h2 className="font-serif text-3xl font-bold leading-tight text-foreground">
          Dejar solos a tus padres todo el día no debería darte tanta angustia.
        </h2>
        <p className="text-lg text-muted-foreground">Seniory conecta a tu familia con cuidadores verificados por horas, con teleasistencia incluida.</p>
        <div className="mx-auto flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
          Antecedentes, títulos y prueba psicotécnica verificados.
        </div>
      </div>
    </div>
  );
}
