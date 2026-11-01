"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Phone, Siren } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enviarAlertaAccion } from "@/lib/acciones/teleasistencia";
import type { AlertaEnviada } from "@/lib/types";

const SEGUNDOS_CUENTA_REGRESIVA = 5;
const NUMERO_DE_EMERGENCIAS = "123";

type Estado =
  | { fase: "inactivo" }
  | { fase: "cuenta-regresiva" }
  | { fase: "enviando" }
  | { fase: "enviada"; alerta: AlertaEnviada }
  | { fase: "fallo"; mensaje: string };

function aTexto(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

// Pedir ayuda (H7). La cuenta regresiva de 5 s evita avisos por un toque sin querer. La alerta se envía de verdad y la
// pantalla dice A QUIÉN se avisó (lo que responde el backend): Seniory avisa a la familia y al cuidador en turno, NO a
// una «línea de emergencia», y siempre ofrece llamar al 123.
export function BotonAlerta({ nombreDeLaPersona }: { nombreDeLaPersona: string }) {
  const enrutador = useRouter();
  const parametros = useSearchParams();
  const [estado, setEstado] = useState<Estado>({ fase: "inactivo" });
  const [segundos, setSegundos] = useState(SEGUNDOS_CUENTA_REGRESIVA);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  // La misma alerta reintentada (mala conexión, doble toque) usa la misma clave y NO avisa dos veces.
  const clave = useRef<string | null>(null);
  const origen = useRef<"boton" | "voz">("boton");

  function detener() {
    if (intervalo.current !== null) clearInterval(intervalo.current);
    intervalo.current = null;
  }

  function empezar(desde: "boton" | "voz") {
    origen.current = desde;
    clave.current = crypto.randomUUID();
    setSegundos(SEGUNDOS_CUENTA_REGRESIVA);
    setEstado({ fase: "cuenta-regresiva" });
  }

  async function enviar() {
    setEstado({ fase: "enviando" });
    const resultado = await enviarAlertaAccion(origen.current, clave.current);
    if (resultado.ok) {
      clave.current = null;
      setEstado({ fase: "enviada", alerta: resultado.alerta });
    } else {
      setEstado({ fase: "fallo", mensaje: resultado.mensaje });
    }
  }

  function cancelar() {
    detener();
    clave.current = null;
    setEstado({ fase: "inactivo" });
  }

  // El comando de voz «alerta» o «ayuda» abre esta pantalla con `?alerta=1` y dispara la cuenta regresiva.
  useEffect(() => {
    if (parametros.get("alerta") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      empezar("voz");
      enrutador.replace("/app/teleasistencia");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estado.fase !== "cuenta-regresiva") return;
    intervalo.current = setInterval(() => {
      setSegundos((actual) => {
        if (actual <= 1) {
          detener();
          void enviar();
          return 0;
        }
        return actual - 1;
      });
    }, 1000);
    return detener;
  }, [estado.fase]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => empezar("boton")}
          className="flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl bg-destructive text-lg font-bold text-destructive-foreground shadow-lg transition-transform active:scale-[0.98]"
        >
          <Siren className="size-8" aria-hidden="true" />
          Pedir ayuda ahora
        </button>
        <p className="text-base text-muted-foreground">
          Avisamos a la familia y al cuidador que esté con {nombreDeLaPersona}. <strong className="text-foreground">Seniory no es un servicio de emergencias:</strong>{" "}
          si hay peligro, llama al{" "}
          <a href={`tel:${NUMERO_DE_EMERGENCIAS}`} className="font-semibold text-foreground underline underline-offset-4">
            {NUMERO_DE_EMERGENCIAS}
          </a>
          .
        </p>
      </div>

      <Dialog
        open={estado.fase !== "inactivo"}
        onOpenChange={(abierto) => {
          if (!abierto && estado.fase !== "enviando") cancelar();
        }}
      >
        <DialogContent showCloseButton={estado.fase === "enviada" || estado.fase === "fallo"}>
          {estado.fase === "cuenta-regresiva" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
                  Pidiendo ayuda en {segundos}…
                </DialogTitle>
                <DialogDescription>Vamos a avisar a la familia y al cuidador de {nombreDeLaPersona}. Puedes cancelar si fue sin querer.</DialogDescription>
              </DialogHeader>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Cuenta regresiva"
                aria-valuemin={0}
                aria-valuemax={SEGUNDOS_CUENTA_REGRESIVA}
                aria-valuenow={SEGUNDOS_CUENTA_REGRESIVA - segundos}
              >
                <div
                  className="h-full bg-destructive transition-[width] duration-1000 ease-linear"
                  style={{ width: `${((SEGUNDOS_CUENTA_REGRESIVA - segundos) / SEGUNDOS_CUENTA_REGRESIVA) * 100}%` }}
                />
              </div>
              <Button variant="outline" size="lg" className="w-full" onClick={cancelar}>
                Cancelar
              </Button>
            </>
          )}

          {estado.fase === "enviando" && (
            <DialogHeader>
              <DialogTitle>Enviando la alerta…</DialogTitle>
              <DialogDescription>Un momento: estamos avisando.</DialogDescription>
            </DialogHeader>
          )}

          {estado.fase === "enviada" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                  Alerta enviada
                </DialogTitle>
                <DialogDescription className="text-foreground">
                  {estado.alerta.avisadosA.length > 0
                    ? `Avisamos a ${aTexto(estado.alerta.avisadosA)}.`
                    : "Registramos la alerta, pero no había a quién avisar en Seniory en este momento."}
                </DialogDescription>
              </DialogHeader>
              <p className="rounded-xl bg-muted p-3 text-base text-foreground">
                Seniory no es un servicio de emergencias. Si hay peligro, llama ya al {NUMERO_DE_EMERGENCIAS}.
              </p>
              <a href={`tel:${NUMERO_DE_EMERGENCIAS}`} className={buttonVariants({ size: "lg", className: "w-full" })}>
                <Phone aria-hidden="true" />
                Llamar al {NUMERO_DE_EMERGENCIAS}
              </a>
            </>
          )}

          {estado.fase === "fallo" && (
            <>
              <DialogHeader>
                <DialogTitle>No pudimos enviar la alerta</DialogTitle>
                <DialogDescription>No se avisó a nadie. Inténtalo de nuevo, y si hay peligro llama ya al {NUMERO_DE_EMERGENCIAS}.</DialogDescription>
              </DialogHeader>
              <Aviso titulo="Qué pasó" descripcion={estado.mensaje} />
              <Button size="lg" className="w-full" onClick={() => void enviar()}>
                Reintentar
              </Button>
              <a href={`tel:${NUMERO_DE_EMERGENCIAS}`} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}>
                <Phone aria-hidden="true" />
                Llamar al {NUMERO_DE_EMERGENCIAS}
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
