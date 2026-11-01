"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { SelectorHoras, type FechaSeleccion } from "@/components/contratacion/selector-horas";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cotizarServicio, solicitarServicioAccion } from "@/lib/acciones/servicios";
import { franjasPedibles, sumarDias, type AhoraEnColombia } from "@/lib/fecha-colombia";
import { formatearCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cotizacion, Cuidador, Jornada } from "@/lib/types";

interface FormularioContratacionProps {
  cuidador: Cuidador;
  // «Hoy» y la hora en Colombia, decididos en el servidor (no en el reloj del navegador).
  ahora: AhoraEnColombia;
  // La cotización de 1 hora que ya calculó el servidor al abrir la página; null si falló.
  cotizacionInicial: Cotizacion | null;
  // Pesos disponibles en la bolsa de horas de la familia.
  saldoDeLaBolsa: number;
}

// Pedir un servicio (F3+F4). El precio lo calcula el SERVIDOR (cada cambio de horas pide una cotización nueva) y
// el resultado es una SOLICITUD: el cuidador la acepta o no; recién entonces se cobra.
export function FormularioContratacion({ cuidador, ahora, cotizacionInicial, saldoDeLaBolsa }: FormularioContratacionProps) {
  const router = useRouter();
  const [enviando, empezarEnvio] = useTransition();

  const manana = sumarDias(ahora.hoy, 1);
  const [fechaSeleccion, setFechaSeleccion] = useState<FechaSeleccion>("hoy");
  const [fechaPersonalizada, setFechaPersonalizada] = useState(manana);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [horas, setHoras] = useState(1);
  const [usarBolsa, setUsarBolsa] = useState(false);

  const fecha = fechaSeleccion === "hoy" ? ahora.hoy : fechaSeleccion === "manana" ? manana : fechaPersonalizada;
  const jornadasPedibles = useMemo(() => franjasPedibles(fecha, cuidador.disponibilidad, ahora), [fecha, cuidador.disponibilidad, ahora]);
  // Si la franja elegida ya no se puede pedir (cambió el día), se usa la primera que sí.
  const jornadaElegida = jornada !== null && jornadasPedibles.includes(jornada) ? jornada : (jornadasPedibles[0] ?? null);

  // ── La cotización del servidor ────────────────────────────────────────────────────────────────────────────────
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(cotizacionInicial);
  const [cotizando, setCotizando] = useState(false);
  const [errorDeCotizacion, setErrorDeCotizacion] = useState<string | null>(
    cotizacionInicial === null ? "No pudimos calcular el precio. Inténtalo de nuevo." : null,
  );
  const [intento, setIntento] = useState(0);
  const turno = useRef(0);
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      if (cotizacionInicial !== null) return;
    }
    const miTurno = ++turno.current;
    setCotizando(true);
    void cotizarServicio(cuidador.id, horas).then((resultado) => {
      // Si la persona ya cambió las horas otra vez, esta respuesta quedó vieja.
      if (miTurno !== turno.current) return;
      setCotizando(false);
      if (resultado.ok) {
        setCotizacion(resultado.cotizacion);
        setErrorDeCotizacion(null);
      } else {
        setErrorDeCotizacion(resultado.mensaje);
      }
    });
  }, [cuidador.id, horas, cotizacionInicial, intento]);

  const total = cotizacion?.totalFamilia ?? 0;
  const bolsaAlcanza = cotizacion !== null && saldoDeLaBolsa >= total;
  // Si cambió el total y la bolsa ya no alcanza, no se puede seguir usando.
  const pagaConBolsa = usarBolsa && bolsaAlcanza;

  // ── La clave de idempotencia ──────────────────────────────────────────────────────────────────────────────────
  // El mismo envío repetido (mala conexión, doble toque) usa la misma clave y el backend devuelve el mismo
  // servicio; si la persona cambia algo, es otra solicitud y la clave cambia (la misma clave con otros datos es 409).
  const clave = useRef<{ firma: string; valor: string } | null>(null);
  function claveDe(firma: string): string {
    if (clave.current === null || clave.current.firma !== firma) clave.current = { firma, valor: crypto.randomUUID() };
    return clave.current.valor;
  }

  const [mensajeDeError, setMensajeDeError] = useState<string | null>(null);
  const puedeEnviar = jornadaElegida !== null && cotizacion !== null && !cotizando && !enviando;

  function confirmar() {
    if (jornadaElegida === null || cotizacion === null) return;
    const datos = { cuidadorId: cuidador.id, fecha, jornada: jornadaElegida, horas, medioDePago: pagaConBolsa ? "bolsa" : "pasarela" } as const;
    empezarEnvio(async () => {
      const resultado = await solicitarServicioAccion(datos, claveDe(JSON.stringify(datos)));
      if (!resultado.ok) {
        setMensajeDeError(resultado.mensaje);
        return;
      }
      setMensajeDeError(null);
      router.push(`/app/servicios/${resultado.servicioId}?nuevo=1`);
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <SelectorHoras
        fechaSeleccion={fechaSeleccion}
        onFechaSeleccionChange={setFechaSeleccion}
        fechaPersonalizada={fechaPersonalizada}
        onFechaPersonalizadaChange={setFechaPersonalizada}
        fechaMinima={ahora.hoy}
        jornadasPedibles={jornadasPedibles}
        jornada={jornadaElegida}
        onJornadaChange={setJornada}
        horas={horas}
        onHorasChange={setHoras}
      />

      {saldoDeLaBolsa > 0 && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl p-4 ring-1",
            pagaConBolsa ? "bg-primary/10 ring-primary/30" : "bg-secondary/60 ring-transparent",
          )}
        >
          <div className="flex items-center gap-3">
            <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <Label htmlFor="usar-bolsa" className="text-base font-medium text-foreground">
                Pagar con mi bolsa de horas
              </Label>
              <p className="text-sm text-muted-foreground">
                {bolsaAlcanza
                  ? `Tienes ${formatearCOP(saldoDeLaBolsa)} en tu bolsa`
                  : `Tu bolsa (${formatearCOP(saldoDeLaBolsa)}) no alcanza para este servicio`}
              </p>
            </div>
          </div>
          <Switch id="usar-bolsa" checked={pagaConBolsa} disabled={!bolsaAlcanza} onCheckedChange={setUsarBolsa} />
        </div>
      )}

      {cotizacion !== null && (
        <ResumenCosto
          subtotal={cotizacion.subtotal}
          cargo={cotizacion.cargo}
          cargoPorcentaje={cotizacion.cargoPorcentaje}
          total={cotizacion.totalFamilia}
          calculando={cotizando}
        />
      )}
      {errorDeCotizacion !== null && (
        <Aviso
          titulo="No pudimos calcular el precio"
          descripcion={errorDeCotizacion}
          accion={
            <Button type="button" variant="outline" size="sm" onClick={() => setIntento((actual) => actual + 1)}>
              Reintentar
            </Button>
          }
        />
      )}

      <p className="rounded-2xl bg-info/10 p-4 text-base text-foreground">
        {cuidador.nombre.split(" ")[0]} tiene hasta 2 horas para aceptar (30 minutos si es para hoy). Solo se te cobra cuando acepta; si no
        puede, no pagas nada.
      </p>

      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 backdrop-blur">
        {mensajeDeError !== null && (
          <div className="mb-3">
            <Aviso titulo="No pudimos enviar la solicitud" descripcion={mensajeDeError} />
          </div>
        )}
        <Button type="button" size="lg" className="w-full rounded-full" onClick={confirmar} disabled={!puedeEnviar}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </Button>
      </div>
    </div>
  );
}
