import {
  Notificacion,
  type NotificacionId,
} from '../../../dominio/notificacion.js';
import {
  CANALES,
  ESTADOS_DE_NOTIFICACION,
  PRIORIDADES,
  type Parametros,
} from '../../../dominio/valores-cerrados.js';
import type { notificaciones } from './notificaciones.esquema.js';

// Convierte una fila de la base de datos en un objeto de dominio. Lo que sale de la base ya pasó por el dominio
// al guardarse y por los CHECK de la tabla; si un valor no es válido es que la base está dañada, y se falla con
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

function parametrosDe(valor: unknown): Parametros {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error('Valor inesperado en la base de datos: parametros');
  }
  return valor as Parametros;
}

export function notificacionDeFila(
  fila: typeof notificaciones.$inferSelect,
): Notificacion {
  return Notificacion.reconstruir({
    id: fila.id as NotificacionId,
    destinatarioId: fila.destinatarioId,
    eventoId: fila.eventoId,
    tipo: fila.tipo,
    prioridad: exigir(fila.prioridad, PRIORIDADES, 'prioridad'),
    canal: exigir(fila.canal, CANALES, 'canal'),
    estado: exigir(fila.estado, ESTADOS_DE_NOTIFICACION, 'estado'),
    parametros: parametrosDe(fila.parametros),
    intentos: fila.intentos,
    proximoIntentoEn: fila.proximoIntentoEn,
    creadaEn: fila.creadaEn,
    enviadaEn: fila.enviadaEn,
    entregadaEn: fila.entregadaEn,
    ultimoError: fila.ultimoError,
  });
}
