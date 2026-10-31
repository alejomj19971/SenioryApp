import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { Id } from '../../compartido/dominio/id.js';

export type LecturaId = Id<'Lectura'>;

export const FUENTES_DE_LECTURA = ['manual', 'dispositivo'] as const;
export type FuenteDeLectura = (typeof FUENTES_DE_LECTURA)[number];

// Rangos PLAUSIBLES: detectan errores de digitación (una presión de 1200), no condiciones clínicas. Los mismos
// que el CHECK `lecturas_rangos_plausibles` de la base de datos; una prueba los compara.
export const RANGOS_PLAUSIBLES = {
  sistolica: { min: 50, max: 260 },
  diastolica: { min: 30, max: 160 },
  frecuencia: { min: 20, max: 250 },
  glucosa: { min: 20, max: 600 },
} as const;

// Hasta cuándo hacia atrás se acepta una lectura, y cuánta diferencia de reloj se tolera hacia adelante.
export const DIAS_MAXIMOS_HACIA_ATRAS = 30;
export const MARGEN_HACIA_ADELANTE_MINUTOS = 5;

// Los límites de «normal» de una persona. Cada extremo es opcional: sin él, esa medida no se evalúa por ese lado.
export interface RangosDeReferencia {
  sistolicaMin: number | null;
  sistolicaMax: number | null;
  diastolicaMin: number | null;
  diastolicaMax: number | null;
  frecuenciaMin: number | null;
  frecuenciaMax: number | null;
  glucosaMin: number | null;
  glucosaMax: number | null;
}

// ⚠️ PROVISIONALES. Son los valores de uso general de las guías de práctica para adultos y SOLO existen para que
// la función no quede muerta. Los umbrales clínicos los define un profesional de salud (decisión abierta): hay que
// revisarlos con uno ANTES de lanzar, y lo ideal es que cada persona tenga los suyos (`rangos_de_referencia`).
export const RANGOS_POR_DEFECTO: RangosDeReferencia = {
  sistolicaMin: 90,
  sistolicaMax: 140,
  diastolicaMin: 60,
  diastolicaMax: 90,
  frecuenciaMin: 50,
  frecuenciaMax: 100,
  glucosaMin: 70,
  glucosaMax: 180,
};

// Valida que los rangos de una persona tengan sentido: cada mínimo por debajo de su máximo.
export function validarRangos(rangos: RangosDeReferencia): RangosDeReferencia {
  const pares: [number | null, number | null, string][] = [
    [rangos.sistolicaMin, rangos.sistolicaMax, 'sistólica'],
    [rangos.diastolicaMin, rangos.diastolicaMax, 'diastólica'],
    [rangos.frecuenciaMin, rangos.frecuenciaMax, 'frecuencia cardiaca'],
    [rangos.glucosaMin, rangos.glucosaMax, 'glucosa'],
  ];
  for (const [min, max, nombre] of pares) {
    for (const valor of [min, max]) {
      if (valor !== null && (!Number.isInteger(valor) || valor <= 0)) {
        throw new ErrorDeValidacion(
          `Los límites de ${nombre} deben ser enteros positivos`,
          'rangos.limite_invalido',
        );
      }
    }
    if (min !== null && max !== null && min >= max) {
      throw new ErrorDeValidacion(
        `El mínimo de ${nombre} debe ser menor que el máximo`,
        'rangos.minimo_mayor_que_maximo',
      );
    }
  }
  return { ...rangos };
}

export interface DatosDeLectura {
  id: LecturaId;
  adultoMayorId: string;
  tomadaEn: Date;
  presionSistolica: number | null;
  presionDiastolica: number | null;
  frecuenciaCardiaca: number | null;
  glucosa: number | null;
  fueraDeRango: boolean;
  fuente: FuenteDeLectura;
  registradaPor: string | null;
  creadaEn: Date;
}

export interface DatosParaRegistrarLectura {
  id: LecturaId;
  adultoMayorId: string;
  tomadaEn: Date;
  presionSistolica?: number | null;
  presionDiastolica?: number | null;
  frecuenciaCardiaca?: number | null;
  glucosa?: number | null;
  fuente: FuenteDeLectura;
  registradaPor: string;
  rangos: RangosDeReferencia;
  ahora: Date;
}

// Una medición de signos vitales. Las medidas son opcionales (un cuidador puede medir solo la presión, H8), pero la
// presión va completa (sistólica y diastólica) o no va. Es un dato de salud: solo se lee con la política de acceso.
export class LecturaDeSignos {
  private constructor(private readonly datos: DatosDeLectura) {}

  static registrar(entrada: DatosParaRegistrarLectura): LecturaDeSignos {
    const sistolica = medida(
      entrada.presionSistolica,
      RANGOS_PLAUSIBLES.sistolica,
      'la presión sistólica',
    );
    const diastolica = medida(
      entrada.presionDiastolica,
      RANGOS_PLAUSIBLES.diastolica,
      'la presión diastólica',
    );
    const frecuencia = medida(
      entrada.frecuenciaCardiaca,
      RANGOS_PLAUSIBLES.frecuencia,
      'la frecuencia cardiaca',
    );
    const glucosa = medida(
      entrada.glucosa,
      RANGOS_PLAUSIBLES.glucosa,
      'la glucosa',
    );
    if (sistolica === null && frecuencia === null && glucosa === null) {
      throw new ErrorDeValidacion(
        'Registra al menos una medida: presión, frecuencia cardiaca o glucosa',
        'lectura.sin_medidas',
      );
    }
    if ((sistolica === null) !== (diastolica === null)) {
      throw new ErrorDeValidacion(
        'La presión se registra completa: sistólica y diastólica',
        'lectura.presion_incompleta',
      );
    }
    if (sistolica !== null && diastolica !== null && diastolica >= sistolica) {
      throw new ErrorDeValidacion(
        'La presión diastólica debe ser menor que la sistólica',
        'lectura.presion_incoherente',
      );
    }
    validarMomento(entrada.tomadaEn, entrada.ahora);
    const lectura = {
      sistolica,
      diastolica,
      frecuencia,
      glucosa,
    };
    return new LecturaDeSignos({
      id: entrada.id,
      adultoMayorId: entrada.adultoMayorId,
      tomadaEn: entrada.tomadaEn,
      presionSistolica: sistolica,
      presionDiastolica: diastolica,
      frecuenciaCardiaca: frecuencia,
      glucosa,
      fueraDeRango: estaFueraDeRango(lectura, entrada.rangos),
      fuente: entrada.fuente,
      registradaPor: entrada.registradaPor,
      creadaEn: entrada.ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeLectura): LecturaDeSignos {
    return new LecturaDeSignos({ ...datos });
  }

  get id(): LecturaId {
    return this.datos.id;
  }
  get adultoMayorId(): string {
    return this.datos.adultoMayorId;
  }
  get tomadaEn(): Date {
    return this.datos.tomadaEn;
  }
  get presionSistolica(): number | null {
    return this.datos.presionSistolica;
  }
  get presionDiastolica(): number | null {
    return this.datos.presionDiastolica;
  }
  get frecuenciaCardiaca(): number | null {
    return this.datos.frecuenciaCardiaca;
  }
  get glucosa(): number | null {
    return this.datos.glucosa;
  }
  get fueraDeRango(): boolean {
    return this.datos.fueraDeRango;
  }
  get fuente(): FuenteDeLectura {
    return this.datos.fuente;
  }
  get registradaPor(): string | null {
    return this.datos.registradaPor;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
}

interface Medidas {
  sistolica: number | null;
  diastolica: number | null;
  frecuencia: number | null;
  glucosa: number | null;
}

// ¿Alguna medida sale de los rangos de la persona? Un extremo sin definir no cuenta por ese lado. Es la única
// definición de «fuera de rango»: la usa el registro y puede usarla cualquier reevaluación.
export function estaFueraDeRango(
  medidas: Medidas,
  rangos: RangosDeReferencia,
): boolean {
  const fuera = (
    valor: number | null,
    min: number | null,
    max: number | null,
  ) =>
    valor !== null &&
    ((min !== null && valor < min) || (max !== null && valor > max));
  return (
    fuera(medidas.sistolica, rangos.sistolicaMin, rangos.sistolicaMax) ||
    fuera(medidas.diastolica, rangos.diastolicaMin, rangos.diastolicaMax) ||
    fuera(medidas.frecuencia, rangos.frecuenciaMin, rangos.frecuenciaMax) ||
    fuera(medidas.glucosa, rangos.glucosaMin, rangos.glucosaMax)
  );
}

function medida(
  valor: number | null | undefined,
  plausible: { min: number; max: number },
  nombre: string,
): number | null {
  if (valor === undefined || valor === null) return null;
  if (
    !Number.isInteger(valor) ||
    valor < plausible.min ||
    valor > plausible.max
  ) {
    throw new ErrorDeValidacion(
      `El valor de ${nombre} debe ser un entero entre ${plausible.min} y ${plausible.max}`,
      'lectura.valor_implausible',
    );
  }
  return valor;
}

function validarMomento(tomadaEn: Date, ahora: Date): void {
  if (Number.isNaN(tomadaEn.getTime())) {
    throw new ErrorDeValidacion(
      'La fecha de la lectura no es válida',
      'lectura.fecha_invalida',
    );
  }
  const limiteAdelante =
    ahora.getTime() + MARGEN_HACIA_ADELANTE_MINUTOS * 60_000;
  if (tomadaEn.getTime() > limiteAdelante) {
    throw new ErrorDeValidacion(
      'La lectura no puede ser del futuro',
      'lectura.del_futuro',
    );
  }
  const limiteAtras = ahora.getTime() - DIAS_MAXIMOS_HACIA_ATRAS * 86_400_000;
  if (tomadaEn.getTime() < limiteAtras) {
    throw new ErrorDeValidacion(
      `La lectura no puede tener más de ${DIAS_MAXIMOS_HACIA_ATRAS} días`,
      'lectura.muy_antigua',
    );
  }
}
