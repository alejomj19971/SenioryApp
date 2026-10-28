import { ErrorDeValidacion } from './errores.js';

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILISEGUNDOS_POR_DIA = 86_400_000;

// Un día del calendario, sin hora ni zona horaria (docs/backend/M0 §4.6). Corresponde a las columnas
// `date` de la base, como la fecha de un servicio o la de una toma de medicamento.
//
// «Hoy» depende del lugar: a las 8 p. m. del 21 de octubre en Bogotá ya es 22 en UTC. Por eso `hoy()`
// pide la zona del negocio (hallazgo H2 del plan general).
export class FechaCivil {
  private constructor(
    readonly anio: number,
    readonly mes: number,
    readonly dia: number,
  ) {}

  // Acepta solo "AAAA-MM-DD" y rechaza días que no existen (30 de febrero, 29 en años no bisiestos).
  static desdeTexto(texto: string): FechaCivil {
    const partes = FORMATO.exec(texto);
    if (partes === null) {
      throw new ErrorDeValidacion(
        `La fecha debe tener el formato AAAA-MM-DD (recibido: "${texto}")`,
        'fecha.formato_invalido',
      );
    }
    const [anio, mes, dia] = [partes[1], partes[2], partes[3]].map(Number) as [
      number,
      number,
      number,
    ];
    if (
      anio < 1 ||
      mes < 1 ||
      mes > 12 ||
      dia < 1 ||
      dia > diasDelMes(anio, mes)
    ) {
      throw new ErrorDeValidacion(
        `La fecha ${texto} no existe en el calendario`,
        'fecha.inexistente',
      );
    }
    return new FechaCivil(anio, mes, dia);
  }

  // Recibe cualquier objeto con `ahora()` (el puerto Reloj lo cumple) sin importar la capa de
  // aplicación: el dominio no depende de ella (regla dominio-puro, M0 §4.9).
  static hoy(reloj: { ahora(): Date }, zonaHoraria: string): FechaCivil {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(reloj.ahora());
    const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
      Number(partes.find((parte) => parte.type === tipo)?.value);
    return new FechaCivil(valor('year'), valor('month'), valor('day'));
  }

  esAnteriorA(otra: FechaCivil): boolean {
    return this.diasDesdeEpoca() < otra.diasDesdeEpoca();
  }

  // Años completos transcurridos desde esta fecha hasta `hasta` (la edad de quien nació hoy).
  // Quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos. Si `hasta` es
  // anterior a esta fecha, el resultado es negativo.
  aniosCumplidosA(hasta: FechaCivil): number {
    const aniosDeDiferencia = hasta.anio - this.anio;
    const aunNoCumple =
      hasta.mes < this.mes || (hasta.mes === this.mes && hasta.dia < this.dia);
    return aunNoCumple ? aniosDeDiferencia - 1 : aniosDeDiferencia;
  }

  igualA(otra: FechaCivil): boolean {
    return this.diasDesdeEpoca() === otra.diasDesdeEpoca();
  }

  // Admite días negativos. Los cambios de mes, de año y los bisiestos los resuelve el calendario UTC,
  // que no tiene horario de verano: sumar días nunca se corre por una hora.
  sumarDias(dias: number): FechaCivil {
    if (!Number.isSafeInteger(dias)) {
      throw new ErrorDeValidacion(
        `Los días a sumar deben ser un número entero (recibido: ${dias})`,
        'fecha.dias_invalidos',
      );
    }
    const resultado = new Date(
      (this.diasDesdeEpoca() + dias) * MILISEGUNDOS_POR_DIA,
    );
    const anio = resultado.getUTCFullYear();
    if (Number.isNaN(anio) || anio < 1 || anio > 9999) {
      throw new ErrorDeValidacion(
        'La fecha resultante está fuera del rango admitido (años 1 a 9999)',
        'fecha.fuera_de_rango',
      );
    }
    return new FechaCivil(
      anio,
      resultado.getUTCMonth() + 1,
      resultado.getUTCDate(),
    );
  }

  aTexto(): string {
    return `${String(this.anio).padStart(4, '0')}-${dosCifras(this.mes)}-${dosCifras(this.dia)}`;
  }

  toString(): string {
    return this.aTexto();
  }

  private diasDesdeEpoca(): number {
    const fecha = new Date(0);
    // setUTCFullYear (y no Date.UTC) para que los años 0 a 99 no se lean como 1900 a 1999.
    fecha.setUTCFullYear(this.anio, this.mes - 1, this.dia);
    return Math.round(fecha.getTime() / MILISEGUNDOS_POR_DIA);
  }
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  const dias = [
    31,
    esBisiesto(anio) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return dias[mes - 1] ?? 0;
}

function dosCifras(numero: number): string {
  return String(numero).padStart(2, '0');
}
