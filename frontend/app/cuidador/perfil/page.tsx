import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Clock, ShieldAlert } from "lucide-react";
import { BotonDeRevision } from "@/components/postulacion/acciones-de-postulacion";
import { EstadoDeControles } from "@/components/postulacion/estado-de-controles";
import { FormularioPerfil } from "@/components/postulacion/formulario-perfil";
import { SubirDocumento } from "@/components/postulacion/subir-documento";
import { DOCUMENTOS_OBLIGATORIOS, NOMBRE_DEL_DOCUMENTO, resumenDeLaPostulacion, tieneLosDocumentos } from "@/lib/etiquetas-de-postulacion";
import { exigirRol } from "@/lib/sesion";
import { obtenerMiPerfil } from "@/lib/services/postulacion";
import type { TipoDeDocumento } from "@/lib/types";

export const metadata: Metadata = { title: "Tu perfil" };

const AYUDA_DE_DOCUMENTO: Record<TipoDeDocumento, string> = {
  cedula: "Foto o PDF por los dos lados. Solo la ve el equipo que revisa.",
  antecedentes: "Policía, Procuraduría y Contraloría. Solo lo ve el equipo que revisa.",
  titulo: "Tu título o certificado de formación. Solo lo ve el equipo que revisa.",
  psicotecnica: "El resultado de tu prueba psicotécnica. Solo lo ve el equipo que revisa.",
  hoja_de_vida: "Opcional. Si un revisor la aprueba, las familias podrán verla en tu perfil.",
};

// El perfil y la postulación del cuidador (F9): arma su perfil, sube sus documentos, los envía a revisión y ve cómo va
// cada control. Mientras no tenga los tres aprobados no se muestra a ninguna familia.
export default async function PerfilDelCuidadorPage() {
  await exigirRol("cuidador");
  const perfil = await obtenerMiPerfil();

  if (perfil === null) {
    return (
      <div className="flex flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Arma tu perfil</h1>
          <p className="text-base text-muted-foreground">Es lo que verán las familias cuando un revisor apruebe tus documentos. Después los subes.</p>
        </div>
        <FormularioPerfil perfil={null} />
      </div>
    );
  }

  const resumen = resumenDeLaPostulacion(perfil);
  const sinEnviar = perfil.controles.every((control) => control.estado === "sin_solicitar");
  const Icono = resumen.tono === "exito" ? CircleCheck : resumen.tono === "atencion" ? ShieldAlert : Clock;
  const clasesDelResumen =
    resumen.tono === "exito" ? "border-success bg-success/5" : resumen.tono === "atencion" ? "border-destructive bg-destructive/5" : "border-border bg-muted";

  return (
    <div className="flex flex-col gap-8 px-4 py-6">
      <Link href="/cuidador" className="inline-flex min-h-12 w-fit items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tu panel
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-foreground">Tu perfil</h1>
        <p role="status" className={`flex items-start gap-3 rounded-2xl border p-4 text-base text-foreground ${clasesDelResumen}`}>
          <Icono className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="block">{resumen.titulo}</strong>
            {resumen.explicacion}
          </span>
        </p>
      </div>

      <section aria-labelledby="controles" className="flex flex-col gap-3">
        <h2 id="controles" className="text-lg font-semibold text-foreground">
          Tus verificaciones
        </h2>
        <EstadoDeControles controles={perfil.controles} />
      </section>

      <section aria-labelledby="documentos" className="flex flex-col gap-3">
        <h2 id="documentos" className="text-lg font-semibold text-foreground">
          Tus documentos
        </h2>
        <p className="text-base text-muted-foreground">PDF, JPEG o PNG, de hasta 5 MB cada uno.</p>
        <ul className="flex flex-col gap-3">
          {[...DOCUMENTOS_OBLIGATORIOS, "hoja_de_vida" as const].map((tipo) => (
            <SubirDocumento
              key={tipo}
              tipo={tipo}
              titulo={NOMBRE_DEL_DOCUMENTO[tipo]}
              ayuda={AYUDA_DE_DOCUMENTO[tipo]}
              subidos={perfil.documentos.filter((documento) => documento.tipo === tipo)}
              soloPdf={tipo === "hoja_de_vida"}
            />
          ))}
        </ul>
        {sinEnviar &&
          (tieneLosDocumentos(perfil) ? (
            <BotonDeRevision />
          ) : (
            <p className="rounded-2xl bg-muted p-4 text-base text-muted-foreground">Cuando subas la cédula, los antecedentes, el título y la psicotécnica podrás enviar tu perfil a revisión.</p>
          ))}
      </section>

      <section aria-labelledby="datos" className="flex flex-col gap-3">
        <h2 id="datos" className="text-lg font-semibold text-foreground">
          Tus datos
        </h2>
        <FormularioPerfil perfil={perfil} />
      </section>
    </div>
  );
}
