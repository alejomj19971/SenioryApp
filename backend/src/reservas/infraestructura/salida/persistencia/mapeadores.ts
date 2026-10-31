import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../../../compartido/dominio/id.js';
import {
  esJornada,
  type Jornada,
} from '../../../../compartido/dominio/jornada.js';
import {
  MOTIVOS_DE_CANCELACION,
  type MotivoDeCancelacion,
} from '../../../../compartido/eventos/reservas.js';
import { Calificacion } from '../../../dominio/calificacion.js';
import { Servicio } from '../../../dominio/servicio.js';
import {
  ESTADOS_DE_SERVICIO,
  MEDIOS_DE_PAGO,
} from '../../../dominio/valores-cerrados.js';
import type { calificaciones, servicios } from './reservas.esquema.js';

// Convierte filas de la base de datos en objetos de dominio. Lo que sale de la base ya pasó por el dominio al
// guardarse y por los CHECK de las tablas; si un valor no es válido es que la base está dañada, y se falla con
// un error claro en lugar de seguir con datos inconsistentes.

function exigir<T extends string>(
  valor: string,
  validos: readonly T[],
  campo: string,
): T {
  const encontrado = validos.find((v) => v === valor);
  if (encontrado === undefined) {
    throw new Error(
      `Valor inesperado en la base de datos: ${campo} = "${valor}"`,
    );
  }
  return encontrado;
}

function jornadaDe(valor: string): Jornada {
  if (!esJornada(valor)) {
    throw new Error(
      `Valor inesperado en la base de datos: jornada = "${valor}"`,
    );
  }
  return valor;
}

function motivoDe(valor: string | null): MotivoDeCancelacion | null {
  return valor === null
    ? null
    : exigir(valor, MOTIVOS_DE_CANCELACION, 'motivo_cancelacion');
}

export function servicioDeFila(fila: typeof servicios.$inferSelect): Servicio {
  return Servicio.reconstruir({
    id: fila.id as Id<'Servicio'>,
    familiarId: fila.familiarId,
    adultoMayorId: fila.adultoMayorId,
    cuidadorId: fila.cuidadorId,
    fecha: FechaCivil.desdeTexto(fila.fecha),
    jornada: jornadaDe(fila.jornada),
    horas: fila.horas,
    estado: exigir(fila.estado, ESTADOS_DE_SERVICIO, 'estado'),
    medioDePago: exigir(fila.medioDePago, MEDIOS_DE_PAGO, 'medio_de_pago'),
    aceptacionAutomatica: fila.aceptacionAutomatica,
    solicitudExpiraEn: fila.solicitudExpiraEn,
    tarifaHora: fila.tarifaHora,
    subtotal: fila.subtotal,
    cargoFamilia: fila.cargoFamilia,
    totalFamilia: fila.totalFamilia,
    pagoProfesional: fila.pagoProfesional,
    politicaVersion: fila.politicaVersion,
    claveDeIdempotencia: fila.claveIdempotencia,
    pagadoEn: fila.pagadoEn,
    solicitadoEn: fila.solicitadoEn,
    aceptadoEn: fila.aceptadoEn,
    iniciadoEn: fila.iniciadoEn,
    finalizadoEn: fila.finalizadoEn,
    canceladoEn: fila.canceladoEn,
    canceladoPor: fila.canceladoPor,
    motivoDeCancelacion: motivoDe(fila.motivoCancelacion),
    version: fila.version,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  });
}

export function calificacionDeFila(
  fila: typeof calificaciones.$inferSelect,
): Calificacion {
  return Calificacion.reconstruir({
    servicioId: fila.servicioId as Id<'Servicio'>,
    familiarId: fila.familiarId,
    calificacion: fila.calificacion,
    comentario: fila.comentario,
    creadaEn: fila.creadaEn,
  });
}
