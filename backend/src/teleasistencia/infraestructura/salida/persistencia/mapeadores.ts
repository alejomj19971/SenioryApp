import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import { ORIGENES_DE_ALERTA } from '../../../../compartido/eventos/teleasistencia.js';
import {
  Alerta,
  ESTADOS_DE_ALERTA,
  type AlertaId,
} from '../../../dominio/alerta.js';
import {
  horaDelDia,
  Medicamento,
  type MedicamentoId,
} from '../../../dominio/medicamento.js';
import {
  FUENTES_DE_LECTURA,
  LecturaDeSignos,
  type LecturaId,
  type RangosDeReferencia,
} from '../../../dominio/signos.js';
import { ESTADOS_DE_TOMA, Toma, type TomaId } from '../../../dominio/toma.js';
import type {
  alertas,
  lecturasSignos,
  medicamentos,
  rangosDeReferencia,
  tomas,
} from './teleasistencia.esquema.js';

// Convierte filas de la base de datos en objetos de dominio. Lo que sale de la base ya pasó por el dominio al
// guardarse y por los CHECK de las tablas; si un valor no es válido es que la base está dañada, y se falla con un
// error claro en lugar de seguir con datos inconsistentes.

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

export function medicamentoDeFila(
  fila: typeof medicamentos.$inferSelect,
  horarios: readonly string[],
): Medicamento {
  return Medicamento.reconstruir({
    id: fila.id as MedicamentoId,
    adultoMayorId: fila.adultoMayorId,
    nombre: fila.nombre,
    dosis: fila.dosis,
    indicaciones: fila.indicaciones,
    horarios: horarios.map(horaDelDia).sort(),
    diasDeLaSemana: [...fila.diasSemana].sort((a, b) => a - b),
    vigenteDesde: FechaCivil.desdeTexto(fila.vigenteDesde),
    vigenteHasta:
      fila.vigenteHasta === null
        ? null
        : FechaCivil.desdeTexto(fila.vigenteHasta),
    activo: fila.activo,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  });
}

export function tomaDeFila(fila: typeof tomas.$inferSelect): Toma {
  return Toma.reconstruir({
    id: fila.id as TomaId,
    medicamentoId: fila.medicamentoId as MedicamentoId,
    adultoMayorId: fila.adultoMayorId,
    fecha: FechaCivil.desdeTexto(fila.fecha),
    horaProgramada: horaDelDia(fila.horaProgramada),
    estado: exigir(fila.estado, ESTADOS_DE_TOMA, 'estado'),
    registradaPor: fila.registradaPor,
    registradaEn: fila.registradaEn,
    version: fila.version,
    creadaEn: fila.creadaEn,
  });
}

export function lecturaDeFila(
  fila: typeof lecturasSignos.$inferSelect,
): LecturaDeSignos {
  return LecturaDeSignos.reconstruir({
    id: fila.id as LecturaId,
    adultoMayorId: fila.adultoMayorId,
    tomadaEn: fila.tomadaEn,
    presionSistolica: fila.presionSistolica,
    presionDiastolica: fila.presionDiastolica,
    frecuenciaCardiaca: fila.frecuenciaCardiaca,
    glucosa: fila.glucosa,
    fueraDeRango: fila.fueraDeRango,
    fuente: exigir(fila.fuente, FUENTES_DE_LECTURA, 'fuente'),
    registradaPor: fila.registradaPor,
    creadaEn: fila.creadaEn,
  });
}

export function rangosDeFila(
  fila: typeof rangosDeReferencia.$inferSelect,
): RangosDeReferencia {
  return {
    sistolicaMin: fila.sistolicaMin,
    sistolicaMax: fila.sistolicaMax,
    diastolicaMin: fila.diastolicaMin,
    diastolicaMax: fila.diastolicaMax,
    frecuenciaMin: fila.frecuenciaMin,
    frecuenciaMax: fila.frecuenciaMax,
    glucosaMin: fila.glucosaMin,
    glucosaMax: fila.glucosaMax,
  };
}

export function alertaDeFila(fila: typeof alertas.$inferSelect): Alerta {
  return Alerta.reconstruir({
    id: fila.id as AlertaId,
    adultoMayorId: fila.adultoMayorId,
    origen: exigir(fila.origen, ORIGENES_DE_ALERTA, 'origen'),
    estado: exigir(fila.estado, ESTADOS_DE_ALERTA, 'estado'),
    generadaPor: fila.generadaPor,
    claveDeIdempotencia: fila.claveIdempotencia,
    generadaEn: fila.generadaEn,
    primeraEntregaEn: fila.primeraEntregaEn,
    atendidaPor: fila.atendidaPor,
    atendidaEn: fila.atendidaEn,
    nota: fila.nota,
  });
}
