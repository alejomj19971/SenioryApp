"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Campo } from "@/components/cuenta/campo";
import { ResumenDelFormulario } from "@/components/cuenta/resumen-del-formulario";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MensajeDeCampo } from "@/components/cuenta/campo";
import { registrarLecturaAccion } from "@/lib/acciones/teleasistencia";
import { ESTADO_INICIAL } from "@/lib/acciones/estado";

function Formulario({ alTerminar }: { alTerminar: () => void }) {
  const [estado, accion, pendiente] = useActionState(registrarLecturaAccion, ESTADO_INICIAL);
  useEffect(() => {
    if (estado.listo === true) alTerminar();
  }, [estado.listo, alTerminar]);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <ResumenDelFormulario estado={estado} />
      {estado.errores?.medidas !== undefined && <MensajeDeCampo id="medidas-error">{estado.errores.medidas}</MensajeDeCampo>}
      <div className="grid grid-cols-2 gap-3">
        <Campo
          nombre="presionSistolica"
          etiqueta="Presión alta"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={estado.valores?.presionSistolica}
          error={estado.errores?.presionSistolica}
          ayuda="Por ejemplo, 120"
        />
        <Campo
          nombre="presionDiastolica"
          etiqueta="Presión baja"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={estado.valores?.presionDiastolica}
          error={estado.errores?.presionDiastolica}
          ayuda="Por ejemplo, 80"
        />
      </div>
      <Campo
        nombre="frecuenciaCardiaca"
        etiqueta="Pulso (latidos por minuto)"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={estado.valores?.frecuenciaCardiaca}
        error={estado.errores?.frecuenciaCardiaca}
      />
      <Campo
        nombre="glucosa"
        etiqueta="Glucosa (mg/dL)"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={estado.valores?.glucosa}
        error={estado.errores?.glucosa}
      />
      <p className="text-sm text-muted-foreground">Puedes llenar solo lo que mediste. La presión se registra completa: la alta y la baja.</p>
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar lectura"}
      </Button>
    </form>
  );
}

// «Registrar signos»: una lectura con las medidas que se tomaron (todas opcionales, la presión completa).
export function RegistrarLectura() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        <Plus aria-hidden="true" />
        Registrar signos
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar signos vitales</DialogTitle>
          <DialogDescription>Escribe lo que acabas de medir.</DialogDescription>
        </DialogHeader>
        <Formulario alTerminar={() => setAbierto(false)} />
      </DialogContent>
    </Dialog>
  );
}
