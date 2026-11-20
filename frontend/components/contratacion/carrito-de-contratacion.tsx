"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Wallet, XCircle } from "lucide-react";
import { AvatarCuidador } from "@/components/avatar-cuidador";
import { SelectorHoras, type FechaSeleccion } from "@/components/contratacion/selector-horas";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { solicitarServicioAccion } from "@/lib/acciones/servicios";
import { franjasPedibles, sumarDias, type AhoraEnColombia } from "@/lib/fecha-colombia";
import { useCotizacion } from "@/lib/hooks/use-cotizacion";
import { formatearCOP } from "@/lib/format";
import type { Cotizacion, Cuidador, DatosDeSolicitud, Jornada } from "@/lib/types";

interface CarritoDeContratacionProps {
  cuidadores: Cuidador[];
  ahora: AhoraEnColombia;
  cotizacionesIniciales: Map<string, Cotizacion | null>;
  saldoDeLaBolsa: number;
}

// Lo que cada tarjeta del carrito reporta hacia arriba, para poder sumar el total y armar el envío.
interface EstadoDelItem {
  total: number;
  // null si todavía no se puede enviar (sin franja elegida o sin cotización).
  datos: Omit<DatosDeSolicitud, "medioDePago"> | null;
}

type ResultadoDeEnvio = { fase: "pendiente" } | { fase: "enviando" } | { fase: "ok" } | { fase: "error"; mensaje: string };

// Contratar a varios cuidadores juntos (F4): se llega aquí marcando varios en la búsqueda. Cada cuidador
// conserva su propia fecha/franja/horas, pero comparten la bolsa (un solo saldo) y se envían todas las
// solicitudes de una vez — cada una es su propia petición al backend (`solicitarServicioAccion`), así que
// una que falle (p. ej. esa franja ya se ocupó) no bota a las demás.
export function CarritoDeContratacion({ cuidadores: iniciales, ahora, cotizacionesIniciales, saldoDeLaBolsa }: CarritoDeContratacionProps) {
  const router = useRouter();
  const [cuidadores, setCuidadores] = useState(iniciales);
  const [estados, setEstados] = useState<Map<string, EstadoDelItem>>(new Map());
  const [usarBolsa, setUsarBolsa] = useState(false);
  const [enviando, empezarEnvio] = useTransition();
  const [resultados, setResultados] = useState<Map<string, ResultadoDeEnvio>>(new Map());

  function quitar(cuidadorId: string) {
    setCuidadores((actuales) => actuales.filter((cuidador) => cuidador.id !== cuidadorId));
    setEstados((actuales) => {
      const siguiente = new Map(actuales);
      siguiente.delete(cuidadorId);
      return siguiente;
    });
  }

  function reportarEstado(cuidadorId: string, estado: EstadoDelItem) {
    setEstados((actuales) => {
      const siguiente = new Map(actuales);
      siguiente.set(cuidadorId, estado);
      return siguiente;
    });
  }

  const total = [...estados.values()].reduce((suma, estado) => suma + estado.total, 0);
  const bolsaAlcanza = total > 0 && saldoDeLaBolsa >= total;
  const pagaConBolsa = usarBolsa && bolsaAlcanza;
  const listosParaEnviar = cuidadores.filter((cuidador) => estados.get(cuidador.id)?.datos != null);
  const puedeEnviar = listosParaEnviar.length > 0 && !enviando;

  // La misma clave de idempotencia por cuidador mientras no cambien sus datos; un reintento solo de ese
  // cuidador reutiliza la misma, así no se duplica.
  const claves = useRef(new Map<string, { firma: string; valor: string }>());
  function claveDe(cuidadorId: string, firma: string): string {
    const actual = claves.current.get(cuidadorId);
    if (actual === undefined || actual.firma !== firma) {
      const nueva = { firma, valor: crypto.randomUUID() };
      claves.current.set(cuidadorId, nueva);
      return nueva.valor;
    }
    return actual.valor;
  }

  async function enviarUno(cuidadorId: string): Promise<void> {
    const estado = estados.get(cuidadorId);
    if (estado?.datos == null) return;
    const datos: DatosDeSolicitud = { ...estado.datos, medioDePago: pagaConBolsa ? "bolsa" : "pasarela" };
    setResultados((actuales) => new Map(actuales).set(cuidadorId, { fase: "enviando" }));
    const resultado = await solicitarServicioAccion(datos, claveDe(cuidadorId, JSON.stringify(datos)));
    setResultados((actuales) =>
      new Map(actuales).set(cuidadorId, resultado.ok ? { fase: "ok" } : { fase: "error", mensaje: resultado.mensaje }),
    );
  }

  function enviarTodos() {
    empezarEnvio(async () => {
      await Promise.allSettled(listosParaEnviar.map((cuidador) => enviarUno(cuidador.id)));
    });
  }

  const todasOk = cuidadores.length > 0 && cuidadores.every((cuidador) => resultados.get(cuidador.id)?.fase === "ok");
  const algunaEnviada = [...resultados.values()].some((resultado) => resultado.fase === "ok" || resultado.fase === "error");

  if (cuidadores.length === 0) {
    return (
      <Aviso
        titulo="No queda ningún cuidador en el carrito"
        descripcion="Vuelve a la búsqueda para elegir con quién quieres contratar."
        accion={
          <Link href="/app/cuidadores" className="text-base font-medium text-primary underline underline-offset-4">
            Buscar cuidadores
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      {cuidadores.map((cuidador) => (
        <ItemDelCarrito
          key={cuidador.id}
          cuidador={cuidador}
          ahora={ahora}
          cotizacionInicial={cotizacionesIniciales.get(cuidador.id) ?? null}
          resultado={resultados.get(cuidador.id) ?? { fase: "pendiente" }}
          onQuitar={() => quitar(cuidador.id)}
          onEstadoCambia={(estado) => reportarEstado(cuidador.id, estado)}
          onReintentar={() => void enviarUno(cuidador.id)}
        />
      ))}

      {saldoDeLaBolsa > 0 && total > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 p-4 ring-1 ring-transparent data-[activo=true]:bg-primary/10 data-[activo=true]:ring-primary/30" data-activo={pagaConBolsa}>
          <div className="flex items-center gap-3">
            <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <Label htmlFor="usar-bolsa-carrito" className="text-base font-medium text-foreground">
                Pagar todo con mi bolsa de horas
              </Label>
              <p className="text-sm text-muted-foreground">
                {bolsaAlcanza
                  ? `Tienes ${formatearCOP(saldoDeLaBolsa)} en tu bolsa`
                  : `Tu bolsa (${formatearCOP(saldoDeLaBolsa)}) no alcanza para el total de ${formatearCOP(total)}`}
              </p>
            </div>
          </div>
          <Switch id="usar-bolsa-carrito" checked={pagaConBolsa} disabled={!bolsaAlcanza} onCheckedChange={setUsarBolsa} />
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-card p-4 ring-1 ring-border">
          <span className="text-base font-semibold text-foreground">Total de los {listosParaEnviar.length === 1 ? "1 servicio" : `${listosParaEnviar.length} servicios`}</span>
          <span className="text-xl font-bold text-foreground">{formatearCOP(total)}</span>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 backdrop-blur">
        {todasOk ? (
          <Button type="button" size="lg" className="w-full rounded-full" onClick={() => router.push("/app/servicios")}>
            Ir a mis servicios
          </Button>
        ) : (
          <Button type="button" size="lg" className="w-full rounded-full" onClick={enviarTodos} disabled={!puedeEnviar}>
            {enviando
              ? "Enviando…"
              : algunaEnviada
                ? "Reintentar los que fallaron"
                : listosParaEnviar.length === 1
                  ? "Enviar solicitud"
                  : `Enviar las ${listosParaEnviar.length} solicitudes`}
          </Button>
        )}
      </div>
    </div>
  );
}

interface ItemDelCarritoProps {
  cuidador: Cuidador;
  ahora: AhoraEnColombia;
  cotizacionInicial: Cotizacion | null;
  resultado: ResultadoDeEnvio;
  onQuitar: () => void;
  onEstadoCambia: (estado: EstadoDelItem) => void;
  onReintentar: () => void;
}

function ItemDelCarrito({ cuidador, ahora, cotizacionInicial, resultado, onQuitar, onEstadoCambia, onReintentar }: ItemDelCarritoProps) {
  const manana = sumarDias(ahora.hoy, 1);
  const [fechaSeleccion, setFechaSeleccion] = useState<FechaSeleccion>("hoy");
  const [fechaPersonalizada, setFechaPersonalizada] = useState(manana);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [horas, setHoras] = useState(1);

  const fecha = fechaSeleccion === "hoy" ? ahora.hoy : fechaSeleccion === "manana" ? manana : fechaPersonalizada;
  const jornadasPedibles = useMemo(() => franjasPedibles(fecha, cuidador.disponibilidad, ahora), [fecha, cuidador.disponibilidad, ahora]);
  const jornadaElegida = jornada !== null && jornadasPedibles.includes(jornada) ? jornada : (jornadasPedibles[0] ?? null);

  const { cotizacion, cotizando, errorDeCotizacion, reintentar } = useCotizacion(cuidador.id, horas, cotizacionInicial);

  const yaSeEnvio = resultado.fase === "ok" || resultado.fase === "enviando";
  const total = cotizacion?.totalFamilia ?? 0;
  const datos = jornadaElegida !== null && cotizacion !== null && !yaSeEnvio ? { cuidadorId: cuidador.id, fecha, jornada: jornadaElegida, horas } : null;
  // El padre necesita el total y los datos de ESTE cuidador para sumar el carrito y armar el envío; se lo
  // avisa después de renderizar (nunca durante el render de otro componente).
  useEffect(() => {
    onEstadoCambia({ total, datos });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, JSON.stringify(datos)]);

  return (
    <section aria-label={cuidador.nombre} className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AvatarCuidador nombre={cuidador.nombre} foto={cuidador.foto} />
          <div>
            <p className="text-base font-semibold text-foreground">{cuidador.nombre}</p>
            <p className="text-sm text-muted-foreground">{cuidador.zona}</p>
          </div>
        </div>
        {!yaSeEnvio && (
          <Button type="button" variant="ghost" size="sm" onClick={onQuitar}>
            Quitar
          </Button>
        )}
      </div>

      {resultado.fase === "ok" ? (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-base text-success">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          Solicitud enviada
        </p>
      ) : resultado.fase === "error" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-3">
          <p className="flex items-center gap-2 text-base text-destructive">
            <XCircle className="size-5 shrink-0" aria-hidden="true" />
            {resultado.mensaje}
          </p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onReintentar}>
            Reintentar este
          </Button>
        </div>
      ) : (
        <>
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
                <Button type="button" variant="outline" size="sm" onClick={reintentar}>
                  Reintentar
                </Button>
              }
            />
          )}
        </>
      )}
    </section>
  );
}
