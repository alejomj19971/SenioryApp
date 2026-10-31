import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../compartido/dominio/id.js';

export type MedicamentoId = Id<'Medicamento'>;

export const LARGO_MAXIMO_DEL_NOMBRE = 150;
export const LARGO_MAXIMO_DE_LA_DOSIS = 100;
export const LARGO_MAXIMO_DE_LAS_INDICACIONES = 500;
export const HORARIOS_MAXIMOS = 8;

// Caracteres de control y los que invierten el sentido de lectura (U+202A–202E y U+2066–2069).
const PROHIBIDOS = /[\p{Cc}‪-‮⁦-⁩]/u;
const FORMATO_DE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Una hora del día en formato «HH:mm» (24 horas). La hora de pared de la zona del negocio: no lleva fecha ni zona.
export type HoraDelDia = string & { readonly __marca: 'HoraDelDia' };

export function horaDelDia(texto: string): HoraDelDia {
  // Postgres entrega `time` como «HH:MM:SS»: se descartan los segundos.
  const recortada = /^\d{2}:\d{2}:\d{2}$/.test(texto)
    ? texto.slice(0, 5)
    : texto;
  if (!FORMATO_DE_HORA.test(recortada)) {
    throw new ErrorDeValidacion(
      'La hora debe tener el formato HH:mm (de 00:00 a 23:59)',
      'medicamento.hora_invalida',
    );
  }
  return recortada as HoraDelDia;
}

export interface DatosDeMedicamento {
  id: MedicamentoId;
  // Una persona de `identidad`.
  adultoMayorId: string;
  nombre: string;
  dosis: string;
  indicaciones: string | null;
  // A qué horas se toma cada día que aplica: «08:00», «20:00».
  horarios: readonly HoraDelDia[];
  // 1 = lunes … 7 = domingo.
  diasDeLaSemana: readonly number[];
  vigenteDesde: FechaCivil;
  vigenteHasta: FechaCivil | null;
  activo: boolean;
  creadoPor: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosParaRegistrarMedicamento {
  id: MedicamentoId;
  adultoMayorId: string;
  nombre: string;
  dosis: string;
  indicaciones?: string | null;
  horarios: readonly string[];
  // Si no viene, todos los días.
  diasDeLaSemana?: readonly number[];
  vigenteDesde: FechaCivil;
  vigenteHasta?: FechaCivil | null;
  creadoPor: string;
  ahora: Date;
}

// Un medicamento del plan de una persona mayor: qué, cuánto, a qué horas y qué días. Es un dato de salud
// (Ley 1581, art. 6): solo se lee a través de la política de acceso, y nunca sale en un log ni en un aviso.
export class Medicamento {
  private constructor(private datos: DatosDeMedicamento) {}

  static registrar(entrada: DatosParaRegistrarMedicamento): Medicamento {
    const horarios = [...new Set(entrada.horarios.map(horaDelDia))].sort();
    if (horarios.length === 0 || horarios.length > HORARIOS_MAXIMOS) {
      throw new ErrorDeValidacion(
        `Un medicamento debe tener entre 1 y ${HORARIOS_MAXIMOS} horarios`,
        'medicamento.horarios_invalidos',
      );
    }
    const dias = [...new Set(entrada.diasDeLaSemana ?? [1, 2, 3, 4, 5, 6, 7])]
      .map((dia) => {
        if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
          throw new ErrorDeValidacion(
            'Los días van de 1 (lunes) a 7 (domingo)',
            'medicamento.dias_invalidos',
          );
        }
        return dia;
      })
      .sort((a, b) => a - b);
    if (dias.length === 0) {
      throw new ErrorDeValidacion(
        'El medicamento debe tomarse al menos un día de la semana',
        'medicamento.dias_invalidos',
      );
    }
    const vigenteHasta = entrada.vigenteHasta ?? null;
    if (
      vigenteHasta !== null &&
      vigenteHasta.esAnteriorA(entrada.vigenteDesde)
    ) {
      throw new ErrorDeValidacion(
        'El medicamento no puede terminar antes de empezar',
        'medicamento.vigencia_invalida',
      );
    }
    return new Medicamento({
      id: entrada.id,
      adultoMayorId: entrada.adultoMayorId,
      nombre: texto(entrada.nombre, 'nombre', LARGO_MAXIMO_DEL_NOMBRE),
      dosis: texto(entrada.dosis, 'dosis', LARGO_MAXIMO_DE_LA_DOSIS),
      indicaciones: indicaciones(entrada.indicaciones),
      horarios,
      diasDeLaSemana: dias,
      vigenteDesde: entrada.vigenteDesde,
      vigenteHasta,
      activo: true,
      creadoPor: entrada.creadoPor,
      creadoEn: entrada.ahora,
      actualizadoEn: entrada.ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeMedicamento): Medicamento {
    return new Medicamento({ ...datos });
  }

  get id(): MedicamentoId {
    return this.datos.id;
  }
  get adultoMayorId(): string {
    return this.datos.adultoMayorId;
  }
  get nombre(): string {
    return this.datos.nombre;
  }
  get dosis(): string {
    return this.datos.dosis;
  }
  get indicaciones(): string | null {
    return this.datos.indicaciones;
  }
  get horarios(): readonly HoraDelDia[] {
    return this.datos.horarios;
  }
  get diasDeLaSemana(): readonly number[] {
    return this.datos.diasDeLaSemana;
  }
  get vigenteDesde(): FechaCivil {
    return this.datos.vigenteDesde;
  }
  get vigenteHasta(): FechaCivil | null {
    return this.datos.vigenteHasta;
  }
  get activo(): boolean {
    return this.datos.activo;
  }
  get creadoPor(): string {
    return this.datos.creadoPor;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  // ¿Hay que tomarlo ese día? Activo, dentro de su vigencia y en un día de la semana que le toca.
  aplicaEl(fecha: FechaCivil): boolean {
    return (
      this.datos.activo &&
      !fecha.esAnteriorA(this.datos.vigenteDesde) &&
      (this.datos.vigenteHasta === null ||
        !this.datos.vigenteHasta.esAnteriorA(fecha)) &&
      this.datos.diasDeLaSemana.includes(diaDeLaSemana(fecha))
    );
  }

  // Se deja de tomar: no se borra, para conservar el historial de tomas.
  desactivar(ahora: Date): void {
    this.datos.activo = false;
    this.datos.actualizadoEn = ahora;
  }
}

// 1 = lunes … 7 = domingo.
export function diaDeLaSemana(fecha: FechaCivil): number {
  const dia = new Date(
    Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia),
  ).getUTCDay();
  return dia === 0 ? 7 : dia;
}

function texto(valor: string, campo: string, maximo: number): string {
  const limpio = valor.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const largo = Array.from(limpio).length;
  if (largo < 1 || largo > maximo || PROHIBIDOS.test(limpio)) {
    throw new ErrorDeValidacion(
      `El ${campo} debe tener entre 1 y ${maximo} caracteres`,
      `medicamento.${campo}_invalido`,
    );
  }
  return limpio;
}

function indicaciones(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpio = valor.normalize('NFC').trim();
  if (limpio === '') return null;
  if (
    Array.from(limpio).length > LARGO_MAXIMO_DE_LAS_INDICACIONES ||
    /[\p{Cc}‪-‮⁦-⁩]/u.test(limpio.replace(/[\n\r\t]/g, ' '))
  ) {
    throw new ErrorDeValidacion(
      `Las indicaciones no pueden pasar de ${LARGO_MAXIMO_DE_LAS_INDICACIONES} caracteres`,
      'medicamento.indicaciones_invalidas',
    );
  }
  return limpio;
}
