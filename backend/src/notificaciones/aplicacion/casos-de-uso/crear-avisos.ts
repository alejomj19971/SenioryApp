import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import {
  Notificacion,
  type NotificacionId,
} from '../../dominio/notificacion.js';
import type {
  Canal,
  Parametros,
  Prioridad,
} from '../../dominio/valores-cerrados.js';
import type { CanalDeNotificacion } from '../puertos/salida/canal-de-notificacion.js';
import type { RepositorioNotificaciones } from '../puertos/salida/repositorio-notificaciones.js';

// Por dónde sale un aviso normal: la aplicación y el correo. SMS y WhatsApp cuestan por mensaje y se reservan
// para lo que no puede esperar (las alertas).
export const CANALES_DE_AVISOS_NORMALES: readonly Canal[] = ['app', 'correo'];

// Tope de avisos normales por persona y hora: un error en un manejador no debe inundar a nadie. Las alertas no
// tienen tope: nunca se descarta una.
export const AVISOS_NORMALES_POR_HORA = 60;
const UNA_HORA_MS = 3_600_000;

export interface EntradaDeAviso {
  // El evento del outbox que lo originó.
  eventoId: string;
  destinatarioId: string;
  // «evento:rol», por ejemplo `servicio_confirmado:familia`.
  tipo: string;
  prioridad: Prioridad;
  parametros: Parametros;
}

// Crea los avisos de una persona, uno por canal. Un aviso normal sale por los canales normales que haya en este
// entorno; una alerta (prioridad alta) sale por TODOS los disponibles a la vez, para que llegue por al menos uno.
// Reprocesar el mismo evento no repite nada: la base ignora el aviso que ya existe.
//
// Solo guarda: el envío lo hace `EntregarPendientes`, fuera de esta transacción (nunca se habla con un
// proveedor con una transacción abierta).
export class CrearAvisos {
  constructor(
    private readonly notificaciones: RepositorioNotificaciones,
    private readonly canales: readonly CanalDeNotificacion[],
    private readonly ids: GeneradorDeIds,
    private readonly reloj: Reloj,
  ) {}

  // Devuelve cuántos avisos nuevos se crearon.
  async ejecutar(entrada: EntradaDeAviso): Promise<number> {
    const ahora = this.reloj.ahora();
    if (entrada.prioridad === 'normal') {
      const recientes = await this.notificaciones.contarRecientes(
        entrada.destinatarioId,
        new Date(ahora.getTime() - UNA_HORA_MS),
      );
      if (recientes >= AVISOS_NORMALES_POR_HORA) return 0;
    }
    const canales = this.canalesPara(entrada.prioridad);
    return this.notificaciones.crear(
      canales.map((canal) =>
        Notificacion.crear({
          id: this.ids.nuevo<'Notificacion'>() as NotificacionId,
          destinatarioId: entrada.destinatarioId,
          eventoId: entrada.eventoId,
          tipo: entrada.tipo,
          prioridad: entrada.prioridad,
          canal,
          parametros: entrada.parametros,
          ahora,
        }),
      ),
    );
  }

  private canalesPara(prioridad: Prioridad): Canal[] {
    const disponibles = this.canales.map((c) => c.canal);
    return prioridad === 'alta'
      ? disponibles
      : disponibles.filter((canal) =>
          CANALES_DE_AVISOS_NORMALES.includes(canal),
        );
  }
}
