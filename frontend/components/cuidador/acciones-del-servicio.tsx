"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { actuarServicioAccion } from "@/lib/acciones/servicios";
import type { EstadoDeServicio } from "@/lib/types";

// Los botones del cuidador según el estado del servicio: responder una solicitud, marcar que llegó o que terminó.
export function AccionesDelServicio({ servicioId, estado }: { servicioId: string; estado: EstadoDeServicio }) {
  const enrutador = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function hacer(accion: "aceptar" | "rechazar" | "iniciar" | "finalizar" | "cancelar-cuidador") {
    empezar(async () => {
      const resultado = await actuarServicioAccion(servicioId, accion);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setError(null);
      enrutador.refresh();
    });
  }

  if (estado !== "solicitado" && estado !== "aceptado" && estado !== "en_curso") return null;

  return (
    <div className="flex flex-col gap-3">
      {error !== null && <Aviso titulo="No se pudo" descripcion={error} />}
      {estado === "solicitado" && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => hacer("aceptar")} disabled={pendiente}>
            Aceptar
          </Button>
          <Button variant="outline" onClick={() => hacer("rechazar")} disabled={pendiente}>
            Rechazar
          </Button>
        </div>
      )}
      {estado === "aceptado" && (
        <>
          <Button onClick={() => hacer("iniciar")} disabled={pendiente}>
            Ya llegué: iniciar servicio
          </Button>
          <CancelarComoCuidador pendiente={pendiente} onConfirmar={() => hacer("cancelar-cuidador")} />
        </>
      )}
      {estado === "en_curso" && (
        <Button onClick={() => hacer("finalizar")} disabled={pendiente}>
          Terminé: finalizar servicio
        </Button>
      )}
    </div>
  );
}

// Avisar que ya no puede atender un servicio que había aceptado (una emergencia, por ejemplo). Pide
// confirmación porque no se puede deshacer y le avisamos a la familia de inmediato.
function CancelarComoCuidador({ pendiente, onConfirmar }: { pendiente: boolean; onConfirmar: () => void }) {
  const [abierto, setAbierto] = useState(false);

  function confirmar() {
    onConfirmar();
    setAbierto(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" className="text-destructive" />}>
        No puedo atender este servicio
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Avisar que no puedes atenderlo?</DialogTitle>
          <DialogDescription>
            Le avisamos a la familia de inmediato para que pueda buscar a alguien más. Si ya se había cobrado, el
            dinero vuelve a ella. Esto no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            No, mantenerlo
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendiente}>
            {pendiente ? "Avisando…" : "Sí, no puedo atenderlo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
