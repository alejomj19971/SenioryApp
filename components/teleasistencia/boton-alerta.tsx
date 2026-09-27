"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Siren } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEGUNDOS_CUENTA_REGRESIVA = 5;

type EstadoAlerta = "inactivo" | "cuenta-regresiva" | "enviada";

export function BotonAlerta() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [estado, setEstado] = useState<EstadoAlerta>("inactivo");
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_CUENTA_REGRESIVA);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function limpiarIntervalo() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }

  function iniciarAlerta() {
    setSegundosRestantes(SEGUNDOS_CUENTA_REGRESIVA);
    setEstado("cuenta-regresiva");
  }

  useEffect(() => {
    if (searchParams.get("alerta") === "1") {
      // Comando de voz "alerta"/"ayuda" (sistema externo: la URL) dispara la cuenta regresiva.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      iniciarAlerta();
      router.replace("/app/teleasistencia");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancelarAlerta() {
    limpiarIntervalo();
    setEstado("inactivo");
  }

  useEffect(() => {
    if (estado !== "cuenta-regresiva") return;

    intervaloRef.current = setInterval(() => {
      setSegundosRestantes((valorActual) => {
        if (valorActual <= 1) {
          limpiarIntervalo();
          setEstado("enviada");
          return 0;
        }
        return valorActual - 1;
      });
    }, 1000);

    return limpiarIntervalo;
  }, [estado]);

  return (
    <>
      <button
        type="button"
        onClick={iniciarAlerta}
        className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl bg-destructive text-lg font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
      >
        <Siren className="size-8" aria-hidden="true" />
        Enviar alerta de emergencia
      </button>

      <Dialog
        open={estado !== "inactivo"}
        onOpenChange={(abierto) => {
          if (!abierto) cancelarAlerta();
        }}
      >
        <DialogContent showCloseButton={estado === "enviada"}>
          {estado === "cuenta-regresiva" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
                  Enviando alerta en {segundosRestantes}…
                </DialogTitle>
                <DialogDescription className="text-base">
                  Se notificará a Andrea y a la línea de emergencia. Puedes
                  cancelar si fue sin querer.
                </DialogDescription>
              </DialogHeader>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={SEGUNDOS_CUENTA_REGRESIVA}
                aria-valuenow={SEGUNDOS_CUENTA_REGRESIVA - segundosRestantes}
              >
                <div
                  className="h-full bg-destructive transition-[width] duration-1000 ease-linear"
                  style={{
                    width: `${((SEGUNDOS_CUENTA_REGRESIVA - segundosRestantes) / SEGUNDOS_CUENTA_REGRESIVA) * 100}%`,
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-full text-base"
                onClick={cancelarAlerta}
              >
                Cancelar
              </Button>
            </>
          )}

          {estado === "enviada" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                  Alerta enviada
                </DialogTitle>
                <DialogDescription className="text-base text-foreground">
                  Alerta enviada a Andrea y a la línea de emergencia.
                </DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
