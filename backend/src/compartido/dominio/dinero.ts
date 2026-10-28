import { ErrorDeValidacion } from './errores.js';

const PUNTOS_BASICOS_POR_UNIDAD = 10_000n; // 10 000 bps = 100 %

// Dinero en pesos colombianos enteros, nunca negativo (docs/backend/M0 §4.6).
// Coincide con las columnas `bigint` de la base: sin decimales y sin errores de redondeo.
// Es inmutable: cada operación devuelve un Dinero nuevo.
export class Dinero {
  private constructor(private readonly pesosEnteros: number) {}

  static pesos(valor: number): Dinero {
    return new Dinero(exigirMonto(valor));
  }

  static cero(): Dinero {
    return new Dinero(0);
  }

  get valor(): number {
    return this.pesosEnteros;
  }

  sumar(otro: Dinero): Dinero {
    return Dinero.pesos(this.pesosEnteros + otro.pesosEnteros);
  }

  // Falla si el resultado sería negativo: un saldo nunca queda por debajo de cero.
  restar(otro: Dinero): Dinero {
    if (otro.pesosEnteros > this.pesosEnteros) {
      throw new ErrorDeValidacion(
        `No se pueden restar ${otro.pesosEnteros} pesos de ${this.pesosEnteros}: el resultado sería negativo`,
        'dinero.negativo',
      );
    }
    return new Dinero(this.pesosEnteros - otro.pesosEnteros);
  }

  // Multiplica por un entero no negativo (por ejemplo, la tarifa por las horas del servicio).
  multiplicarPor(factor: number): Dinero {
    if (!Number.isSafeInteger(factor) || factor < 0) {
      throw new ErrorDeValidacion(
        `El factor debe ser un entero no negativo (recibido: ${factor})`,
        'dinero.factor_invalido',
      );
    }
    return Dinero.pesos(this.pesosEnteros * factor);
  }

  // Porcentaje expresado en puntos básicos (800 = 8 %), redondeado al peso más cercano
  // con la mitad hacia arriba. Se calcula con BigInt para que el producto intermedio no pierda precisión.
  porcentaje(puntosBasicos: number): Dinero {
    if (
      !Number.isInteger(puntosBasicos) ||
      puntosBasicos < 0 ||
      BigInt(puntosBasicos) > PUNTOS_BASICOS_POR_UNIDAD
    ) {
      throw new ErrorDeValidacion(
        `El porcentaje debe ser un entero entre 0 y 10000 puntos básicos (recibido: ${puntosBasicos})`,
        'dinero.porcentaje_invalido',
      );
    }
    const producto = BigInt(this.pesosEnteros) * BigInt(puntosBasicos);
    const redondeado =
      (producto * 2n + PUNTOS_BASICOS_POR_UNIDAD) /
      (PUNTOS_BASICOS_POR_UNIDAD * 2n);
    return new Dinero(Number(redondeado));
  }

  igualA(otro: Dinero): boolean {
    return this.pesosEnteros === otro.pesosEnteros;
  }

  toString(): string {
    return `${this.pesosEnteros} COP`;
  }
}

function exigirMonto(valor: number): number {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    throw new ErrorDeValidacion(
      `Un monto debe ser un número entero de pesos, mayor o igual a cero (recibido: ${valor})`,
      'dinero.monto_invalido',
    );
  }
  return valor;
}
