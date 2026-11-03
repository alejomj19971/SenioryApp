import { TarjetaDeHojaDeVida, TarjetaDeVerificacion } from "@/components/admin/tarjeta-de-verificacion";
import { etiquetaEspecialidad, formatearFechaHora } from "@/lib/format";
import type { GrupoDeRevision } from "@/lib/agrupar-revision";

// Todo lo de un cuidador en un solo lugar: sus controles pendientes (o decididos) y su hoja de vida, si tiene. Antes
// cada uno era una tarjeta aparte con su propio nombre arriba; ahora el nombre se ve una sola vez.
export function TarjetaDePersona({ grupo }: { grupo: GrupoDeRevision }) {
  const cantidad = grupo.controles.length + (grupo.hoja !== null ? 1 : 0);
  const detalle = [grupo.zona, grupo.especialidad !== null ? etiquetaEspecialidad(grupo.especialidad) : null].filter((valor): valor is string => valor !== null).join(" · ");
  const idDelTitulo = `persona-${grupo.cuidadorId}`;

  return (
    <li aria-labelledby={idDelTitulo} className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2 px-1">
        <div>
          <h3 id={idDelTitulo} className="text-lg font-semibold text-foreground">{grupo.nombre}</h3>
          <p className="text-sm text-muted-foreground">
            {detalle !== "" ? `${detalle} · ` : ""}
            pide desde el {formatearFechaHora(grupo.masAntigua)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
          {cantidad} {cantidad === 1 ? "solicitud" : "solicitudes"}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {grupo.controles.map((verificacion) => (
          <TarjetaDeVerificacion key={verificacion.id} verificacion={verificacion} mostrarCuidador={false} />
        ))}
        {grupo.hoja !== null && <TarjetaDeHojaDeVida key={grupo.hoja.documento.id} hoja={grupo.hoja} mostrarCuidador={false} />}
      </ul>
    </li>
  );
}
