import { FileText, Star } from "lucide-react";
import { TarjetaDeHojaDeVida, TarjetaDeVerificacion } from "@/components/admin/tarjeta-de-verificacion";
import { VisibilidadDelCuidador } from "@/components/admin/visibilidad-del-cuidador";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { Badge } from "@/components/ui/badge";
import { ESTADO_DEL_CONTROL, NOMBRE_DEL_CONTROL, NOMBRE_DEL_DOCUMENTO } from "@/lib/etiquetas-de-postulacion";
import { etiquetaEspecialidad, formatearFecha, formatearFechaHora } from "@/lib/format";
import type { ControlDelExpediente, ExpedienteDeCuidador } from "@/lib/services/verificaciones";
import type { ControlDeVerificacion, DocumentoSubido, TipoDeDocumento, VerificacionParaRevisor } from "@/lib/types";

// El documento que respalda cada control (el mismo que usa el backend).
const DOCUMENTO_DE_CADA_CONTROL: Record<ControlDeVerificacion, TipoDeDocumento> = {
  antecedentes: "antecedentes",
  titulos: "titulo",
  psicotecnica: "psicotecnica",
};

const TIPOS_EN_ORDEN: TipoDeDocumento[] = ["cedula", "antecedentes", "titulo", "psicotecnica", "hoja_de_vida"];

const ESTADO_DEL_DOCUMENTO: Record<DocumentoSubido["estado"], { texto: string; variante: "warning" | "success" | "destructive" }> = {
  pendiente: { texto: "Por revisar", variante: "warning" },
  aprobado: { texto: "Aprobado", variante: "success" },
  rechazado: { texto: "Rechazado", variante: "destructive" },
};

// Un documento privado se abre en una pestaña nueva a través de nuestro servidor (la dirección firmada de 2 minutos del
// backend nunca llega al navegador, y cada apertura queda en la auditoría).
function FilaDeDocumento({ documento }: { documento: DocumentoSubido }) {
  const estado = ESTADO_DEL_DOCUMENTO[documento.estado];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <a
        href={`/api/admin/documentos/${documento.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base font-medium text-primary underline-offset-4 hover:underline"
      >
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        {documento.nombre}
      </a>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Subido el {formatearFechaHora(documento.subidoEn)}</span>
        <Badge variant={estado.variante}>{estado.texto}</Badge>
      </div>
    </li>
  );
}

// Un control que ya no espera decisión (o que aún no se pidió): su estado, hasta cuándo vale y, si se rechazó, por qué.
function TarjetaDeControlDecidido({ control }: { control: ControlDelExpediente }) {
  const estado = ESTADO_DEL_CONTROL[control.estado];
  return (
    <li aria-label={NOMBRE_DEL_CONTROL[control.control]} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-border/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{NOMBRE_DEL_CONTROL[control.control]}</Badge>
        <Badge variant={estado.variante}>{estado.texto}</Badge>
      </div>
      {control.estado === "sin_solicitar" ? (
        <p className="text-sm text-muted-foreground">El cuidador todavía no pidió esta verificación.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {control.solicitadaEn !== null && (
            <div>
              <dt className="text-muted-foreground">Pedida</dt>
              <dd className="font-medium text-foreground">{formatearFechaHora(control.solicitadaEn)}</dd>
            </div>
          )}
          {control.revisadoEn !== null && (
            <div>
              <dt className="text-muted-foreground">Revisada</dt>
              <dd className="font-medium text-foreground">{formatearFechaHora(control.revisadoEn)}</dd>
            </div>
          )}
          {control.vigenteHasta !== null && (
            <div>
              <dt className="text-muted-foreground">Vigente hasta</dt>
              <dd className="font-medium text-foreground">{formatearFecha(control.vigenteHasta)}</dd>
            </div>
          )}
        </dl>
      )}
      {control.motivoDeRechazo !== null && (
        <p className="rounded-lg bg-muted p-3 text-sm text-foreground">
          <span className="font-medium">Motivo del rechazo: </span>
          {control.motivoDeRechazo}
        </p>
      )}
    </li>
  );
}

const NOMBRE_DEL_ESTADO: Record<ExpedienteDeCuidador["cuidador"]["estado"], string> = {
  activo: "Activo",
  en_revision: "En revisión",
  borrador: "Borrador",
  suspendido: "Suspendido",
};

// Todo lo de un cuidador para el revisor: quién es, cómo van sus tres controles (con la decisión a la mano si alguno espera)
// y todos los documentos que subió. Los pendientes se aprueban o rechazan aquí mismo, igual que en la cola.
export function ExpedienteDelCuidador({ expediente }: { expediente: ExpedienteDeCuidador }) {
  const { cuidador, controles, documentos } = expediente;
  // Los más recientes primero (así llegan): el primero de cada tipo es el vigente.
  const vigentePorTipo = (tipo: TipoDeDocumento) => documentos.find((d) => d.tipo === tipo);
  const hoja = vigentePorTipo("hoja_de_vida");
  const delCuidador = { id: cuidador.id, nombre: cuidador.nombre, especialidad: cuidador.especialidad, zona: cuidador.zona };

  const comoVerificacion = (control: ControlDelExpediente): VerificacionParaRevisor | null => {
    if (control.estado !== "pendiente" || control.verificacionId === null || control.solicitadaEn === null) return null;
    const aMirar = [vigentePorTipo("cedula"), vigentePorTipo(DOCUMENTO_DE_CADA_CONTROL[control.control])].filter((d): d is DocumentoSubido => d !== undefined);
    return { id: control.verificacionId, control: control.control, estado: "pendiente", solicitadaEn: control.solicitadaEn, cuidador: delCuidador, documentos: aMirar };
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="ficha" className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-border">
        <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 id="ficha" className="text-2xl font-bold text-foreground">
            {cuidador.nombre}
          </h1>
          <p className="text-base text-muted-foreground">
            {etiquetaEspecialidad(cuidador.especialidad)} · {cuidador.zona}
          </p>
          <p className="text-sm text-muted-foreground">
            {cuidador.titulo} · {cuidador.aniosExperiencia} {cuidador.aniosExperiencia === 1 ? "año" : "años"} de experiencia · registrado el {formatearFecha(cuidador.registradoEn)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={cuidador.estado === "activo" ? "success" : cuidador.estado === "suspendido" ? "destructive" : "secondary"}>{NOMBRE_DEL_ESTADO[cuidador.estado]}</Badge>
            <Badge variant={cuidador.visible ? "success" : "outline"}>{cuidador.visible ? "Visible para familias" : "No visible"}</Badge>
          </div>
          {cuidador.calificacion !== null ? (
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
              {cuidador.calificacion.toFixed(1)}
              <span className="font-normal text-muted-foreground">({cuidador.cantidadResenas})</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Sin reseñas</span>
          )}
          <span className="text-sm text-muted-foreground">
            {cuidador.serviciosCompletados} {cuidador.serviciosCompletados === 1 ? "servicio completado" : "servicios completados"}
          </span>
        </div>
      </section>

      <VisibilidadDelCuidador cuidadorId={cuidador.id} nombre={cuidador.nombre} estado={cuidador.estado} />

      <section aria-labelledby="controles" className="flex flex-col gap-3">
        <h2 id="controles" className="text-lg font-semibold text-foreground">
          Verificaciones
        </h2>
        <ul className="flex flex-col gap-3">
          {controles.map((control) => {
            const pendiente = comoVerificacion(control);
            return pendiente !== null ? (
              <TarjetaDeVerificacion key={control.control} verificacion={pendiente} mostrarCuidador={false} />
            ) : (
              <TarjetaDeControlDecidido key={control.control} control={control} />
            );
          })}
        </ul>
        {hoja?.estado === "pendiente" && (
          <ul className="flex flex-col gap-3">
            <TarjetaDeHojaDeVida hoja={{ documento: hoja, cuidador: { id: cuidador.id, nombre: cuidador.nombre } }} mostrarCuidador={false} />
          </ul>
        )}
      </section>

      <section aria-labelledby="documentos" className="flex flex-col gap-3">
        <h2 id="documentos" className="text-lg font-semibold text-foreground">
          Documentos <span className="font-normal text-muted-foreground">({documentos.length})</span>
        </h2>
        {documentos.length === 0 ? (
          <p className="rounded-2xl bg-muted p-6 text-center text-base text-muted-foreground">Este cuidador todavía no ha subido documentos.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {TIPOS_EN_ORDEN.map((tipo) => {
              const delTipo = documentos.filter((d) => d.tipo === tipo);
              if (delTipo.length === 0) return null;
              const idDelTitulo = `documentos-${tipo}`;
              return (
                <div key={tipo} role="group" aria-labelledby={idDelTitulo} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
                  <h3 id={idDelTitulo} className="text-base font-semibold text-foreground">
                    {NOMBRE_DEL_DOCUMENTO[tipo]}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {delTipo.map((documento) => (
                      <FilaDeDocumento key={documento.id} documento={documento} />
                    ))}
                  </ul>
                  {delTipo.length > 1 && <p className="text-sm text-muted-foreground">El primero es el más reciente; los demás los reemplazó una subida nueva.</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
