import * as React from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Un campo de formulario accesible (F1 §4.6): etiqueta visible (no depende del `placeholder`), ayuda y error
// enlazados con `aria-describedby`, y el error marcado con `aria-invalid`.

export interface CampoProps extends Omit<React.ComponentProps<"input">, "id" | "name"> {
  nombre: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  // Algo a la derecha del campo (por ejemplo, el botón de mostrar la contraseña).
  accion?: React.ReactNode;
  // Un ícono a la izquierda, puramente decorativo (la etiqueta ya dice de qué se trata).
  icono?: LucideIcon;
}

export function Campo({ nombre, etiqueta, error, ayuda, accion, icono: Icono, className, ...resto }: CampoProps) {
  const idDeAyuda = `${nombre}-ayuda`;
  const idDeError = `${nombre}-error`;
  const descripcion = [ayuda !== undefined ? idDeAyuda : null, error !== undefined ? idDeError : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={nombre}>{etiqueta}</Label>
      <div className="relative">
        {Icono !== undefined && (
          <Icono aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 my-auto size-5 text-muted-foreground" />
        )}
        <Input
          id={nombre}
          name={nombre}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={descripcion === "" ? undefined : descripcion}
          className={cn(Icono !== undefined && "pl-11", accion !== undefined && "pr-14", className)}
          {...resto}
        />
        {accion !== undefined && <div className="absolute inset-y-0 right-1 flex items-center">{accion}</div>}
      </div>
      {ayuda !== undefined && (
        <p id={idDeAyuda} className="text-sm text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error !== undefined && <MensajeDeCampo id={idDeError}>{error}</MensajeDeCampo>}
    </div>
  );
}

// El error de un campo: con ícono y texto (nunca solo color).
export function MensajeDeCampo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Una lista desplegable nativa con el estilo de los campos. Las de fecha de nacimiento son tres listas porque
// resultan más fáciles que el calendario del navegador para quien tiene poca experiencia digital.
export function Lista({
  nombre,
  etiqueta,
  opciones,
  valorInicial,
  placeholder,
  error,
  className,
}: {
  nombre: string;
  etiqueta: string;
  opciones: { valor: string; etiqueta: string }[];
  valorInicial?: string;
  placeholder: string;
  error?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={nombre}>{etiqueta}</Label>
      <select
        id={nombre}
        name={nombre}
        defaultValue={valorInicial ?? ""}
        aria-invalid={error === true ? true : undefined}
        className="h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-2 aria-invalid:border-destructive"
      >
        <option value="">{placeholder}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
