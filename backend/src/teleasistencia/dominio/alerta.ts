import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { Id } from '../../compartido/dominio/id.js';
import type { OrigenDeAlerta } from '../../compartido/eventos/teleasistencia.js';

export type AlertaId = Id<'Alerta'>;

export const ESTADOS_DE_ALERTA = [
  'generada',
  'notificada',
  'atendida',
] as const;
export type EstadoDeAlerta = (typeof ESTADOS_DE_ALERTA)[number];

// De dónde puede pedir ayuda una persona. Los otros dos orígenes de la base («signos» y «medicamento») son de
// alertas que genera el sistema.
export const ORIGENES_PEDIDOS_POR_PERSONAS = ['boton', 'voz'] as const;

export const LARGO_MAXIMO_DE_LA_NOTA = 300;
const FORMATO_DE_CLAVE = /^[A-Za-z0-9._:-]{8,100}$/;

export interface DatosDeAlerta {
  id: AlertaId;
  adultoMayorId: string;
  origen: OrigenDeAlerta;
  estado: EstadoDeAlerta;
  generadaPor: string;
  // La genera el cliente: un reintento por mala conexión no crea dos alertas (H7).
  claveDeIdempotencia: string;
  generadaEn: Date;
  // Cuándo salió el primer aviso. Con `generadaEn` mide E11 (menos de 30 s en el 95 % de los casos).
  primeraEntregaEn: Date | null;
  atendidaPor: string | null;
  atendidaEn: Date | null;
  nota: string | null;
}

export interface DatosParaGenerarAlerta {
  id: AlertaId;
  adultoMayorId: string;
  origen: OrigenDeAlerta;
  generadaPor: string;
  claveDeIdempotencia: string;
  ahora: Date;
}

// Un pedido de ayuda. No es un servicio de emergencias: avisa a la familia y al cuidador en turno.
//
//   generada ──(sale el primer aviso)──▶ notificada ──atender──▶ atendida
//   generada ──atender──▶ atendida
export class Alerta {
  private constructor(private datos: DatosDeAlerta) {}

  static generar(entrada: DatosParaGenerarAlerta): Alerta {
    if (!FORMATO_DE_CLAVE.test(entrada.claveDeIdempotencia)) {
      throw new ErrorDeValidacion(
        'La clave de idempotencia debe tener de 8 a 100 caracteres (letras, números y . _ : -)',
        'alerta.clave_invalida',
      );
    }
    return new Alerta({
      id: entrada.id,
      adultoMayorId: entrada.adultoMayorId,
      origen: entrada.origen,
      estado: 'generada',
      generadaPor: entrada.generadaPor,
      claveDeIdempotencia: entrada.claveDeIdempotencia,
      generadaEn: entrada.ahora,
      primeraEntregaEn: null,
      atendidaPor: null,
      atendidaEn: null,
      nota: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeAlerta): Alerta {
    return new Alerta({ ...datos });
  }

  get id(): AlertaId {
    return this.datos.id;
  }
  get adultoMayorId(): string {
    return this.datos.adultoMayorId;
  }
  get origen(): OrigenDeAlerta {
    return this.datos.origen;
  }
  get estado(): EstadoDeAlerta {
    return this.datos.estado;
  }
  get generadaPor(): string {
    return this.datos.generadaPor;
  }
  get claveDeIdempotencia(): string {
    return this.datos.claveDeIdempotencia;
  }
  get generadaEn(): Date {
    return this.datos.generadaEn;
  }
  get primeraEntregaEn(): Date | null {
    return this.datos.primeraEntregaEn;
  }
  get atendidaPor(): string | null {
    return this.datos.atendidaPor;
  }
  get atendidaEn(): Date | null {
    return this.datos.atendidaEn;
  }
  get nota(): string | null {
    return this.datos.nota;
  }

  // Sin atender todavía.
  estaAbierta(): boolean {
    return this.datos.estado !== 'atendida';
  }

  // Salió el primer aviso. Solo cuenta el primero: los de los demás canales llegan después. Si ya la atendieron,
  // el aviso tardío no cambia nada. Devuelve si cambió algo.
  registrarEntrega(cuando: Date): boolean {
    if (this.datos.primeraEntregaEn !== null) return false;
    // Un reloj que va un poco atrás no puede dejar la entrega antes de la generación (CHECK de la base).
    this.datos.primeraEntregaEn =
      cuando < this.datos.generadaEn ? this.datos.generadaEn : cuando;
    if (this.datos.estado === 'generada') this.datos.estado = 'notificada';
    return true;
  }

  atender(usuarioId: string, ahora: Date, nota?: string | null): void {
    if (this.datos.estado === 'atendida') {
      throw new ConflictoDeEstado(
        'Esa alerta ya fue atendida',
        'alerta.ya_atendida',
      );
    }
    this.datos.estado = 'atendida';
    this.datos.atendidaPor = usuarioId;
    this.datos.atendidaEn = ahora;
    this.datos.nota = limpiarNota(nota);
  }
}

function limpiarNota(nota: string | null | undefined): string | null {
  if (nota === undefined || nota === null) return null;
  const limpia = nota.normalize('NFC').trim();
  if (limpia === '') return null;
  if (Array.from(limpia).length > LARGO_MAXIMO_DE_LA_NOTA) {
    throw new ErrorDeValidacion(
      `La nota no puede pasar de ${LARGO_MAXIMO_DE_LA_NOTA} caracteres`,
      'alerta.nota_muy_larga',
    );
  }
  return limpia;
}
