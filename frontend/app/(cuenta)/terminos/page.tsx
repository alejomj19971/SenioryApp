import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";

export const metadata: Metadata = { title: "Términos y condiciones" };

// Texto de TRABAJO: lo redacta el equipo y debe revisarlo un abogado antes de publicarse a usuarios reales (F10 §7,
// como la política de privacidad en F1). A diferencia de la política, el backend no exige una versión al registrarse
// (no hay una casilla aparte de «acepto los términos»): es el contrato del servicio, no un consentimiento de datos.
export default function TerminosPage() {
  return (
    <article className="flex flex-col gap-6 text-base">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Términos y condiciones</h1>
      </div>

      <p role="note" className="flex items-start gap-2 rounded-lg border border-info bg-info/5 p-4 text-foreground">
        <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
        <span>
          Versión de trabajo: este texto está pendiente de revisión legal y puede cambiar antes del lanzamiento.
        </span>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Qué es Seniory</h2>
        <p>
          Seniory es una plataforma que conecta a familias con cuidadores independientes de adultos mayores en Colombia. Seniory no es
          el empleador de los cuidadores: cada uno presta el servicio de forma independiente, y la familia lo contrata por horas o
          turnos a través de la plataforma.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Verificación de los cuidadores</h2>
        <p>
          Antes de mostrarse a las familias, cada cuidador pasa por una verificación de antecedentes, títulos o certificaciones y una
          prueba psicotécnica, con vigencia limitada (Seniory la revisa de nuevo cuando vence). Esa verificación reduce el riesgo, pero
          no lo elimina: Seniory no garantiza el desempeño de un cuidador en cada servicio.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Pagos y cancelaciones</h2>
        <p>
          El costo de un servicio se calcula con la tarifa del cuidador y se confirma antes de pedirlo. El cobro se hace cuando el
          cuidador acepta la solicitud, con tarjeta o con la bolsa de horas prepagada. Cancelar antes de que el servicio empiece
          devuelve el dinero; la política para una cancelación más tardía está en revisión.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">La teleasistencia</h2>
        <p>
          La teleasistencia (recordatorios de medicamentos, registro de signos vitales y botón de alerta) es un complemento gratuito,
          no un servicio médico ni de monitoreo continuo. El alcance exacto de lo que hace y lo que no hace está explicado en la{" "}
          <Link href="/alcance-teleasistencia" className="font-medium text-primary underline underline-offset-4">
            página dedicada
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Cuentas</h2>
        <p>
          Cada persona es responsable de la información que entrega y de mantener su contraseña en secreto. Seniory puede suspender una
          cuenta que incumpla estos términos o ponga en riesgo a otra persona de la plataforma.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Ley aplicable</h2>
        <p>Estos términos se rigen por las leyes de Colombia.</p>
      </section>
    </article>
  );
}
