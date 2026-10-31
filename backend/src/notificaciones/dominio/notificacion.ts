import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { Id } from '../../compartido/dominio/id.js';
import {
  CANALES,
  PRIORIDADES,
  type Canal,
  type EstadoDeNotificacion,
  type Parametros,
  type Prioridad,
} from './valores-cerrados.js';

export type NotificacionId = Id<'Notificacion'>;

// Cuántas veces se intenta enviar un aviso antes de darlo por fallido.
export const MAXIMO_DE_INTENTOS = 5;

// Espera antes del reintento número N (en segundos): crece rápido porque casi todos los fallos son del
// proveedor y se resuelven solos en minutos.
const ESPERA_DE_REINTENTO_SEGUNDOS = [30, 120, 600, 1_800] as const;

export function esperaDeReintentoMs(intentosHechos: number): number {
  const indice = Math.min(
    Math.max(intentosHechos - 1, 0),
    ESPERA_DE_REINTENTO_SEGUNDOS.length - 1,
  );
  return (ESPERA_DE_REINTENTO_SEGUNDOS[indice] as number) * 1_000;
}

const LARGO_MAXIMO_DEL_ERROR = 500;

export interface DatosDeNotificacion {
  id: NotificacionId;
  // Una cuenta de `identidad`.
  destinatarioId: string;
  // El evento del outbox que originó el aviso: con el destinatario, el tipo y el canal evita repetirlo.
  eventoId: string;
  // «servicio_confirmado:familia»: qué dice y a quién.
  tipo: string;
  prioridad: Prioridad;
  canal: Canal;
  estado: EstadoDeNotificacion;
  parametros: Parametros;
  intentos: number;
  proximoIntentoEn: Date;
  creadaEn: Date;
  enviadaEn: Date | null;
  entregadaEn: Date | null;
  ultimoError: string | null;
}

export interface DatosParaCrearNotificacion {
  id: NotificacionId;
  destinatarioId: string;
  eventoId: string;
  tipo: string;
  prioridad: Prioridad;
  canal: Canal;
  parametros: Parametros;
  ahora: Date;
}

// Un aviso a una persona por un canal. Cada canal es una notificación aparte: así cada uno tiene su propio
// estado, sus intentos y su reintento, y una alerta puede salir por varios canales a la vez.
export class Notificacion {
  private constructor(private datos: DatosDeNotificacion) {}

  static crear(datos: DatosParaCrearNotificacion): Notificacion {
    if (!(CANALES as readonly string[]).includes(datos.canal)) {
      throw new ErrorDeValidacion(
        'El canal no es válido',
        'notificacion.canal_invalido',
      );
    }
    if (!(PRIORIDADES as readonly string[]).includes(datos.prioridad)) {
      throw new ErrorDeValidacion(
        'La prioridad no es válida',
        'notificacion.prioridad_invalida',
      );
    }
    if (datos.tipo.trim() === '') {
      throw new ErrorDeValidacion(
        'El tipo del aviso es obligatorio',
        'notificacion.tipo_invalido',
      );
    }
    return new Notificacion({
      id: datos.id,
      destinatarioId: datos.destinatarioId,
      eventoId: datos.eventoId,
      tipo: datos.tipo,
      prioridad: datos.prioridad,
      canal: datos.canal,
      estado: 'pendiente',
      parametros: { ...datos.parametros },
      intentos: 0,
      proximoIntentoEn: datos.ahora,
      creadaEn: datos.ahora,
      enviadaEn: null,
      entregadaEn: null,
      ultimoError: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeNotificacion): Notificacion {
    return new Notificacion({ ...datos, parametros: { ...datos.parametros } });
  }

  get id(): NotificacionId {
    return this.datos.id;
  }
  get destinatarioId(): string {
    return this.datos.destinatarioId;
  }
  get eventoId(): string {
    return this.datos.eventoId;
  }
  get tipo(): string {
    return this.datos.tipo;
  }
  get prioridad(): Prioridad {
    return this.datos.prioridad;
  }
  get canal(): Canal {
    return this.datos.canal;
  }
  get estado(): EstadoDeNotificacion {
    return this.datos.estado;
  }
  get parametros(): Parametros {
    return this.datos.parametros;
  }
  get intentos(): number {
    return this.datos.intentos;
  }
  get proximoIntentoEn(): Date {
    return this.datos.proximoIntentoEn;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get enviadaEn(): Date | null {
    return this.datos.enviadaEn;
  }
  get entregadaEn(): Date | null {
    return this.datos.entregadaEn;
  }
  get ultimoError(): string | null {
    return this.datos.ultimoError;
  }

  // Ya no hay nada más que hacer con ella.
  esFinal(): boolean {
    return this.datos.estado !== 'pendiente';
  }

  // Quedó confirmada o aceptada por el proveedor: sirve para saber si una alerta llegó por algún canal.
  salio(): boolean {
    return this.datos.estado === 'enviada' || this.datos.estado === 'entregada';
  }

  // Llegó a la persona (el canal lo confirmó).
  marcarEntregada(ahora: Date): void {
    this.exigirPendiente();
    this.datos.intentos += 1;
    this.datos.estado = 'entregada';
    this.datos.enviadaEn = ahora;
    this.datos.entregadaEn = ahora;
    this.datos.ultimoError = null;
  }

  // El proveedor la aceptó, pero todavía no confirma la entrega.
  marcarEnviada(ahora: Date): void {
    this.exigirPendiente();
    this.datos.intentos += 1;
    this.datos.estado = 'enviada';
    this.datos.enviadaEn = ahora;
    this.datos.ultimoError = null;
  }

  // El intento falló: se reintenta con espera creciente hasta agotar los intentos. Devuelve si quedó
  // pendiente para otro intento o si se agotó (queda «fallida»).
  registrarFallo(ahora: Date, motivo: string): 'reintentar' | 'agotada' {
    this.exigirPendiente();
    this.datos.intentos += 1;
    this.datos.ultimoError = recortar(motivo);
    if (this.datos.intentos >= MAXIMO_DE_INTENTOS) {
      this.datos.estado = 'fallida';
      return 'agotada';
    }
    this.datos.proximoIntentoEn = new Date(
      ahora.getTime() + esperaDeReintentoMs(this.datos.intentos),
    );
    return 'reintentar';
  }

  // Un fallo que reintentar no arregla (la persona no tiene teléfono): queda «fallida» de una vez.
  registrarFalloDefinitivo(motivo: string): void {
    this.exigirPendiente();
    this.datos.intentos += 1;
    this.datos.ultimoError = recortar(motivo);
    this.datos.estado = 'fallida';
  }

  private exigirPendiente(): void {
    if (this.datos.estado !== 'pendiente') {
      throw new ErrorDeValidacion(
        `Un aviso ${this.datos.estado} ya no admite más intentos`,
        'notificacion.no_pendiente',
      );
    }
  }
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/gu, ' ').trim();
  return Array.from(limpio).slice(0, LARGO_MAXIMO_DEL_ERROR).join('');
}
