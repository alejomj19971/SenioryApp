import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ReglaDeNegocioIncumplida,
} from '../../compartido/dominio/errores.js';
import type { BolsaId, MovimientoDeBolsaId } from './ids.js';

// Los mismos valores que el CHECK de `pagos.movimientos_de_bolsa`.
export const TIPOS_DE_MOVIMIENTO = [
  'compra',
  'reserva',
  'consumo',
  'liberacion',
  'ajuste',
] as const;
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number];

// Una línea del libro de la bolsa. Solo se inserta: un error se corrige con otro movimiento, nunca se edita.
export interface MovimientoDeBolsa {
  id: MovimientoDeBolsaId;
  bolsaId: BolsaId;
  tipo: TipoDeMovimiento;
  // Cuánto cambió el saldo disponible y el reservado. Las combinaciones válidas de cada tipo las fija la base.
  deltaDisponible: number;
  deltaReservado: number;
  servicioId: string | null;
  pagoId: string | null;
  creadoEn: Date;
}

export interface DatosDeBolsa {
  id: BolsaId;
  // La cuenta de la familia dueña de la bolsa.
  familiarId: string;
  // Lo que se puede gastar. Pesos enteros, nunca negativo.
  saldoDisponible: number;
  // Lo que está apartado para servicios ya confirmados y aún no prestados.
  saldoReservado: number;
  version: number;
  creadaEn: Date;
  actualizadaEn: Date;
}

// La bolsa de horas prepago de una familia.
//
//   compra     ── el pago de un paquete se aprobó: sube el disponible
//   reserva    ── se confirmó un servicio: el disponible pasa a reservado
//   consumo    ── el servicio terminó: el reservado se gasta
//   liberacion ── el servicio se canceló: el reservado vuelve a disponible
//
// Los saldos nunca quedan negativos: cada operación lo comprueba, y la base lo impide aunque el código falle. Cada
// operación deja su movimiento en `movimientosPendientes`, que el repositorio inserta en la misma transacción
// que actualiza el saldo.
export class Bolsa {
  private readonly nuevos: MovimientoDeBolsa[] = [];
  private readonly leidaEnVersion: number;

  private constructor(
    private datos: DatosDeBolsa,
    versionLeida: number,
  ) {
    this.leidaEnVersion = versionLeida;
  }

  static abrir(id: BolsaId, familiarId: string, ahora: Date): Bolsa {
    return new Bolsa(
      {
        id,
        familiarId,
        saldoDisponible: 0,
        saldoReservado: 0,
        version: 1,
        creadaEn: ahora,
        actualizadaEn: ahora,
      },
      0,
    );
  }

  static reconstruir(datos: DatosDeBolsa): Bolsa {
    return new Bolsa({ ...datos }, datos.version);
  }

  get id(): BolsaId {
    return this.datos.id;
  }
  get familiarId(): string {
    return this.datos.familiarId;
  }
  get saldoDisponible(): number {
    return this.datos.saldoDisponible;
  }
  get saldoReservado(): number {
    return this.datos.saldoReservado;
  }
  get version(): number {
    return this.datos.version;
  }
  get versionLeida(): number {
    return this.leidaEnVersion;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get actualizadaEn(): Date {
    return this.datos.actualizadaEn;
  }
  get movimientosPendientes(): readonly MovimientoDeBolsa[] {
    return this.nuevos;
  }

  alcanzaPara(monto: number): boolean {
    return this.datos.saldoDisponible >= monto;
  }

  acreditar(
    monto: number,
    pagoId: string,
    movimientoId: MovimientoDeBolsaId,
    ahora: Date,
  ): void {
    exigirMonto(monto);
    this.datos.saldoDisponible += monto;
    this.registrar(
      movimientoId,
      'compra',
      monto,
      0,
      { servicioId: null, pagoId },
      ahora,
    );
  }

  reservar(
    monto: number,
    servicioId: string,
    movimientoId: MovimientoDeBolsaId,
    ahora: Date,
  ): void {
    exigirMonto(monto);
    if (!this.alcanzaPara(monto)) {
      throw new ReglaDeNegocioIncumplida(
        'No tienes saldo suficiente en tu bolsa para este servicio',
        'bolsa.saldo_insuficiente',
      );
    }
    this.datos.saldoDisponible -= monto;
    this.datos.saldoReservado += monto;
    this.registrar(
      movimientoId,
      'reserva',
      -monto,
      monto,
      { servicioId, pagoId: null },
      ahora,
    );
  }

  consumir(
    monto: number,
    servicioId: string,
    movimientoId: MovimientoDeBolsaId,
    ahora: Date,
  ): void {
    exigirMonto(monto);
    this.exigirReservado(monto);
    this.datos.saldoReservado -= monto;
    this.registrar(
      movimientoId,
      'consumo',
      0,
      -monto,
      { servicioId, pagoId: null },
      ahora,
    );
  }

  liberar(
    monto: number,
    servicioId: string,
    movimientoId: MovimientoDeBolsaId,
    ahora: Date,
  ): void {
    exigirMonto(monto);
    this.exigirReservado(monto);
    this.datos.saldoReservado -= monto;
    this.datos.saldoDisponible += monto;
    this.registrar(
      movimientoId,
      'liberacion',
      monto,
      -monto,
      { servicioId, pagoId: null },
      ahora,
    );
  }

  private exigirReservado(monto: number): void {
    if (this.datos.saldoReservado < monto) {
      // No debería pasar: la reserva de un servicio siempre se hizo antes. Si pasa, los datos están mal y es
      // mejor detenerse que inventar saldo.
      throw new ConflictoDeEstado(
        'El saldo reservado de la bolsa no alcanza para esta operación',
        'bolsa.reserva_inconsistente',
      );
    }
  }

  private registrar(
    id: MovimientoDeBolsaId,
    tipo: TipoDeMovimiento,
    deltaDisponible: number,
    deltaReservado: number,
    origen: { servicioId: string | null; pagoId: string | null },
    ahora: Date,
  ): void {
    this.datos.version += 1;
    this.datos.actualizadaEn = ahora;
    this.nuevos.push({
      id,
      bolsaId: this.datos.id,
      tipo,
      deltaDisponible,
      deltaReservado,
      servicioId: origen.servicioId,
      pagoId: origen.pagoId,
      creadoEn: ahora,
    });
  }
}

export type SituacionDeReserva =
  | { situacion: 'sin_reserva' }
  | { situacion: 'reservada'; monto: number }
  | { situacion: 'consumida' }
  | { situacion: 'liberada' };

// En qué quedó el dinero apartado para un servicio, según los movimientos de ese servicio. Con ella los
// manejadores deciden si consumir o liberar, y reprocesar un evento no repite nada.
export function situacionDeReserva(
  movimientos: readonly MovimientoDeBolsa[],
): SituacionDeReserva {
  const reserva = movimientos.find((m) => m.tipo === 'reserva');
  if (reserva === undefined) return { situacion: 'sin_reserva' };
  if (movimientos.some((m) => m.tipo === 'consumo')) {
    return { situacion: 'consumida' };
  }
  if (movimientos.some((m) => m.tipo === 'liberacion')) {
    return { situacion: 'liberada' };
  }
  return { situacion: 'reservada', monto: reserva.deltaReservado };
}

function exigirMonto(monto: number): void {
  if (!Number.isSafeInteger(monto) || monto <= 0) {
    throw new ErrorDeValidacion(
      'El monto del movimiento debe ser un número entero de pesos mayor que cero',
      'bolsa.monto_invalido',
    );
  }
}
