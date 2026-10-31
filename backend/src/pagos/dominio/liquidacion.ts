import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { LiquidacionId } from './ids.js';

// Los mismos valores que el CHECK de `pagos.liquidaciones`.
export const ESTADOS_DE_LIQUIDACION = [
  'pendiente',
  'enviada',
  'pagada',
  'fallida',
] as const;
export type EstadoDeLiquidacion = (typeof ESTADOS_DE_LIQUIDACION)[number];

export interface DatosDeLiquidacion {
  id: LiquidacionId;
  // El cuidador en `directorio` y el servicio en `reservas`.
  cuidadorId: string;
  servicioId: string;
  // Pesos enteros: lo que se le debe al cuidador por ese servicio.
  monto: number;
  estado: EstadoDeLiquidacion;
  referenciaDispersion: string | null;
  creadaEn: Date;
  pagadaEn: Date | null;
}

// Lo que se le debe al cuidador por un servicio terminado. Hay una por servicio.
//
//   pendiente ── enviar ──▶ enviada ── pagar ──▶ pagada
//        │                     └────── fallar ─▶ fallida ── reintentar ──▶ pendiente
//        └─ (el dispersor la pagó de una) ──▶ pagada
export class Liquidacion {
  private constructor(private datos: DatosDeLiquidacion) {}

  static crear(entrada: {
    id: LiquidacionId;
    cuidadorId: string;
    servicioId: string;
    monto: number;
    ahora: Date;
  }): Liquidacion {
    if (!Number.isSafeInteger(entrada.monto) || entrada.monto <= 0) {
      throw new ErrorDeValidacion(
        'El monto de la liquidación debe ser un número entero de pesos mayor que cero',
        'liquidacion.monto_invalido',
      );
    }
    return new Liquidacion({
      id: entrada.id,
      cuidadorId: entrada.cuidadorId,
      servicioId: entrada.servicioId,
      monto: entrada.monto,
      estado: 'pendiente',
      referenciaDispersion: null,
      creadaEn: entrada.ahora,
      pagadaEn: null,
    });
  }

  static reconstruir(datos: DatosDeLiquidacion): Liquidacion {
    return new Liquidacion({ ...datos });
  }

  get id(): LiquidacionId {
    return this.datos.id;
  }
  get cuidadorId(): string {
    return this.datos.cuidadorId;
  }
  get servicioId(): string {
    return this.datos.servicioId;
  }
  get monto(): number {
    return this.datos.monto;
  }
  get estado(): EstadoDeLiquidacion {
    return this.datos.estado;
  }
  get referenciaDispersion(): string | null {
    return this.datos.referenciaDispersion;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get pagadaEn(): Date | null {
    return this.datos.pagadaEn;
  }

  // El dispersor recibió la orden de pago, pero el dinero todavía no llega.
  registrarEnvio(referencia: string): void {
    this.exigir('pendiente', 'enviar');
    this.datos.estado = 'enviada';
    this.datos.referenciaDispersion = referencia;
  }

  // El dinero llegó al cuidador. Se acepta desde «pendiente» porque un dispersor puede pagar en el mismo acto.
  registrarPago(referencia: string, ahora: Date): void {
    if (this.datos.estado !== 'pendiente' && this.datos.estado !== 'enviada') {
      throw new ConflictoDeEstado(
        `Una liquidación ${this.datos.estado} no se puede marcar como pagada`,
        'liquidacion.transicion_invalida',
      );
    }
    this.datos.estado = 'pagada';
    this.datos.referenciaDispersion = referencia;
    this.datos.pagadaEn = ahora;
  }

  // El dispersor la rechazó de forma definitiva (los errores pasajeros no pasan por aquí: se reintentan solos).
  fallar(): void {
    if (this.datos.estado !== 'pendiente' && this.datos.estado !== 'enviada') {
      throw new ConflictoDeEstado(
        `Una liquidación ${this.datos.estado} no puede fallar`,
        'liquidacion.transicion_invalida',
      );
    }
    this.datos.estado = 'fallida';
  }

  reintentar(): void {
    this.exigir('fallida', 'reintentar');
    this.datos.estado = 'pendiente';
    this.datos.referenciaDispersion = null;
  }

  private exigir(estado: EstadoDeLiquidacion, accion: string): void {
    if (this.datos.estado !== estado) {
      throw new ConflictoDeEstado(
        `Una liquidación ${this.datos.estado} no se puede ${accion}`,
        'liquidacion.transicion_invalida',
      );
    }
  }
}
