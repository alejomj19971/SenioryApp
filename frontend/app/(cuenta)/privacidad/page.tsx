import type { Metadata } from "next";
import { Info } from "lucide-react";
import { VERSION_DE_LA_POLITICA } from "@/lib/legal/versiones";

export const metadata: Metadata = { title: "Política de tratamiento de datos" };

// Texto de TRABAJO: lo redacta el equipo y debe revisarlo un abogado antes de publicarse a usuarios reales
// (F1 §9, decisión 3; PENDIENTES, M1). Al cambiarlo, se actualiza `VERSION_DE_LA_POLITICA` y la del backend.
export default function PrivacidadPage() {
  return (
    <article className="flex flex-col gap-6 text-base">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Política de tratamiento de datos</h1>
        <p className="text-sm text-muted-foreground">Versión {VERSION_DE_LA_POLITICA}</p>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-info bg-info/5 p-4 text-foreground">
        <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
        <span>
          Versión de trabajo: este texto está pendiente de revisión legal y puede cambiar antes del lanzamiento.
        </span>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Quién es responsable</h2>
        <p>
          Seniory es la plataforma que conecta a familias con cuidadores verificados de adultos mayores en Colombia. Los datos que nos
          entregas los trata Seniory conforme a la Ley 1581 de 2012.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Qué datos pedimos y para qué</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Tu cuenta:</strong> nombre, correo y, si quieres, celular. Para identificarte, avisarte de tus servicios y cuidar tu
            sesión.
          </li>
          <li>
            <strong>La persona a la que cuidas:</strong> su nombre y su fecha de nacimiento. Para encontrar al cuidador adecuado.
          </li>
          <li>
            <strong>Datos de salud</strong> (medicamentos, signos vitales, alertas): <em>solo si lo autorizas</em> de forma aparte. Son
            datos sensibles: no estás obligado a darlos.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Quién los ve</h2>
        <p>
          Tú, y el cuidador que contrates, solo mientras tenga un servicio contigo. Nunca compartimos tu teléfono ni tu correo con otras
          familias, ni vendemos tus datos.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Tus derechos</h2>
        <p>
          Puedes conocer, actualizar y pedir que eliminemos tus datos, y retirar tu autorización cuando quieras. Los canales para hacerlo se
          publicarán aquí antes del lanzamiento.
        </p>
      </section>
    </article>
  );
}
