"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { SelectorHoras, type FechaSeleccion } from "@/components/contratacion/selector-horas";
import { ResumenCosto } from "@/components/contratacion/resumen-costo";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { calificarServicioAccion, cancelarServicioAccion, modificarServicioAccion } from "@/lib/acciones/servicios";
import { horasPedibles, sumarDias, type AhoraEnColombia } from "@/lib/fecha-colombia";
import { useCotizacion } from "@/lib/hooks/use-cotizacion";
import { cn } from "@/lib/utils";
import type { Cotizacion, Jornada } from "@/lib/types";

// Cancelar la solicitud (mientras esté solicitada o aceptada). Pide confirmación: no se puede deshacer.
export function CancelarServicio({ servicioId, yaSeCobro }: { servicioId: string; yaSeCobro: boolean }) {
  const enrutador = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancelar() {
    empezar(async () => {
      const resultado = await cancelarServicioAccion(servicioId);
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
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>Cancelar el servicio</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cancelar este servicio?</DialogTitle>
          <DialogDescription>
            {yaSeCobro ? "Si ya se cobró, el dinero vuelve a ti." : "No se te cobra nada."} Esto no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {error !== null && <Aviso titulo="No pudimos cancelarlo" descripcion={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            No, mantenerlo
          </Button>
          <Button variant="destructive" onClick={cancelar} disabled={pendiente}>
            {pendiente ? "Cancelando…" : "Sí, cancelar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ServicioAModificar {
  id: string;
  fecha: string;
  horaInicio: number;
  horas: number;
  cuidadorId: string;
  tarifaHora: number;
  subtotal: number;
  cargoDeServicio: number;
  totalFamilia: number;
}

// Cambiar fecha/hora/horas de una solicitud que el cuidador todavía no respondió, sin tener que cancelarla y
// pedir una nueva. El cuidador y el medio de pago no se pueden cambiar aquí.
export function ModificarServicio({
  servicio,
  disponibilidad,
  ahora,
}: {
  servicio: ServicioAModificar;
  disponibilidad: Jornada[];
  ahora: AhoraEnColombia;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const manana = sumarDias(ahora.hoy, 1);
  const fechaSeleccionInicial: FechaSeleccion = servicio.fecha === ahora.hoy ? "hoy" : servicio.fecha === manana ? "manana" : "elegir";
  const [fechaSeleccion, setFechaSeleccion] = useState<FechaSeleccion>(fechaSeleccionInicial);
  const [fechaPersonalizada, setFechaPersonalizada] = useState(servicio.fecha);
  const [horaInicio, setHoraInicio] = useState<number | null>(servicio.horaInicio);
  const [horas, setHoras] = useState(servicio.horas);

  const fecha = fechaSeleccion === "hoy" ? ahora.hoy : fechaSeleccion === "manana" ? manana : fechaPersonalizada;
  const horasDisponibles = useMemo(() => horasPedibles(fecha, disponibilidad, ahora), [fecha, disponibilidad, ahora]);
  const horaElegida = horaInicio !== null && horasDisponibles.includes(horaInicio) ? horaInicio : (horasDisponibles[0] ?? null);

  const cargoPorcentaje = servicio.subtotal === 0 ? 0 : Math.round((servicio.cargoDeServicio / servicio.subtotal) * 1000) / 10;
  const cotizacionInicial: Cotizacion = {
    cuidadorId: servicio.cuidadorId,
    horas: servicio.horas,
    tarifaHora: servicio.tarifaHora,
    subtotal: servicio.subtotal,
    cargoPorcentaje,
    cargo: servicio.cargoDeServicio,
    totalFamilia: servicio.totalFamilia,
  };
  const { cotizacion, cotizando, errorDeCotizacion, reintentar } = useCotizacion(servicio.cuidadorId, horas, cotizacionInicial);

  const puedeGuardar = horaElegida !== null && cotizacion !== null && !cotizando && !pendiente;

  function guardar() {
    if (horaElegida === null) return;
    empezar(async () => {
      const resultado = await modificarServicioAccion(servicio.id, { fecha, horaInicio: horaElegida, horas });
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setAbierto(false);
      setError(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>Modificar fecha u hora</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modificar la solicitud</DialogTitle>
          <DialogDescription>El cuidador todavía no la ha respondido: puedes cambiar la fecha, la hora o la duración.</DialogDescription>
        </DialogHeader>

        <SelectorHoras
          fechaSeleccion={fechaSeleccion}
          onFechaSeleccionChange={setFechaSeleccion}
          fechaPersonalizada={fechaPersonalizada}
          onFechaPersonalizadaChange={setFechaPersonalizada}
          fechaMinima={ahora.hoy}
          horasPedibles={horasDisponibles}
          horaInicio={horaElegida}
          onHoraInicioChange={setHoraInicio}
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
        {error !== null && <Aviso titulo="No pudimos guardar los cambios" descripcion={error} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!puedeGuardar}>
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Calificar un servicio terminado (una sola vez). De 1 a 5 estrellas y un comentario opcional.
export function CalificarServicio({ servicioId }: { servicioId: string }) {
  const enrutador = useRouter();
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    if (estrellas === 0) {
      setError("Elige de 1 a 5 estrellas.");
      return;
    }
    empezar(async () => {
      const resultado = await calificarServicioAccion(servicioId, estrellas, comentario);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setError(null);
      enrutador.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-border">
      <h2 className="text-lg font-semibold text-foreground">¿Cómo te fue?</h2>
      <div role="radiogroup" aria-label="Calificación de 1 a 5 estrellas" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((valor) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={estrellas === valor}
            aria-label={`${valor} ${valor === 1 ? "estrella" : "estrellas"}`}
            onClick={() => setEstrellas(valor)}
            className="flex size-12 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Star className={cn("size-8", valor <= estrellas ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="comentario">Un comentario (opcional)</Label>
        <textarea
          id="comentario"
          value={comentario}
          onChange={(evento) => setComentario(evento.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-input bg-card p-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-sm text-muted-foreground">Lo verán otras familias junto a tu nombre abreviado.</p>
      </div>
      {error !== null && <Aviso titulo="No pudimos guardar tu calificación" descripcion={error} />}
      <Button type="button" size="lg" onClick={enviar} disabled={pendiente}>
        {pendiente ? "Enviando…" : "Enviar calificación"}
      </Button>
    </div>
  );
}
