"use client";

import { useActionState } from "react";
import { Check, FileText, X } from "lucide-react";
import { MensajeDeCampo } from "@/components/cuenta/campo";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decidirControlAccion, decidirHojaDeVidaAccion } from "@/lib/acciones/postulacion";
import { ESTADO_DEL_CONTROL, NOMBRE_DEL_CONTROL, NOMBRE_DEL_DOCUMENTO } from "@/lib/etiquetas-de-postulacion";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { formatearFechaHora } from "@/lib/format";
import type { HojaDeVidaPorRevisar, VerificacionParaRevisor } from "@/lib/types";

// Un documento privado se abre en una pestaña nueva a través de nuestro servidor (la dirección firmada de 2 minutos del
// backend nunca llega al navegador, y cada apertura queda en la auditoría).
function EnlaceDeDocumento({ id, tipo, nombre }: { id: string; tipo: keyof typeof NOMBRE_DEL_DOCUMENTO; nombre: string }) {
  return (
    <a
      href={`/api/admin/documentos/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base font-medium text-primary underline-offset-4 hover:underline"
    >
      <FileText className="size-4 shrink-0" aria-hidden="true" />
      {NOMBRE_DEL_DOCUMENTO[tipo]}
      <span className="text-sm font-normal text-muted-foreground">({nombre})</span>
    </a>
  );
}

// Una verificación de la cola: qué control, sus documentos y la decisión. Aprobar pide hasta cuándo vale (los
// antecedentes y la psicotécnica deben vencer, máximo en 5 años; el título puede no vencer); rechazar pide el motivo, que
// el cuidador verá. `mostrarCuidador` se apaga cuando ya está dentro de la tarjeta de la persona (agrupa sus controles):
// repetir su nombre en cada uno era justo lo que había que buscar tres veces.
export function TarjetaDeVerificacion({ verificacion, mostrarCuidador = true }: { verificacion: VerificacionParaRevisor; mostrarCuidador?: boolean }) {
  const [aprobacion, aprobar, aprobando] = useActionState(decidirControlAccion.bind(null, verificacion.id), ESTADO_INICIAL);
  const [rechazo, rechazar, rechazando] = useActionState(decidirControlAccion.bind(null, verificacion.id), ESTADO_INICIAL);
  const estado = ESTADO_DEL_CONTROL[verificacion.estado];
  const pendiente = verificacion.estado === "pendiente";
  const idDelTitulo = `verificacion-${verificacion.id}`;

  return (
    <li
      aria-labelledby={mostrarCuidador ? idDelTitulo : undefined}
      aria-label={mostrarCuidador ? undefined : NOMBRE_DEL_CONTROL[verificacion.control]}
      className={mostrarCuidador ? "flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border" : "flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border/70"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {mostrarCuidador ? (
          <div>
            <h3 id={idDelTitulo} className="text-lg font-semibold text-foreground">
              {verificacion.cuidador.nombre}
            </h3>
            <p className="text-sm text-muted-foreground">
              {verificacion.cuidador.zona} · pidió revisión el {formatearFechaHora(verificacion.solicitadaEn)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">pidió revisión el {formatearFechaHora(verificacion.solicitadaEn)}</p>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline">{NOMBRE_DEL_CONTROL[verificacion.control]}</Badge>
          <Badge variant={estado.variante}>{estado.texto}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Documentos para revisar</p>
        {verificacion.documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay documentos subidos.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {verificacion.documentos.map((documento) => (
              <EnlaceDeDocumento key={documento.id} id={documento.id} tipo={documento.tipo} nombre={documento.nombre} />
            ))}
          </div>
        )}
      </div>

      {pendiente && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <form action={aprobar} className="flex flex-col gap-3">
            {aprobacion.mensaje !== undefined && <Aviso titulo={aprobacion.mensaje} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`vigencia-${verificacion.id}`}>Vigente hasta</Label>
              <Input
                id={`vigencia-${verificacion.id}`}
                name="vigenteHasta"
                type="date"
                defaultValue={aprobacion.valores?.vigenteHasta}
                aria-invalid={aprobacion.errores?.vigenteHasta !== undefined ? true : undefined}
                aria-describedby={`vigencia-${verificacion.id}-ayuda${aprobacion.errores?.vigenteHasta !== undefined ? ` vigencia-${verificacion.id}-error` : ""}`}
              />
              <p id={`vigencia-${verificacion.id}-ayuda`} className="text-sm text-muted-foreground">
                {verificacion.control === "titulos" ? "Déjalo vacío si el título no vence." : "Obligatoria: máximo 5 años."}
              </p>
              {aprobacion.errores?.vigenteHasta !== undefined && <MensajeDeCampo id={`vigencia-${verificacion.id}-error`}>{aprobacion.errores.vigenteHasta}</MensajeDeCampo>}
            </div>
            <input type="hidden" name="decision" value="aprobar" />
            <Button type="submit" disabled={aprobando || rechazando}>
              <Check aria-hidden="true" />
              {aprobando ? "Aprobando…" : "Aprobar"}
            </Button>
          </form>

          <form action={rechazar} className="flex flex-col gap-3">
            {rechazo.mensaje !== undefined && <Aviso titulo={rechazo.mensaje} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`motivo-${verificacion.id}`}>Motivo del rechazo</Label>
              <textarea
                id={`motivo-${verificacion.id}`}
                name="motivo"
                rows={3}
                maxLength={1000}
                defaultValue={rechazo.valores?.motivo}
                aria-invalid={rechazo.errores?.motivo !== undefined ? true : undefined}
                aria-describedby={rechazo.errores?.motivo !== undefined ? `motivo-${verificacion.id}-error` : undefined}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-2 aria-invalid:border-destructive"
              />
              {rechazo.errores?.motivo !== undefined && <MensajeDeCampo id={`motivo-${verificacion.id}-error`}>{rechazo.errores.motivo}</MensajeDeCampo>}
            </div>
            <input type="hidden" name="decision" value="rechazar" />
            <Button type="submit" variant="outline" disabled={aprobando || rechazando}>
              <X aria-hidden="true" />
              {rechazando ? "Rechazando…" : "Rechazar"}
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

// Una hoja de vida que verán las familias: se abre, y se aprueba o se rechaza.
export function TarjetaDeHojaDeVida({ hoja, mostrarCuidador = true }: { hoja: HojaDeVidaPorRevisar; mostrarCuidador?: boolean }) {
  const [aprobacion, aprobar, aprobando] = useActionState(decidirHojaDeVidaAccion.bind(null, hoja.documento.id, "aprobar"), ESTADO_INICIAL);
  const [rechazo, rechazar, rechazando] = useActionState(decidirHojaDeVidaAccion.bind(null, hoja.documento.id, "rechazar"), ESTADO_INICIAL);
  const mensaje = aprobacion.mensaje ?? rechazo.mensaje;
  return (
    <li
      aria-label={mostrarCuidador ? undefined : "Hoja de vida"}
      className={mostrarCuidador ? "flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border" : "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border/70"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mostrarCuidador ? (
          <h3 className="text-lg font-semibold text-foreground">{hoja.cuidador.nombre}</h3>
        ) : (
          <Badge variant="outline">Hoja de vida</Badge>
        )}
        <p className="text-sm text-muted-foreground">Subida el {formatearFechaHora(hoja.documento.subidoEn)}</p>
      </div>
      <div>
        <EnlaceDeDocumento id={hoja.documento.id} tipo="hoja_de_vida" nombre={hoja.documento.nombre} />
      </div>
      {mensaje !== undefined && <Aviso titulo={mensaje} />}
      <div className="grid grid-cols-2 gap-3">
        <form action={aprobar}>
          <Button type="submit" className="w-full" disabled={aprobando || rechazando}>
            <Check aria-hidden="true" />
            {aprobando ? "Aprobando…" : "Aprobar"}
          </Button>
        </form>
        <form action={rechazar}>
          <Button type="submit" variant="outline" className="w-full" disabled={aprobando || rechazando}>
            <X aria-hidden="true" />
            {rechazando ? "Rechazando…" : "Rechazar"}
          </Button>
        </form>
      </div>
    </li>
  );
}
