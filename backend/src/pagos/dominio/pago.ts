import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { PagoId } from './ids.js';

// Los mismos valores que los CHECK de `pagos.pagos`; una prueba los compara con la base.
export const ESTADOS_DE_PAGO = [
  'pendiente',
  'aprobado',
  'rechazado',
  'expirado',
  'reembolsado',
] as const;
export type EstadoDePago = (typeof ESTADOS_DE_PAGO)[number];

export const CONCEPTOS_DE_PAGO = ['servicio', 'bolsa'] as const;
export type ConceptoDePago = (typeof CONCEPTOS_DE_PAGO)[number];

export const MEDIOS_DEL_PAGO = ['pasarela', 'bolsa'] as const;
export type MedioDelPago = (typeof MEDIOS_DEL_PAGO)[number];

const FORMATO_DE_CLAVE = /^[A-Za-z0-9._:-]{8,100}$/;

export interface DatosDePago {
  id: PagoId;
  concepto: ConceptoDePago;
  // Del concepto «servicio»; la bolsa lleva en cambio el código del paquete.
  servicioId: string | null;
  paqueteCodigo: string | null;
  // La cuenta de la familia que paga.
  pagadorId: string;
  medio: MedioDelPago;
  // Pesos enteros. Lo que paga la familia.
  montoTotal: number;
  // Solo en un servicio: cuánto de ese total es del cuidador y cuánto de la plataforma (E10).
  pagoProfesional: number | null;
  ingresoPlataforma: number | null;
  politicaVersion: number | null;
  estado: EstadoDePago;
  proveedor: string | null;
  referenciaProveedor: string | null;
  claveDeIdempotencia: string;
  aprobadoEn: Date | null;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosParaPagarUnServicio {
  id: PagoId;
  servicioId: string;
  pagadorId: string;
  medio: MedioDelPago;
  montoTotal: number;
  pagoProfesional: number;
  politicaVersion: number;
  ahora: Date;
}

export interface DatosParaComprarUnaBolsa {
  id: PagoId;
  paqueteCodigo: string;
  pagadorId: string;
  montoTotal: number;
  claveDeIdempotencia: string;
  ahora: Date;
}

// Un pago: lo que la familia paga por un servicio o por una bolsa de horas.
//
//   pendiente ── aprobar ──▶ aprobado ── reembolsar ──▶ reembolsado
//       ├────── rechazar ──▶ rechazado
//       └────── expirar ───▶ expirado
//
// Solo avanza: un pago aprobado no vuelve a pendiente, y uno rechazado o vencido no se aprueba (un aviso tardío de
// la pasarela se atiende aparte). Cada cambio sube la versión y el repositorio guarda con bloqueo optimista.
export class Pago {
  private readonly leidaEnVersion: number;

  private constructor(
    private datos: DatosDePago,
    versionLeida: number,
  ) {
    this.leidaEnVersion = versionLeida;
  }

  // El pago de un servicio recién confirmado. La clave de idempotencia sale del servicio: confirmar dos veces el
  // mismo servicio (un evento repetido) nunca cobra dos veces.
  static paraServicio(entrada: DatosParaPagarUnServicio): Pago {
    exigirMonto(entrada.montoTotal);
    if (
      !Number.isSafeInteger(entrada.pagoProfesional) ||
      entrada.pagoProfesional < 0 ||
      entrada.pagoProfesional > entrada.montoTotal
    ) {
      throw new ErrorDeValidacion(
        'El pago al cuidador no puede ser negativo ni mayor que el total',
        'pago.desglose_incoherente',
      );
    }
    if (
      !Number.isInteger(entrada.politicaVersion) ||
      entrada.politicaVersion < 1
    ) {
      throw new ErrorDeValidacion(
        'La versión de la política de precios no es válida',
        'pago.desglose_incoherente',
      );
    }
    return new Pago(
      {
        id: entrada.id,
        concepto: 'servicio',
        servicioId: entrada.servicioId,
        paqueteCodigo: null,
        pagadorId: entrada.pagadorId,
        medio: entrada.medio,
        montoTotal: entrada.montoTotal,
        pagoProfesional: entrada.pagoProfesional,
        ingresoPlataforma: entrada.montoTotal - entrada.pagoProfesional,
        politicaVersion: entrada.politicaVersion,
        estado: 'pendiente',
        proveedor: null,
        referenciaProveedor: null,
        claveDeIdempotencia: `servicio:${entrada.servicioId}`,
        aprobadoEn: null,
        version: 1,
        creadoEn: entrada.ahora,
        actualizadoEn: entrada.ahora,
      },
      0,
    );
  }

  // La compra de una bolsa. Siempre se paga con la pasarela: una bolsa no se compra con otra bolsa.
  static paraBolsa(entrada: DatosParaComprarUnaBolsa): Pago {
    exigirMonto(entrada.montoTotal);
    if (!FORMATO_DE_CLAVE.test(entrada.claveDeIdempotencia)) {
      throw new ErrorDeValidacion(
        'La clave de idempotencia debe tener de 8 a 100 caracteres (letras, números y . _ : -)',
        'pago.clave_invalida',
      );
    }
    return new Pago(
      {
        id: entrada.id,
        concepto: 'bolsa',
        servicioId: null,
        paqueteCodigo: entrada.paqueteCodigo,
        pagadorId: entrada.pagadorId,
        medio: 'pasarela',
        montoTotal: entrada.montoTotal,
        pagoProfesional: null,
        ingresoPlataforma: null,
        politicaVersion: null,
        estado: 'pendiente',
        proveedor: null,
        referenciaProveedor: null,
        claveDeIdempotencia: entrada.claveDeIdempotencia,
        aprobadoEn: null,
        version: 1,
        creadoEn: entrada.ahora,
        actualizadoEn: entrada.ahora,
      },
      0,
    );
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDePago): Pago {
    return new Pago({ ...datos }, datos.version);
  }

  get id(): PagoId {
    return this.datos.id;
  }
  get concepto(): ConceptoDePago {
    return this.datos.concepto;
  }
  get servicioId(): string | null {
    return this.datos.servicioId;
  }
  get paqueteCodigo(): string | null {
    return this.datos.paqueteCodigo;
  }
  get pagadorId(): string {
    return this.datos.pagadorId;
  }
  get medio(): MedioDelPago {
    return this.datos.medio;
  }
  get montoTotal(): number {
    return this.datos.montoTotal;
  }
  get pagoProfesional(): number | null {
    return this.datos.pagoProfesional;
  }
  get ingresoPlataforma(): number | null {
    return this.datos.ingresoPlataforma;
  }
  get politicaVersion(): number | null {
    return this.datos.politicaVersion;
  }
  get estado(): EstadoDePago {
    return this.datos.estado;
  }
  get proveedor(): string | null {
    return this.datos.proveedor;
  }
  get referenciaProveedor(): string | null {
    return this.datos.referenciaProveedor;
  }
  get claveDeIdempotencia(): string {
    return this.datos.claveDeIdempotencia;
  }
  get aprobadoEn(): Date | null {
    return this.datos.aprobadoEn;
  }
  get version(): number {
    return this.datos.version;
  }
  get versionLeida(): number {
    return this.leidaEnVersion;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }

  // Cuándo deja de poder pagarse.
  venceEn(minutosParaPagar: number): Date {
    return new Date(this.datos.creadoEn.getTime() + minutosParaPagar * 60_000);
  }

  estaPendiente(): boolean {
    return this.datos.estado === 'pendiente';
  }

  // Queda anotada la referencia con la que la pasarela conoce este pago. Se puede repetir con los mismos valores
  // (pedir el enlace dos veces), pero no cambiar.
  asociarReferencia(proveedor: string, referencia: string, ahora: Date): void {
    this.exigirPendiente('asociar a un cobro');
    if (this.datos.referenciaProveedor !== null) {
      if (
        this.datos.proveedor === proveedor &&
        this.datos.referenciaProveedor === referencia
      ) {
        return;
      }
      throw new ConflictoDeEstado(
        'Este pago ya está asociado a otro cobro de la pasarela',
        'pago.referencia_distinta',
      );
    }
    this.datos.proveedor = proveedor;
    this.datos.referenciaProveedor = referencia;
    this.avanzar(this.datos.estado, ahora);
  }

  aprobar(ahora: Date): void {
    this.exigirPendiente('aprobar');
    this.datos.aprobadoEn = ahora;
    this.avanzar('aprobado', ahora);
  }

  rechazar(ahora: Date): void {
    this.exigirPendiente('rechazar');
    this.avanzar('rechazado', ahora);
  }

  expirar(ahora: Date): void {
    this.exigirPendiente('vencer');
    this.avanzar('expirado', ahora);
  }

  reembolsar(ahora: Date): void {
    if (this.datos.estado !== 'aprobado') {
      throw new ConflictoDeEstado(
        'Solo se puede reembolsar un pago aprobado',
        'pago.no_reembolsable',
      );
    }
    this.avanzar('reembolsado', ahora);
  }

  private exigirPendiente(accion: string): void {
    if (this.datos.estado !== 'pendiente') {
      throw new ConflictoDeEstado(
        `Un pago ${this.datos.estado} no se puede ${accion}`,
        'pago.transicion_invalida',
      );
    }
  }

  private avanzar(estado: EstadoDePago, ahora: Date): void {
    this.datos.estado = estado;
    this.datos.version += 1;
    this.datos.actualizadoEn = ahora;
  }
}

function exigirMonto(monto: number): void {
  if (!Number.isSafeInteger(monto) || monto <= 0) {
    throw new ErrorDeValidacion(
      'El monto del pago debe ser un número entero de pesos mayor que cero',
      'pago.monto_invalido',
    );
  }
}
