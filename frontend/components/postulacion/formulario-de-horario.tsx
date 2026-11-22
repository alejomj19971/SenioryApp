"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { EditorDeHorario } from "@/components/postulacion/editor-de-horario";
import { Button } from "@/components/ui/button";
import { guardarHorarioAccion } from "@/lib/acciones/postulacion";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { horariosLibresDeTexto } from "@/lib/acciones/validar-postulacion";
import type { AhoraEnColombia } from "@/lib/fecha-colombia";
import type { RangoLibre } from "@/lib/types";

// Solo el horario semanal: aparte del resto del perfil, porque es lo que el cuidador va a tocar seguido.
export function FormularioDeHorario({ horariosLibres, ahora }: { horariosLibres: RangoLibre[]; ahora: AhoraEnColombia }) {
  const [estado, accion, pendiente] = useActionState(guardarHorarioAccion, ESTADO_INICIAL);
  const valorInicial = estado.valores?.horariosLibres !== undefined ? (horariosLibresDeTexto(estado.valores.horariosLibres) ?? []) : horariosLibres;

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      <ResumenDelFormulario estado={estado} />
      {estado.listo === true && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-success bg-success/5 p-4 text-base text-foreground">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          Horario guardado.
        </p>
      )}
      <EditorDeHorario nombreDelCampo="horariosLibres" valorInicial={valorInicial} ahora={ahora} error={estado.errores?.horariosLibres} />
      <Button type="submit" size="lg" className="w-full" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar horario"}
      </Button>
    </form>
  );
}
