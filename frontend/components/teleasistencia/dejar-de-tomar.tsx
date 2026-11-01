"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { desactivarMedicamentoAccion } from "@/lib/acciones/teleasistencia";

// «Dejar de tomar»: el medicamento deja de generar tomas desde hoy (lo ya registrado se conserva). Pide confirmación.
export function DejarDeTomar({ medicamentoId, nombre }: { medicamentoId: string; nombre: string }) {
  const enrutador = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    empezar(async () => {
      const resultado = await desactivarMedicamentoAccion(medicamentoId);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setAbierto(false);
      enrutador.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Dejar de tomar ${nombre}`} />}>Dejar de tomar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dejar de tomar {nombre}?</DialogTitle>
          <DialogDescription>Ya no aparecerá en las tomas de cada día. Lo que ya registraste se conserva.</DialogDescription>
        </DialogHeader>
        {error !== null && <Aviso titulo="No pudimos hacerlo" descripcion={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            No, mantenerlo
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? "Guardando…" : "Sí, dejar de tomar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
