"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Campo, MensajeDeCampo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registrarMedicamentoAccion } from "@/lib/acciones/teleasistencia";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";
import { HORARIOS_MAXIMOS } from "@/lib/acciones/validar-teleasistencia";

function Formulario({ alTerminar }: { alTerminar: () => void }) {
  const [estado, accion, pendiente] = useActionState(registrarMedicamentoAccion, ESTADO_INICIAL);
  useEffect(() => {
    if (estado.listo === true) alTerminar();
  }, [estado.listo, alTerminar]);

  // Cada hora es un campo propio; las horas se identifican con una clave estable para no mezclarlas al quitar una.
  const siguiente = useRef(1);
  const [horas, setHoras] = useState<{ clave: number; valor: string }[]>(() =>
    (estado.valores?.horarios ?? "08:00").split(",").map((valor, clave) => ({ clave, valor })),
  );
  const errorDeHoras = estado.errores?.horarios;

  return (
    <form action={accion} className="flex flex-col gap-4">
      <ResumenDelFormulario estado={estado} />
      <Campo nombre="nombre" etiqueta="Medicamento" autoComplete="off" required maxLength={400} defaultValue={estado.valores?.nombre} error={estado.errores?.nombre} />
      <Campo
        nombre="dosis"
        etiqueta="Dosis"
        autoComplete="off"
        required
        maxLength={400}
        ayuda="Por ejemplo, «50 mg» o «1 tableta»."
        defaultValue={estado.valores?.dosis}
        error={estado.errores?.dosis}
      />
      <Campo nombre="indicaciones" etiqueta="Indicaciones (opcional)" autoComplete="off" maxLength={2000} ayuda="Por ejemplo, «con el desayuno»." defaultValue={estado.valores?.indicaciones} error={estado.errores?.indicaciones} />

      <fieldset className="flex flex-col gap-2" aria-describedby={errorDeHoras !== undefined ? "horarios-error" : undefined}>
        <legend className="mb-1 text-base font-medium">¿A qué horas se toma cada día?</legend>
        {horas.map((hora, indice) => (
          <div key={hora.clave} className="flex items-center gap-2">
            <Label htmlFor={`horario-${hora.clave}`} className="sr-only">
              Hora {indice + 1}
            </Label>
            <Input
              id={`horario-${hora.clave}`}
              name="horario"
              type="time"
              required
              value={hora.valor}
              onChange={(evento) => setHoras((actuales) => actuales.map((h) => (h.clave === hora.clave ? { ...h, valor: evento.target.value } : h)))}
              aria-invalid={errorDeHoras !== undefined ? true : undefined}
            />
            {horas.length > 1 && (
              <Button type="button" variant="outline" size="icon" aria-label={`Quitar la hora ${indice + 1}`} onClick={() => setHoras((actuales) => actuales.filter((h) => h.clave !== hora.clave))}>
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
        {horas.length < HORARIOS_MAXIMOS && (
          <Button type="button" variant="ghost" className="w-fit" onClick={() => setHoras((actuales) => [...actuales, { clave: siguiente.current++, valor: "" }])}>
            <Plus aria-hidden="true" />
            Agregar otra hora
          </Button>
        )}
        {errorDeHoras !== undefined && <MensajeDeCampo id="horarios-error">{errorDeHoras}</MensajeDeCampo>}
      </fieldset>

      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar medicamento"}
      </Button>
    </form>
  );
}

// «Agregar medicamento»: nombre, dosis y las horas del día. Las tomas de hoy se generan solas.
export function AgregarMedicamento() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" className="w-full" />}>
        <Plus aria-hidden="true" />
        Agregar un medicamento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar un medicamento</DialogTitle>
          <DialogDescription>Se toma todos los días a las horas que indiques.</DialogDescription>
        </DialogHeader>
        <Formulario alTerminar={() => setAbierto(false)} />
      </DialogContent>
    </Dialog>
  );
}
