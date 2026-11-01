import type {
  CanalDeNotificacion,
  MensajeParaEnviar,
  ResultadoDeEnvio,
} from '../../src/notificaciones/aplicacion/puertos/salida/canal-de-notificacion.js';
import type {
  CursorDeNotificaciones,
  IntentoDeEnvio,
  PaginaDeNotificaciones,
  RepositorioNotificaciones,
} from '../../src/notificaciones/aplicacion/puertos/salida/repositorio-notificaciones.js';
import {
  Notificacion,
  type NotificacionId,
} from '../../src/notificaciones/dominio/notificacion.js';
import type {
  Canal,
  Parametros,
  Prioridad,
} from '../../src/notificaciones/dominio/valores-cerrados.js';
import { idDePrueba } from './identidad.js';

// Dobles y datos de prueba de Notificaciones: sin base de datos ni red.

export const PARAMETROS_DE_SERVICIO: Parametros = {
  servicioId: '0198aaaa-0000-7000-8000-0000000000e1',
  fecha: '2030-06-11',
  jornada: 'manana',
  horas: 2,
};

export function avisoDePrueba(
  cambios: Partial<{
    destinatarioId: string;
    eventoId: string;
    tipo: string;
    prioridad: Prioridad;
    canal: Canal;
    parametros: Parametros;
    ahora: Date;
  }> = {},
): Notificacion {
  return Notificacion.crear({
    id: idDePrueba<'Notificacion'>() as NotificacionId,
    destinatarioId: '0198aaaa-0000-7000-8000-0000000000f1',
    eventoId: idDePrueba<'Evento'>(),
    tipo: 'servicio_confirmado:familia',
    prioridad: 'normal',
    canal: 'app',
    parametros: PARAMETROS_DE_SERVICIO,
    ahora: new Date('2026-10-21T15:00:00.000Z'),
    ...cambios,
  });
}

interface Registro {
  aviso: Notificacion;
  intentos: IntentoDeEnvio[];
}

// El repositorio en memoria: hace lo mismo que el de Postgres (omite repetidos, reserva al tomar) sin base de datos.
export class RepositorioNotificacionesEnMemoria implements RepositorioNotificaciones {
  readonly registros: Registro[] = [];

  avisos(): Notificacion[] {
    return this.registros.map((r) => r.aviso);
  }

  intentosDe(aviso: Notificacion): IntentoDeEnvio[] {
    return this.registros.find((r) => r.aviso.id === aviso.id)?.intentos ?? [];
  }

  crear(avisos: readonly Notificacion[]): Promise<number> {
    let creados = 0;
    for (const aviso of avisos) {
      const repetido = this.registros.some(
        (r) =>
          r.aviso.eventoId === aviso.eventoId &&
          r.aviso.destinatarioId === aviso.destinatarioId &&
          r.aviso.tipo === aviso.tipo &&
          r.aviso.canal === aviso.canal,
      );
      if (!repetido) {
        this.registros.push({ aviso, intentos: [] });
        creados += 1;
      }
    }
    return Promise.resolve(creados);
  }

  reclamarPendientes(
    ahora: Date,
    limite: number,
    _reservaMs: number,
  ): Promise<Notificacion[]> {
    const tomadas = this.avisos()
      .filter((a) => a.estado === 'pendiente' && a.proximoIntentoEn <= ahora)
      .slice(0, limite);
    return Promise.resolve(tomadas);
  }

  registrarIntento(
    aviso: Notificacion,
    intento: IntentoDeEnvio,
  ): Promise<void> {
    this.registros.find((r) => r.aviso.id === aviso.id)?.intentos.push(intento);
    return Promise.resolve();
  }

  delMismoAviso(aviso: Notificacion): Promise<Notificacion[]> {
    return Promise.resolve(
      this.avisos().filter(
        (a) =>
          a.eventoId === aviso.eventoId &&
          a.destinatarioId === aviso.destinatarioId &&
          a.tipo === aviso.tipo,
      ),
    );
  }

  contarRecientes(destinatarioId: string, desde: Date): Promise<number> {
    return Promise.resolve(
      this.avisos().filter(
        (a) => a.destinatarioId === destinatarioId && a.creadaEn >= desde,
      ).length,
    );
  }

  existeAvisoDeConversacion(
    destinatarioId: string,
    tipo: string,
    conversacionId: string,
    desde: Date,
  ): Promise<boolean> {
    return Promise.resolve(
      this.avisos().some(
        (a) =>
          a.destinatarioId === destinatarioId &&
          a.tipo === tipo &&
          a.parametros.conversacionId === conversacionId &&
          a.creadaEn >= desde,
      ),
    );
  }

  listarDe(
    _destinatarioId: string,
    _canal: Canal,
    _limite: number,
    _cursor: CursorDeNotificaciones | null,
  ): Promise<PaginaDeNotificaciones> {
    return Promise.resolve({ notificaciones: [], siguiente: null });
  }

  buscarPorId(id: NotificacionId): Promise<Notificacion | null> {
    return Promise.resolve(this.avisos().find((a) => a.id === id) ?? null);
  }
}

// Un canal programable: responde lo que la prueba le diga y recuerda lo que le pidieron enviar.
export class CanalFalso implements CanalDeNotificacion {
  readonly enviados: MensajeParaEnviar[] = [];
  respuesta: () => Promise<ResultadoDeEnvio> = () =>
    Promise.resolve('entregada');

  constructor(readonly canal: Canal) {}

  enviar(mensaje: MensajeParaEnviar): Promise<ResultadoDeEnvio> {
    this.enviados.push(mensaje);
    return this.respuesta();
  }
}
