import type { Alerta } from '../dominio/alerta.js';
import type { Medicamento } from '../dominio/medicamento.js';
import type { LecturaDeSignos } from '../dominio/signos.js';
import type { Toma } from '../dominio/toma.js';

// Lo que sale de Teleasistencia hacia la API. Son listas blancas: quién registró algo es un ID, nunca un nombre;
// y nada de esto viaja en un aviso ni en un log.

export interface VistaDeToma {
  id: string;
  horaProgramada: string;
  estado: 'pendiente' | 'tomada' | 'omitida';
  registradaEn: string | null;
}

export interface VistaDeMedicamento {
  id: string;
  nombre: string;
  dosis: string;
  indicaciones: string | null;
  horarios: string[];
  diasDeLaSemana: number[];
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export interface VistaDeMedicamentoDelDia extends VistaDeMedicamento {
  // Las tomas de ese día; vacío si hoy no le toca.
  tomas: VistaDeToma[];
}

export interface VistaDeLectura {
  id: string;
  tomadaEn: string;
  presionSistolica: number | null;
  presionDiastolica: number | null;
  frecuenciaCardiaca: number | null;
  glucosa: number | null;
  fueraDeRango: boolean;
  fuente: 'manual' | 'dispositivo';
}

export interface VistaDeAlerta {
  id: string;
  origen: string;
  estado: 'generada' | 'notificada' | 'atendida';
  generadaEn: string;
  primeraEntregaEn: string | null;
  atendidaEn: string | null;
  nota: string | null;
}

export interface VistaDeAlertaGenerada extends VistaDeAlerta {
  // A quién se avisó (nombres): la pantalla de la alerta siempre lo dice.
  avisadosA: string[];
}

export interface VistaDeResumen {
  fecha: string;
  tomasDeHoy: {
    total: number;
    tomadas: number;
    pendientes: number;
    omitidas: number;
  };
  // La próxima toma pendiente de hoy, o null si no queda ninguna.
  proximaToma: {
    medicamentoId: string;
    nombre: string;
    horaProgramada: string;
  } | null;
  ultimaLectura: {
    tomadaEn: string;
    fueraDeRango: boolean;
  } | null;
  alertasSinAtender: number;
}

export function vistaDeMedicamento(m: Medicamento): VistaDeMedicamento {
  return {
    id: m.id,
    nombre: m.nombre,
    dosis: m.dosis,
    indicaciones: m.indicaciones,
    horarios: [...m.horarios],
    diasDeLaSemana: [...m.diasDeLaSemana],
    vigenteDesde: m.vigenteDesde.aTexto(),
    vigenteHasta: m.vigenteHasta?.aTexto() ?? null,
  };
}

export function vistaDeToma(t: Toma): VistaDeToma {
  return {
    id: t.id,
    horaProgramada: t.horaProgramada,
    estado: t.estado,
    registradaEn: t.registradaEn?.toISOString() ?? null,
  };
}

export function vistaDeLectura(l: LecturaDeSignos): VistaDeLectura {
  return {
    id: l.id,
    tomadaEn: l.tomadaEn.toISOString(),
    presionSistolica: l.presionSistolica,
    presionDiastolica: l.presionDiastolica,
    frecuenciaCardiaca: l.frecuenciaCardiaca,
    glucosa: l.glucosa,
    fueraDeRango: l.fueraDeRango,
    fuente: l.fuente,
  };
}

export function vistaDeAlerta(a: Alerta): VistaDeAlerta {
  return {
    id: a.id,
    origen: a.origen,
    estado: a.estado,
    generadaEn: a.generadaEn.toISOString(),
    primeraEntregaEn: a.primeraEntregaEn?.toISOString() ?? null,
    atendidaEn: a.atendidaEn?.toISOString() ?? null,
    nota: a.nota,
  };
}
